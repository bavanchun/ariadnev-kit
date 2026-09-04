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
| `convention` | No load was witnessed, but the path is right on one of two grounds: it is the neutral cross-tool layout (`.agents/`, `AGENTS.md`) that *was* observed working in another provider, or the provider's **own shipped artefact** — its binary, its schema, a config file it wrote itself — names the path. Weaker, and labelled. |
| `none` | No evidence. Cell is false; the installer skips. |

"Installed it and it looked fine" is not an observation. Each `observed` note
names the command run and what was seen.

## How each provider was observed

Run on 2026-08-15, each install into an isolated `HOME` and project directory.

**claude-code 2.1.232** — skills, agents, and commands appear by name in the
running session's own surfaces; hooks fire and their output is visible in
transcripts; the `AGENTS.md` managed block is present in session context.
Re-observed against 2.1.260 on 2026-09-04; see below.

**codex-cli 0.147.0** — `codex debug prompt-input` renders the model-visible
prompt as JSON, which is stronger evidence than a directory listing: it is what
codex actually sent. It showed the install directory registered as a skill root,
25 installed skills listed by name, all 13 agents from `.codex/agents/*.toml`,
and the `AGENTS.md` block. Agents were confirmed with codex installed *alone*,
so no other provider's files could account for the names.

Commands were **not** observed: `.codex/commands/term-config.md` is written and
never appears in the prompt. Commands may only surface on invocation, which was
not observable here — so the cell is `none` rather than assumed.

The `hook` cell was re-graded separately, against **codex-cli 0.153.1**. Codex
keeps a `[hooks.state]` table in `~/.codex/config.toml` recording a trust
decision and a `trusted_hash` per `<source>:<event>:<group>:<hook>`, so codex
was seen parsing a `hooks.json` and writing down what it found there. The loads
behind those entries are other tools' hooks — two installed tools plus three
plugin-bundled `hooks/hooks.json` — never ariadnev's, because trusting a hook
is an interactive TUI step nobody can perform on the user's behalf. That makes
the layout better attested than the usual `convention` case, which rests on a
neutral cross-tool directory, and still short of `observed`, which requires
watching our own artifact load. `observedVersion` and `observedOn` on the codex
row stay at 0.147.0: they date the skill and agent probes, and re-dating them
here would silently re-stamp evidence nobody re-collected.

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

## Amendment, 2026-08-28: three providers added, none of them `observed`

`omp`, `grok` and `dsh` join the table. The observation run is recorded in
`plans/reports/observation-260828-grok-omp.md`; this section records what the
result means for the ladder, because two of the three tested it directly.

**`omp` has a binary and its cells are still `convention`.** That combination is
new here — every previous provider with a binary reached `observed` through some
local listing or prompt dump. `omp read skill://<name>` looked like that surface;
a probe skill planted in both candidate layouts came back `Available: none` while
`omp config` confirmed discovery was on, which means the subcommand resolves a
per-session registry rather than the discovery pipeline. The only probe left is
`omp --print`, which spends the user's model credits. **A cell is not worth
someone's money to certify**, so it stays at `convention` — the same reasoning
already applied to `cursor`, and the reason that row reads the way it does.

**A directory listing nearly certified the wrong path.** The upstream CLI writes
`~/.omp/agent/skills`, and that directory is populated here with 105 skills. omp's
own runtime documentation says `~/.omp/agent` is the session-storage directory
(`PI_CODING_AGENT_DIR`) and that the canonical native location is
`.agent[s]/skills`; the only skills path beneath `agent/` is `managed-skills`, an
auto-learn bucket at priority 5 that always defers to an authored skill. Both
directories exist and both are populated, so a listing would have "confirmed"
whichever was looked at first. This is precisely the confusion the ladder exists
to catch, and it is the first time it has caught one.

**`grok` is `convention` for the ordinary reason** — a Claude-shaped tree with
real artifacts in it, and no binary on PATH to watch loading anything.

**`dsh` is entirely `none`.** No binary, no home directory, and absent from the
upstream CLI's own adapters. The installer skips every cell and logs, the README
says skipped, and `av contract` reports it. Shipping a guessed path would be
worse than the documented gap, because an installer writing confidently into an
invented location looks like success.

The provider count is therefore **9 listed, 8 installable, 1 skipped** — and that
is stated in those terms rather than as "9 providers supported".

## Amendment, 2026-09-04: antigravity, and what a listing does and does not prove

**A citation is withdrawn.** `antigravity`'s `agent` and `skill` cells rested on
"`~/.gemini/config/agents/` holds 16 `.md` files". Every one of those files came
from this tool's own lineage, so the note was the installer certifying its own
output — the exact circularity the ladder exists to prevent, stated as evidence
in the table. It is deleted rather than softened.

**What replaced it is `observed`, and the reason is the enumerator, not the
directory.** `agy agent` on 1.1.25 listed by name two kit agents produced by the
real antigravity adapt pipeline, planted at the path the installer writes to and
removed afterwards; an empty control directory listed nothing. The listing is
agy's own frontmatter parser: the same two files disappear from it when `tools:`
is a scalar string or when any `model:` key is present. A file that exists and a
file the provider accepted are therefore distinguishable — which is precisely
what `ls` cannot do, and what separates this from the withdrawn citation.
`opencode` and `codex` reached the same rung on the same kind of answer.

**Listing is not execution, and the note says so.** What was observed is
discovery and load, not a session using the agent, which needs a paid turn. That
limit belongs in the cell rather than in a promotion to a rung the ladder does
not define: there is no "loaded but not run" level, and inventing one to express
a caveat would make every other row's grade mean less.

**This is also a product finding, not only a grading one.** Until the adapter
emitted `tools:` as a sequence and dropped `model:` entirely, agy silently
ignored every agent this tool installed — 16 files on disk, none of them
loadable, and no warning anywhere. Two adapt tests pin those two facts as the
evidence they are, so that "simplifying" them back would void the observation
rather than merely change a format.

**The `hook` cell rose only to `convention` the same day, and the gap is the
point.** The provider's shipped `hooks.json` documentation, the matching strings
in its binary, and a third party's live registration in the very file the
installer merges into all say the layout is right. None of them is a hook
firing, and a hook only fires inside a session. Same day, same binary, two
different rungs, for the ordinary reason.

**One date per row still dates the observation, not the row.** `observedOn` here
marks the agent listing. Every other cell in that row is `convention` and was not
re-checked that day; the field says when the observation happened, and the notes
say which cell it belongs to.

## claude-code re-observed on 2.1.260 (2026-09-04)

The row had been pinned to 2.1.232 since the table was written. A table that
ages in place certifies itself, so every cell was re-checked against the build
actually installed, and the two that a shell session cannot reach say so in
their own notes: `command` (the kit ships one, it was not invoked, and no
non-interactive surface lists commands) and `statusline` (the bar draws in the
user's terminal). Both keep their original observation in the note and are
labelled **carried forward**. `skill`, `agent`, `rules` and `hook` were seen
again on 2.1.260.

**The `outputStyle` cell moved from `none` to `convention`.** Its old note —
"`.claude/output-styles/` is observed on disk but nothing was seen to load from
it" — cited a directory listing, and a directory this tool's own lineage may
have created proves nothing about what reads it. So the question was put to the
provider.

A style was planted in an otherwise-empty `~/.claude/output-styles/` and every
free surface in 2.1.260 was read: `claude doctor` never mentions output styles
and does not validate an unknown `outputStyle` setting; `claude plugin validate
--json` answers `"contents": []` for a plugin that carries an `output-styles/`
directory; there is no `--output-style` flag, no `output-style` subcommand, and
no `claude config` command at all. `/output-style` is interactive-only, and
reaching it costs a model turn, which a table refresh does not justify. The
planted file was removed and the directory is empty again.

What the shipped binary does say is specific. `output-styles` is a member of
Claude Code's own **userConfigDir directory-name enum**, beside `commands`,
`agents`, `skills` and `rules` — the four cells this row already grades
`observed` — and the binary joins `.claude/output-styles` literally in the same
closure that handles `.claude/skills`, `.claude/commands` and `.claude/hooks`.
That is the provider's own artefact naming the path, which is the second ground
in the `convention` row above and not the neutral-layout inference.

It is not `observed`, because nothing was seen to load. It is not `none`,
because that would mean no evidence and the enum is evidence. The full probe
transcript is in
`plans/reports/observation-260904-1552-claude-code-2.1.260.md`.

**The hook sidecar stays.** Grading this cell means the six coding-level styles
are now written to `.claude/output-styles/` as well as to
`.claude/hooks/av/output-styles/`. The sidecar is not a claude-code workaround
to retire on the lift — it is how the styles reach every provider with a
verified hook cell and an unverified native surface, and dropping it would
silently remove coding levels from the rest. Both copies are written from the
same source bytes, and `session-init` still probes the provider's own directory
first, so a style the user authors under the same name keeps winning.
