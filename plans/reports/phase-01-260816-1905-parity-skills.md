# Phase 1 report: parity skills (`av:plan-i18n`, `av:av`)

Plan: `plans/260816-1845-ariadnev-evidence-backed-parity-with-agentkit/phase-01-parity-skills.md`

## What each skill covers

### `kit/skills/plan-i18n/SKILL.md` (116 lines) — port, re-scoped

Owns exactly one thing: adding a Vietnamese/English (VN/EN) interactive
language-switch to an existing `plan.html` artifact. Everything else —
planning modes, CLI integration, `--github`/`--wiki` publishing, task
hydration, the base `plan.html` structure/diagrams/mockups — is explicitly
deferred to `av:plan` by reference, not restated. A "CLI" subsection states
plainly that `av plan` is an inspection/status surface
(`use|show|list|resolve|update|check|uncheck|status|close|phase|search|
reindex|archive|cleanup`), that plan content (including `plan.html`) is
always written directly by the agent, and names two commands that do **not**
exist (`av plan create`, `av plan translate`) as an explicit anti-example —
mirroring the "do not invent flags" pattern already used in `ak:ak` and
`av:av`. Ships one reference,
`kit/skills/plan-i18n/references/bilingual-html-guide.md` (104 lines,
carried over near-verbatim — it had no `ak:`/AgentKit-specific strings to
rebrand beyond the skill-name mention on line 3).

### `kit/skills/av/SKILL.md` (154 lines) — new authoring

Teaches an agent to operate the `av` CLI itself: a Boundaries table routing
skill-authoring to `av:skill-creator`, task-routing to `av:ariadnev`, and
plan/journal content to their own skills; a numbered safe-operating
protocol (triage read-only/mutating/diagnostic, inspect via `--help` before
acting, confirm `--home`/`--cwd`/`--global`/`--dry-run`/`--yes` scope, prefer
inspection before lifecycle mutation, never invent a flag, report exact
command+scope+result); a command index grouped by task rather than a full
flag table (per the plan's own risk note — a skill that restates a CLI
outlives its accuracy); and a `--json` availability list. Documents
`av update --to <x.y.z>` per the task instruction (pinned downgrade, exact
`x.y.z` only, checksum verified, may need a follow-up `av install`) — this
flag landed in `packages/cli/src/cli/update-command.ts` from a concurrent
agent partway through this session; re-confirmed live in `--help` before
finishing (see evidence below). No `references/` — every command already
routes to `av <cmd> --help` as the authority, so a reference file would only
duplicate that and go stale.

## Upstream instructions deleted and why

Everything in `ak:plan-i18n`'s SKILL.md outside the bilingual-HTML capability
was dropped rather than ported, because `av:plan` (628 lines, already
installed) already owns and correctly implements that content for `av`:
Prerequisites, CLI Integration/scope rules, Mandatory Generated-File Read
Pass, Canonical Phase File Template, Cross-Plan Dependency Detection, Default
(No Arguments), Workflow Modes table, Advisory Supervision Mode, GitHub Issue
Projection, AgentWiki Publish Mode, When to Use, Output Requirements,
Post-Plan Handoff. Porting these verbatim would have produced two
628-vs-252-line documents disagreeing on `av` command syntax (upstream's
`ak:plan-i18n` still says `ak plan --help`, references `.agentkit/`, and
lists CLI rules current `av:plan` already restates correctly for `av`).
Reconciliation approach used: `av:plan-i18n` now points at `av:plan`'s
`## HTML Output Mode (--html)` section instead of duplicating it, and states
`av:plan` is authoritative for everything except the bilingual switch itself
— satisfying the phase's fallback/reconciliation requirement without folding
the capability into `av:plan --html` (that fallback was not needed; the
split is clean).

No `av plan` subcommand instructions needed deleting from the *new*
plan-i18n content because the rewritten skill only names commands verified
against live `--help` (`plan resolve`, `plan --help`) plus the two
explicitly-flagged non-existent commands.

## Live-help evidence captured

Ran every top-level command and every grouped subcommand's `--help` in a
sandbox (`--home`/`--cwd` under the session scratchpad, never touching real
`~/.claude` or `~/.codex`):

```
av --help
av plan --help / plan use|resolve|reindex --help
av journal --help
av kit --help
av mcp --help
av adapters --help
av config --help / config prefs --help
av install|uninstall|doctor|backups|update|validate|audit|skill|contract|
  eval|list|query|telemetry|add-skill|migrate|run --help
```

Confirmed real command list: `install, uninstall, doctor, backups, update,
validate, audit, skill, contract, eval, list, query, telemetry, add-skill,
migrate, config, plan, journal, kit, mcp, adapters, run` (plus `--home`,
`--cwd`, `--dry-run`, `--yes` as global flags). `av update --to <version>`
was absent on the first capture (`grep -n "\-\-to\b"
packages/cli/src/cli/update-command.ts` returned nothing) and present on a
second capture later in the session once the concurrent agent landed it —
help text: `"install this exact release instead of latest (e.g.
downgrade)"`, confirming the exact-version + downgrade framing documented in
`av:av`.

Post-write verification: grepped every `` `av <word>...` `` mention in both
skill files against the captured help transcripts. All real invocations
match live output. The only two non-matching strings (`av plan create`,
`av plan translate`) are explicit "this does not exist" callouts, not
instructions to run.

## Line counts / lint bar

| File | Lines | Limit |
|---|---|---|
| `kit/skills/plan-i18n/SKILL.md` | 116 | 300 |
| `kit/skills/plan-i18n/references/bilingual-html-guide.md` | 104 | 300 |
| `kit/skills/av/SKILL.md` | 154 | 300 |

Both SKILL.md files: no `metadata.origin` field at all (confirmed via
`grep -n origin` → no match on either file); `## Output format`,
`## Quality gates`, `## Workflow position` each present exactly once;
descriptions contain trigger verbs ("Use after…", "Use when…").

## Routing

Added two rows to `kit/skills/ariadnev/SKILL.md`'s Boundaries table (the only
place in that router that names specific skills by decision — it otherwise
deliberately avoids a master skill list, per its own text: "Routing tables
live with their owning skills"):

```
| Operate the `av` CLI itself (install, doctor, validate, migrate, update, ...) | `av:av` |
| Add a bilingual Vietnamese/English switch to a plan's `plan.html` | `av:plan-i18n` |
```

## Validate / list output

```
$ ariadnev validate --check --strict
ariadnev validate — 105 skills, 16 agents, 14 hooks
  all checks passed
```

0 errors, 0 warnings — the pre-existing 89-warning baseline had already
dropped to 0 by the time this phase finished (other agents' concurrent work);
none of the (now nonexistent) warnings named `plan-i18n` or `av`.
`ariadnev list` shows 105 skills including `plan-i18n` and `av` in the
alphabetized list. `rg "av doctor|av audit|av contract" kit/skills` returns
matches (all inside `kit/skills/av/SKILL.md`).

## Regeneration

- `pnpm --filter ariadnev generate:embedded` → "embedded 1555 kit assets (397
  binary, v1.0.0, digest 33a0987475ffe7e7) ->
  packages/cli/src/kit/kit-embedded.generated.ts"
- `pnpm --filter ariadnev generate:matrix` → "provider matrix already up to
  date" (no README change needed)
- `generate:skill-lock` skipped — neither skill ships Python scripts.

## Sandbox verification

- `install --provider claude-code --yes` then `doctor` → healthy, 100%,
  "1532 file(s) present, bindings intact".
- `install --provider codex --yes` then `doctor` → healthy, 100% for both
  providers; codex: "1465 file(s) present, bindings intact". Confirmed both
  new skills landed on disk: `.claude/skills/{av,plan-i18n}/SKILL.md` and
  `<home>/.agents/skills/{av,plan-i18n}/` (codex installs skills to the home
  root, not the project cwd — expected per `av kit install-path codex`).
- Sandbox dirs removed after verification.

## Build

`pnpm lint` (`tsc -p packages/cli/tsconfig.json --noEmit`) — clean, no
output beyond the command echo.

## Files modified

- Created: `kit/skills/plan-i18n/SKILL.md`,
  `kit/skills/plan-i18n/references/bilingual-html-guide.md`
- Created: `kit/skills/av/SKILL.md`
- Modified: `kit/skills/ariadnev/SKILL.md` (2 rows added to Boundaries table)
- Regenerated: `packages/cli/src/kit/kit-embedded.generated.ts`
- Provider matrix: no change needed (already in sync)

## Reconciliation decision

`av:plan-i18n` and `av:plan` reconcile cleanly under the deference rule (step
3 of the phase); the fallback (`av:plan --html` absorbing the bilingual
capability) was not invoked because the split holds without contradiction.
