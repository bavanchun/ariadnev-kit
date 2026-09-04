---
title: "Runtime parity and gap closure: provider-directed hooks, codex native hooks, antigravity correction, native output styles, worktree root, preview validators"
status: in-progress
description: "Close the evidence-and-content gaps found by the 2026-09-04 parity study: a provider-directed hook surface the kit does not yet have, native Codex hooks (#134), the antigravity agent cell that rests on the installer's own output, a stale claude-code row hiding native output styles, persisted `worktree.root` config, and the dropped preview generation-time validators."
priority: P1
effort: 39h
blockedBy: []
blocks: []
created: 2026-09-04
---

# Runtime parity and gap closure

## Overview

Three research passes on 2026-09-04 (`plans/reports/researcher-260904-0946-codex-runtime-parity.md`,
`plans/reports/researcher-260904-0946-antigravity-runtime-parity.md`, and the
workspace-level `parity-260904-0936-ak-2-14-vs-ariadnev-1-5-1.md`) agree on the
same shape of finding: the command surface is at full parity (42 commands / 118
subcommands identical, ratchet 0, skill names 100% covered, aggregate content
depth 102% of upstream), and every remaining gap is either a **stale provider
evidence cell** or a **content drop inside one skill**.

The red-team pass then found something the research had not: the gaps could not
be closed as written, because the hook surface those phases were about to extend
is hard-wired to Claude Code in five places at once. Phase 0 fixes that first.

Six phases close the work.

### Why Phase 0 exists

`kit/hooks/_lib/provider-paths.cjs` finds its config dir by walking parents until
it hits a directory literally named `.claude`. `planHooks` joins
`CLAUDE_HOOKS_DIR` for the hook bodies, the `_lib` tree, the runtime marker, the
output-style sidecar and the statusline, and always emits a `hook-settings` op at
`CLAUDE_SETTINGS_FILE`. `runtime-state-identity.cjs` accepts exactly
`claude-code` and `codex`. And `convention()` returns `{verified: true}`, so
moving a cell from `none` to `convention` — an act of documentation — silently
turns on file writes.

Any phase that gives a second provider hooks has to fix all of that. Doing it
once, before the provider phases, is what Phase 0 is; phases 1-3 then each carry
one provider's evidence work and nothing structural.

### The ladder, and what changed about it

`observed` requires the provider to have been run and **seen to load the
artifact**. `none` means the installer skips and logs. `convention` is the
middle rung, and Phase 0 widens its written definition to the two grounds it is
actually used for: the neutral cross-tool layout observed working elsewhere,
**or** the provider's own shipped artefact naming the path. Both mean *the path
is right, and nobody watched it load*. What the rung excludes — and Phase 2
exists because of this — is a directory populated by this tool's own lineage,
which certifies nothing.

Under the user's no-spend decision, no phase runs a probe that costs model
credits. Free probes still run: `agy agent` / `agy skill list` listings, and
planting a file in an empty native directory. Every phase pre-decides which rung
each outcome lands on, so no grade is chosen after the fact.

### The two claims that carry the plan

- **Phase 1** makes ariadnev's hooks reach Codex at all, closing issue #134 —
  the only open issue in the repo.
- **Phase 2** corrects a live installer defect: the kit writes 16 agent files
  into `~/.gemini/config/agents/` on the strength of finding its own previous
  output there. A free probe (`plans/reports/probe-260904-1246-antigravity-agent-discovery.md`)
  since settled what the circular rationale was defending. The path is right —
  `agy agent` enumerates a file planted there immediately — and the *content* is
  wrong: agy requires `tools:` to be a YAML sequence, every kit agent carries
  Claude's comma-separated string, and one wrong-typed known key makes agy drop
  the whole agent silently. So the fix is in the adapt engine's frontmatter, not
  in `paths.ts`, and the rationale is still deleted for being circular.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 0 | [Provider-directed hook surface](./phase-00-provider-directed-hook-surface.md) | **completed** |
| 1 | [Codex native hooks and output adapter](./phase-01-codex-native-hooks.md) | **completed** |
| 2 | [Antigravity: correct the agent cell, lift the hook cell](./phase-02-antigravity-agent-correction.md) | **completed** |
| 3 | [Claude Code re-observation and native output styles](./phase-03-claude-code-reobservation.md) | Pending |
| 4 | [Persisted worktree root configuration](./phase-04-worktree-root-config.md) | Pending |
| 5 | [Preview generation-time validators and infographic engine](./phase-05-preview-capability-gaps.md) | Pending |

## Sequencing

Phase 0 blocks 1, 2 and 3. Nothing else is a dependency.

What remains is **file ownership**, which is a coordination rule, not an
ordering one:

- Phases 1, 2 and 3 all edit `packages/cli/src/providers/spec-verified.ts`,
  `provider-matrix.test.ts`, and the generated block at `README.md:267-279`;
  phases 1 and 3 also both edit `packages/cli/src/install/install-plan.ts`.
  Different regions of each file, so the merges are mechanical — but they must
  not run as concurrent agents in one worktree. Any order works.
- Phases 4 and 5 own disjoint trees (`config/` + `kit/skills/worktree/`, and
  `kit/skills/diagram/` + `kit/skills/preview/`) and may run alongside the
  provider phases. Their ADR numbers are pre-assigned so either order is safe:
  phase 4 writes `0019`, phase 5 writes `0020`. Phases 1-3 amend
  `docs/decisions/0006-provider-verification-evidence.md` rather than adding
  records.
- `packages/cli/src/kit/kit-embedded.generated.ts` is a **single-writer
  artefact**. Phases 0, 1, 2, 4 and 5 all touch `kit/`, and every file under `kit/`
  compiles into that one ~10 MB tracked file. Each of those phases regenerates
  it as its own last step, which is safe as long as they run one after another;
  regenerating it from two phases *concurrently* produces a conflict no merge
  tool can resolve sensibly. So no two `kit/`-mutating phases share a worktree at
  the same time.

An earlier draft of this plan claimed phases 1-3 were "sequential, not parallel"
as a property of the work. They are not; the constraint is same-file ownership,
which is stated above and is weaker.

## Acceptance criteria

- [ ] Issue #134 is closed with all five of its acceptance checkboxes satisfied: a Codex `PreToolUse` fixture reading `node_modules/pkg/index.js` denies with schema-valid JSON and no `Hook failed`; the exclusion-glob command stays allowed; Claude Code hook behaviour and its existing tests are unchanged; the provider matrix and generated README reflect the newly verified capability; install/heal behaviour for a pre-existing legacy `.codex` wrapper is defined and tested.
- [ ] No file under `packages/cli/src/install/` joins `CLAUDE_HOOKS_DIR` or `CLAUDE_SETTINGS_FILE` directly; every hooks-tree destination comes from the resolver.
- [ ] Claude Code's planned install destinations are byte-identical before and after Phase 0.
- [ ] A provider can be graded `convention` without that alone turning on file writes — the install-write decision is a separate field, and a test asserts no provider enables writes to a path it cannot cite.
- [ ] `pnpm test` and `pnpm lint` are green; `pnpm coverage` still reports ≥90% on `packages/cli/src/adapt/`.
- [ ] The README provider matrix block between `<!-- BEGIN provider-matrix (generated) -->` and `<!-- END provider-matrix (generated) -->` is regenerated and `matrix-drift.test.ts` passes against it.
- [ ] No cell in `spec-verified.ts` is raised above the rung its cited evidence actually supports; every changed cell's note names the artefact it was checked against, and every `observed` claim names a run that happened.
- [ ] No provider cell keeps a rationale that rests on the installer's own output being mistaken for third-party evidence.
- [ ] `spec-verified.ts` carries per-row observation dates; no row is re-dated by an edit made for a different row.
- [ ] Nothing in this plan executes a command read out of a config file the installer did not write.
- [ ] Nothing in this plan deletes a user file that no ariadnev receipt claims; foreign files are reported instead.
- [ ] Every hook-config writer added by this plan is proven merge-safe by a test whose fixture already contains a third party's entries, and proven idempotent across a second install.
- [ ] `node packages/cli/scripts/check-brand-drift.mjs` is clean **after staging** every new file (the gate scans tracked files only).
- [ ] `docs/decisions/0006-provider-verification-evidence.md` is updated for each provider whose row changed (`spec-evidence.test.ts:110-117` asserts the ADR names every evidence-required provider).
- [ ] `packages/cli/src/kit/kit-embedded.generated.ts` was regenerated after the final `kit/` edit on the branch and is staged with it; no two phases regenerated it concurrently.

## Red Team Review

Three reviewers ran against the five-phase draft. Fifteen findings were
accepted, seven of them Critical. Dispositions:

| # | Sev | Finding | Disposition |
|---|-----|---------|-------------|
| 1 | Critical | `provider-paths.cjs` resolves the config dir by walking to a directory named `.claude`; it cannot survive a second provider | Phase 0 — marker-derived resolution, `.claude` walk kept only as the unmarked-tree fallback |
| 2 | Critical | Only two of the five hooks-tree destinations were being made provider-directed; three stayed hard-wired | Phase 0 — all five, proven by `hooks-surface.test.ts` |
| 3 | Critical | `convention()` returns `{verified: true}`, so a documentation act silently enables file writes | Phase 0 — `hooksInstall` splits the write decision from the grade |
| 4 | Critical | Phase 1's legacy-wrapper step executed foreign `hooks.json` commands at install time — remote code execution from a config file | Phase 1 — rewritten as a pure, non-executing parser, with a test asserting it never imports `child_process` |
| 5 | Critical | Uninstall and heal were not given the same provider direction as install, so a relocated tree orphans files | Phase 0 — symmetry plus a heal test across a hooks-tree relocation |
| 6 | Critical | Phase 1 claimed `observed` for codex hooks with no probe that could earn it | Phase 1 — lands at `convention`; the note says what `[hooks.state]` does and does not prove |
| 7 | Critical | Phase 2's remedy (`agentPath: null`) contradicts direct evidence that agy has agents | Phase 2 — replaced by a free `agy agent` shape probe with both outcomes pre-decided. The probe has since run and taken the third outcome neither branch predicted: the path lists, the content does not parse |
| 8 | High | A new op action would be invisible to `shared-writes.ts` (`isWrite` narrows to `action === "write"`) and would bypass the `--apply-hook-settings` consent gate | Phase 1 — reuses the existing `hook-settings` action with a `format` discriminator; no new action anywhere in the plan |
| 9 | High | One shared `OBSERVED_ON` means re-dating claude-code or codex silently re-dates opencode | Phase 0 — split into three literals; Phase 1 additionally declines to re-pin |
| 10 | High | plan.md asserted phases 1-3 were sequential as a property of the work | This file — replaced by the file-ownership rule in **Sequencing** |
| 11 | High | `kit-embedded.generated.ts` regenerated by several phases independently | Phase 0 step 14 declares it single-writer; phases 1, 2, 3, 4 and 5 defer to it. Phase 2 was written as touching no `kit/` file; giving antigravity a hooks tree means it does, because the hook runtime vocabulary is in `kit/hooks/_lib/` |
| 12 | High | Phase 1 cited `install-surface.ts` as the summary renderer; that file is a 79-line write allowlist that renders nothing | Phase 1 — corrected to `install-command.ts:123-137`, with the correction recorded in the phase |
| 13 | High | Phase 2's orphan criterion was unachievable: `planHeal` (`install-heal.ts:110-131`) removes only paths a prior ariadnev receipt claimed, and the 16 files are upstream's | Phase 2 — split into the receipted case (heal removes them, tested) and the foreign case (report, never delete). The probe narrows it further: those paths are the ones this installer writes, so the frontmatter fix rewrites them in place and nothing is ever orphaned or deleted |
| 14 | High | Phase 4 cluster: the guard sat in the wrong layer, `validateWorktreeRoot` did not do what the phase claimed, the root was unbounded, and the field reader was hand-rolled | Phase 4 — rewritten; guard moved into `filter-project-layer.ts`, bound tightened to `gitRoot`, reader generated |
| 15 | High | Phase 5 cluster: an unpinned upstream fetch, `extra_vendors` dropped from metadata, no read-only gate before writing, and a false `scripts.executionPolicy` claim | Phase 5 — rewritten; `--sha` required with a mismatch failure, metadata carried through, a `git ls-tree` step 0, and the honest dual position |

One further inconsistency was found during the whole-plan sweep rather than by a
reviewer: phases 1 and 3 both grade a cell from the provider's own shipped
artefact, a ground the ladder's written definition did not cover. Phase 0 widens
that wording once, for both.

## Open questions — resolved

Both were put to the user on 2026-09-04 and are now settled.

1. **Phase 5's upstream pin — verified, and it changed the phase.** A read-only
   `git ls-tree` against `09df49d8` found three of the four files: two under
   `scripts/`, `self_check.py` under `skills/diagram-design/scripts/`, all three
   byte-identical to the copies observed downstream. `run-validators.sh` does not
   exist upstream — the pinned commit contains no `.sh` file at all; it was
   written by the kit this project forked from. Phase 5 now vendors three files
   with per-file upstream paths and writes its own wrapper. The three validators
   are stdlib-only, so `requirements.txt` gains nothing.
2. **Phase 4 keeps the `gitRoot` bound.** A project config file travels with a
   cloned repository, so it is attacker-controlled the moment you clone someone
   else's; bounding it to the repository root means such a file can never aim
   writes outside it. The sibling-worktrees layout stays expressible from the
   user's own global layer, which no clone can write.

## Known follow-ups (not phases)

- The `cursor` row is stale the same way claude-code's was: `spec-verified.ts:117`
  records `cursor-agent 2026.07.23-e383d2b` while `cursor-agent 2026.08.25-3e8eec8`
  is installed. Out of the requested scope (codex, antigravity, claude-code only)
  — worth its own re-observation pass later.
- `packages/cli/scripts/test-codex-runtime.mjs:19` pins
  `expectedRuntimeVersion = "0.147.0"`; it is gated behind `ARIADNEV_LIVE_CODEX=1`
  and spends model credits. Phase 1 bumps the pin but does not run it.
- The antigravity tool-name mapping extracted from the 1.1.25 binary stays a
  documented hypothesis; flipping `toolNames` off `none` needs a real session.
- Codex's `plugin`/marketplace packaging may eventually be a better distribution
  vehicle than direct file writes for skills, agents and hooks alike. Issue #134
  raises it and this plan deliberately does not answer it.
- The bundled `agy-customizations` guide is incomplete relative to the 1.1.25
  binary (it lists five customization types and no agents). Treat it as a source,
  not as the authority.

## Working constraints

- TDD: the failing test lands before the implementation, in every phase.
- The adapt engine stays pure (no fs, no network) and ≥90% covered.
- Path constants only in `packages/cli/src/adapt/paths.ts`.
- All writes atomic (temp + rename) with the last three backups kept.
- Cross-platform: `os.homedir()` / `path.join`, never a literal `$HOME` or `/`.
- Files under 200 LOC, kebab-case, comments explain the invariant.
- No plan id, phase number, or finding code appears in any code comment, test
  name, or commit message.
- No probe spends model credits. Free listings and planted files are allowed.
- Commits are conventional and end with the session trailer; local runs stay
  narrow (`--maxWorkers=2`), never the full suite repeatedly.
