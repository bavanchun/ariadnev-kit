---
phase: 1
title: "Parity skills"
status: pending
priority: P1
effort: "1-2d"
dependencies: []
---

# Phase 1: Parity skills

## Overview

Close the only two capability gaps against AgentKit: port `ak:plan-i18n`, and
write the skill that teaches an agent to operate the `av` CLI — which cannot be
ported because `av`'s commands are not `ak`'s.

## Requirements

- Functional: `av:plan-i18n` and `av:av` ship in `kit/skills/`, install to every
  provider, and route correctly from `av:ariadnev`.
- Functional: `av:av` documents the **actual** `av` surface, read from
  `av <command> --help`, never from AgentKit's `ak:ak`.
- Non-functional: `av validate` stays at 0 errors; no new orphan references;
  generated artifacts regenerated and committed.
- Non-functional: **neither new skill carries `metadata.origin: ported`.**
  `skill-lint.ts:31` downgrades oversize, missing-trigger-verb, and
  missing-required-section from error to warning for ported skills; all 103
  existing skills take that exemption, which is why a 902-line `cti-expert`
  still validates clean. Both new skills are held to the house bar instead:
  **≤300 lines** (`SKILL_MAX_LINES`), every required `##` section present, and a
  trigger verb in `description`.

## Architecture

Two different jobs sharing one delivery:

**`av:plan-i18n` — a port.** Source: `~/.claude/skills/ak-plan-i18n`
(`SKILL.md` 252 lines + `references/`). The mechanical part is the rebrand
(`ak:`→`av:`, `AgentKit`→`ariadnev`, `.agentkit/`→`.ariadnev/`, author metadata).
The non-mechanical part: upstream's body calls `ak plan` subcommands that do not
exist on `av` — `av plan` prints the current plan, it is not a CRUD surface. Every
CLI instruction must be re-resolved against `av plan --help` or dropped. The skill
must reference `av:plan` for the planning workflow instead of restating it; the
kit's `plan` skill is 628 lines and upstream's i18n variant is 252 — they are not
the same document and must not contradict each other.

**`av:av` — new authoring.** Scope: which subcommand answers which intent, the
read-only/mutating split, scope flags (`--home`, `--cwd`, `--dry-run`, `--yes`),
`--json` output where it exists, and the boundaries (skill authoring →
`av:skill-creator`; task routing → `av:ariadnev`; plan/journal → their own
skills). Its content is derived by running each command's `--help` in a sandbox,
not by translating `ak:ak`.

## Related Code Files

- Create: `kit/skills/plan-i18n/SKILL.md` + `kit/skills/plan-i18n/references/*`
- Create: `kit/skills/av/SKILL.md` (+ `references/` only if the body earns it)
- Modify: `kit/skills/ariadnev/SKILL.md` — routing entries for both new skills
- Modify: `packages/cli/src/kit/kit-embedded.generated.ts` (regenerated, not edited)
- Modify: provider matrix artifact via `generate:matrix` (regenerated, not edited).
  There is **no kit-wide lock file** — `generate:skill-lock` resolves a *per-skill
  Python environment* into that skill's `scripts/ariadnev-lock.json`, so it only
  runs if a new skill ships Python scripts. Neither of these two does.
- Read-only: `~/.claude/skills/ak-plan-i18n/**` (port source), `~/.claude/skills/ak-ak/SKILL.md` (scope reference only)

## Implementation Steps

1. Scaffold both skills with `av add-skill` so frontmatter matches the kit's own
   schema rather than upstream's.
2. Port `plan-i18n`: copy body and references, apply the rebrand, then re-resolve
   every CLI instruction against `av plan --help`. Delete instructions for
   commands `av` does not have; do not invent replacements.
3. Reconcile `av:plan-i18n` against `kit/skills/plan/SKILL.md`: the i18n skill
   owns the bilingual HTML artifact and defers the planning workflow to `av:plan`.
4. Author `av:av` from live help output. Capture the surface in a sandbox
   (`av --home <tmp> --cwd <tmp> <command> --help`) so nothing is asserted from
   memory.
5. Add routing entries to `av:ariadnev` and check the cross-skill routing
   validator accepts both names.
6. Regenerate `generate:embedded` and `generate:matrix` (script names confirmed in
   `packages/cli/package.json`); skip `generate:skill-lock` unless a new skill
   ships Python scripts.
7. Verify in a sandbox install: `av --home <tmp> --cwd <tmp> install --yes`, then
   `av list`, `av doctor`, `av validate`.

## Success Criteria

- [ ] `av list` shows 105 skills including `plan-i18n` and `av`.
- [ ] `av validate` → 0 errors, and no new orphan warnings versus the 89 baseline.
- [ ] `rg "av doctor|av audit|av contract" kit/skills` returns matches.
- [ ] Every CLI invocation written in either skill exists in `av --help` output.
- [ ] Both skills pass the non-ported bar: ≤300 lines, required sections present,
      trigger verb in `description` — no `metadata.origin: ported` anywhere in them.
- [ ] Sandbox install + `av doctor` healthy for claude-code and one non-Claude provider.
- [ ] `pnpm test` and kit CI green.

## Risk Assessment

- **Porting `plan-i18n` verbatim ships instructions for commands that do not
  exist.** Signal: a reviewer or user runs a command from the skill and gets
  `unknown command`. Response: step 2's re-resolution pass is mandatory, and step
  6's success criterion greps every CLI mention against live help.
- **`av:av` drifts from the CLI on the next release.** Signal: a command's flags
  change and the skill still teaches the old ones. Pre-decided response: keep the
  skill's command list short and point at `av <cmd> --help` as authority rather
  than duplicating flag tables — a skill that restates a CLI is a skill that
  outlives its accuracy.
- **`plan-i18n` and `plan` contradict each other.** Signal: two different
  workflows for the same request. Response: step 3's deference rule; if it cannot
  be honored cleanly, fold the bilingual HTML capability into `av:plan --html`
  instead of shipping a second skill, and record that decision here.
