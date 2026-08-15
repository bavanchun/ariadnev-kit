# 0006 — Provider verification is evidence, not citation

- Status: accepted
- Date: 2026-08-15

## Context

`spec-verified.ts` gates every write: a cell that is not verified makes the
installer skip and log rather than guess a path. That gate is only as good as
the claims behind it.

The claims cited two reference generators — `scripts/codex_generator*.py` and
`scripts/generate-opencode.py` — as their source. Neither file exists in this
repository, and `~/.agentkit/adapters/` holds only generated output, not the
generators. So no cell could be checked against its stated source, and no cell
recorded which provider version it was true for. A path that a provider stopped
reading two releases ago would look identical to one confirmed yesterday.

## Decision

Re-derive every cell from observation of the provider actually running, and
record the evidence in the table.

Three levels, because collapsing them is what allows self-certification:

| Level | Meaning |
|---|---|
| `observed` | The provider was run and seen to load the artifact — it listed it by name, or the content appeared in the prompt the provider builds. Records provider version and date. |
| `convention` | No provider-specific observation. The path is the neutral cross-tool layout (`.agents/`, `AGENTS.md`) that *was* observed working in another provider. Weaker, and labelled. |
| `none` | No evidence. Cell is false; the installer skips. |

"Installed it and it looked fine" is not an observation. Each `observed` note
names the command run and what was seen.

## How each provider was observed

Run on 2026-08-15, each install into an isolated `HOME` and project directory.

**claude-code 2.1.232** — skills, agents, and commands appear by name in the
running session's own surfaces; hooks fire and their output is visible in
transcripts; the `AGENTS.md` managed block is present in session context.

**codex-cli 0.147.0** — `codex debug prompt-input` renders the model-visible
prompt as JSON, which is stronger evidence than a directory listing: it is what
codex actually sent. It showed the install directory registered as a skill root,
25 installed skills listed by name, all 13 agents from `.codex/agents/*.toml`,
and the `AGENTS.md` block. Agents were confirmed with codex installed *alone*,
so no other provider's files could account for the names.

Commands were **not** observed: `.codex/commands/term-config.md` is written and
never appears in the prompt. Commands may only surface on invocation, which was
not observable here — so the cell is `none` rather than assumed.

**opencode 1.15.3** — `opencode debug skill` reports each skill's resolved
location; 26 skills resolved to the installer's `.opencode/skills` directory.
`opencode agent list` names all 13 agents as subagents, and `opencode debug
config` shows the same 13 plus the installed command in its resolved config.
`instructions` is empty in that config and no surface showed rules being
loaded, so rules is `none`.

**cursor-agent 2026.07.23-e383d2b** — installed, but it exposes no local
listing or prompt-dump surface. The only remaining probe would send a prompt to
Cursor's API, spending the user's credits; that was not done for a table
refresh. Skills and agents stay `convention` (same `.agents/skills` root
observed working under codex); the cursor-specific `.cursor/commands` and
`.cursor/rules/*.mdc` drop to `none`.

**antigravity** — the app is installed but ships no CLI, so there is no way to
observe what it loads. Skills and rules stay `convention` on the neutral
layout; agents and commands, which have no neutral convention, are `none`.

**generic** — not a product, so `observed` cannot apply by definition. Every
true cell is `convention` and says so.

**test-provider** — internal mock, filtered from the public provider list and
excluded from the evidence requirement; it exists to exercise the installer's
skip path.

## Consequences

Cells lost their claim, and the installer now skips them: codex and cursor
commands, cursor and opencode rules. Users of those providers stop receiving
files that nothing was ever observed to read. This is the intended trade —
a table with holes over a table that is complete and wrong.

Re-verification also exposed a live defect. `planRules` never checked
`supports.rules`; it asserted the path non-null with `!`. That branch was
unreachable only because every provider had rules verified. The moment one lost
its evidence, `null` reached the path guard and crashed instead of skipping.
A gate that is never exercised is not a gate.

The `scripts` and `env` cells were re-derived rather than inherited. They are
`convention` everywhere: files land beside artifacts that were observed loading,
but nothing reports a provider executing a script from them, and the phase-7
per-skill execution path runs through `ariadnev skill run` rather than through
any provider's script discovery.

## Revisiting

`observedVersion` and `observedOn` are in the table so staleness is visible.
Re-observe when a provider's major version changes, or when a user reports an
artifact not being picked up. A cell may be promoted from `convention` to
`observed` at any time by running the provider and recording what was seen; the
reverse — quietly promoting without an observation — is the failure this
decision exists to prevent.
