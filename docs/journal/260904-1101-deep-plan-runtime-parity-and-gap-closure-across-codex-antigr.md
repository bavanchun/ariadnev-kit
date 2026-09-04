# Deep plan: runtime parity and gap closure across codex, antigravity, and claude-code

**Date**: 2026-09-04 11:01
**Component**: plan
**Status**: Resolved

## What happened

## What happened

Produced `plans/260904-0956-runtime-parity-and-gap-closure/` — six phases, 39h,
from three parity research passes against agentkit 2.14.0.

The research said the command surface is at full parity (42 commands / 118
subcommands, ratchet 0, skill names 100% covered) and that every remaining gap is
either a stale provider evidence cell or a content drop inside one skill. The
red-team pass found something the research had not: those gaps could not be
closed as written, because the hook surface the provider phases were about to
extend is hard-wired to Claude Code in five places at once —
`kit/hooks/_lib/provider-paths.cjs` walking parents for a directory literally
named `.claude`, `planHooks` joining `CLAUDE_HOOKS_DIR` for five different
destinations and always emitting `hook-settings` at `CLAUDE_SETTINGS_FILE`,
`runtime-state-identity.cjs` accepting exactly two ids, and `convention()`
returning `{verified: true}` so that a documentation-only grade lift silently
turns on file writes. That became Phase 0, and phases 1-3 rebased onto it.

15 red-team findings were accepted (7 Critical) and applied across all six files.
A whole-plan sweep then found a defect no reviewer had: phases 1 and 3 both grade
from the provider's own shipped artefact, a ground the ladder's written
`convention` definition did not cover. Fixed once in Phase 0 rather than twice in
passing.

## Decision

Phase 5's upstream pin was verified in-session rather than trusted, and the
result rewrote the phase. A read-only `git ls-tree` against
`cathrynlavery/diagram-design@09df49d8` showed three of the four target
validators exist — in two different directories, `scripts/` and
`skills/diagram-design/scripts/` — and `run-validators.sh` does not exist at all;
the commit contains no `.sh` file. That wrapper was written by the kit this
project forked from, so vendoring it would attach a third party's licence to text
they never wrote and the brand-drift gate would be right to reject it. The phase
now vendors three files with per-file upstream paths and re-authors the wrapper
to the same contract. All three validators import stdlib only, so
`requirements.txt` is asserted unchanged rather than edited on faith.

Two user decisions are recorded in the plan: probes never spend model credits (so
every phase pre-decides which evidence rung each outcome lands on), and
`worktree.root` stays bounded to `gitRoot`, because a project config file is
attacker-controlled the moment you clone someone else's repository.

## Next steps

Execute Phase 0 first — it blocks 1, 2 and 3. Nothing else is a dependency; what
remains is file ownership, since phases 1-3 share `spec-verified.ts` and
`kit-embedded.generated.ts` is a single-writer artefact no two `kit/`-mutating
phases may regenerate concurrently.
