---
phase: 3
title: "Claude Code re-observation and native output styles"
status: completed
priority: P2
effort: 5h
dependencies: [0]
---

# Phase 3: Claude Code re-observation and native output styles

## Overview

The claude-code row is stale and one of its cells is wrong.
`spec-verified.ts:80` pins `observedVersion: "2.1.232"`; the installed build is
**2.1.259**. Line 90 records
``outputStyle: none("`.claude/output-styles/` is observed on disk but nothing was
seen to load from it")``.

Output styles are demonstrably alive in 2.1.259. The binary carries 17
`output-styles` and 39 `outputStyle` string hits; a plugin schema key documents
"Path to an output-styles directory or file, relative to the plugin root. When
set, the output-styles/ directory is not auto-loaded"; and `output-styles`
appears in the artifact-kind sets alongside `commands`, `agents`, `skills`,
`themes`, `monitors`, `workflows`, `routines` and `rules`.

`~/.claude/output-styles/` exists and is **empty**. That is the ideal probe
condition: write one coding-level style into an otherwise-empty native
directory, start a session, and check whether Claude Code lists or applies it
with nothing else in the directory to confound the result. Planting a file and
reading a listing surface spends no model credits, so this probe runs.

### Which rung the static evidence buys, and why this phase says so out loud

Those binary strings and that schema key are the **provider's own shipped
artefact** naming the path — not this tool's lineage, and not a guess. That is
the same evidence class Phase 1 rests codex's hook cell on
(`~/.codex/config.toml`'s `[hooks.state]`, written by Codex itself), and both
phases land on `convention` for it. The ladder's own wording in
`spec-verified.ts` currently describes `convention` only as "the neutral
cross-tool layout observed working elsewhere", which does not cover this ground
and would make Phase 1 and this phase read as inconsistent with the ladder and
with each other.

Phase 0 widens that wording once, for all three phases, to the two grounds the
rung actually covers: the neutral cross-tool layout, **or** the provider's own
shipped artefact naming the path. Both mean the same thing operationally —
*the path is right, and nobody watched it load*. This phase depends on that
edit and does not restate it.

So the pre-decided landing here is:

| What the probe shows | Cell |
|---|---|
| Claude Code names the planted style in a listing or applies it | `observed`, note quoting the surface and its literal output |
| The probe is inconclusive or the surface does not exist | `convention`, on the shipped-artefact ground, note saying exactly that the probe was run and what it did not show |
| The probe shows Claude Code ignoring the directory | `none`, note recording the disproof — which is stronger than today's note |

### The sidecar, and what its rationale actually is

Because `outputStyle` is `none` for all ten providers, `install-plan.ts:162-170`
currently ships the six `kit/output-styles/coding-level-*.md` as a **hook
sidecar** under `CLAUDE_OUTPUT_STYLES_SIDECAR_DIR`, which
`packages/cli/src/adapt/paths.ts:47` resolves to
`.claude/hooks/av/output-styles`. `session-init` consumes them there, after
first probing the native `<config dir>/output-styles/`, which stays reserved for
styles the user authors and wins when both exist.

The comment at `install-plan.ts:53-56` explains that sidecar as a workaround for
*claude-code's* cell being unverified. That framing is already wrong today and
gets worse as this plan lands: the sidecar's real job is to reach **any**
provider whose hook cell is verified but whose native output-style surface is
not. Claude Code is one member of that set now; after Phase 1 codex is another,
and Phase 2 may add antigravity. Retiring the sidecar on a claude-code lift
would silently drop coding levels for every other member.

The sidecar is therefore **kept in every branch of the probe**, and the comment
is rewritten to say what it is rather than what it was a workaround for. That is
a correction to a stated rationale, not a decision the probe gets to make.

## Requirements

1. Re-observe every claude-code cell against 2.1.259 and re-pin
   `observedVersion` and this row's own `observedOn` literal (Phase 0 split the
   shared constant; this phase moves only claude-code's).
2. Run the free native output-style probe in the empty `~/.claude/output-styles/`
   and land `claude-code.paths.outputStyle` on the rung the table above
   pre-decides for what it shows.
3. On a lift to `observed` or `convention`, install the six coding-level styles
   through `planOutputStyles` to `.claude/output-styles/` as well.
4. Rewrite the sidecar rationale at `install-plan.ts:53-56` and `162-170`; keep
   the sidecar in every branch.
5. Preserve the existing precedence: a user-authored native style wins the
   `session-init` probe.
6. Do not touch any other provider's row, and state which claude-code cells are
   *derived* rather than independently re-observed.
7. Regenerate the matrix and README block.

## Architecture

**Probe design.** The native directory is empty, so a single planted file is
unambiguous. Write one `coding-level-*.md` to `~/.claude/output-styles/`, start
a session, and look for the style by name in whatever surface Claude Code
exposes for output styles — the same class of check the `skill`/`agent`/
`command` cells on this row already rest on ("listed by name in the running
session's available-skills surface"). Record the exact surface and its output
verbatim in `plans/reports/`; that record is what the evidence note cites.
Remove the planted file afterwards so the directory returns to empty and a later
probe is equally clean.

**Derived cells must be labelled.** Of the claude-code row's cells, `skill`,
`agent`, `command` and `rules` rest on a session listing; `hook` rests on a hook
firing in the transcript; `statusline` rests on the bar drawing. Re-checking all
six needs one session, which this phase already opens for the probe — so the
re-check is a by-product, not extra spend. Any cell that cannot be re-checked in
that session is recorded as **carried forward, not re-observed**, with the date
of its original observation intact. Re-pinning `observedVersion` to 2.1.259
while silently carrying an unchecked cell would be the same self-certification
Phase 2 exists to remove.

**`planOutputStyles` needs no logic change.** `install-plan.ts:57-67` already
writes through `r.targetFor(style, ctx)` when `r.supports.outputStyle` is true,
and `resolver.ts:75` already carries
``outputStylePath: (n) => `.claude/output-styles/${n}.md` `` with a comment
saying the cell stays false until verified. Flipping the cell activates both.
The skip reason at lines 59-66 — "native surface unverified; installed as
session-init hook sidecar instead" — stays correct for every other provider and
must keep saying that for codex once Phase 1 verifies its hook cell.

**Precedence is already implemented in the hook.** `session-init` probes
`<config dir>/output-styles/` first and the sidecar second (`kit/hooks/README.md`,
Layout section). Installing the kit's six styles natively means the kit's own
files now occupy the directory the probe prefers. That is a behaviour change
worth a test: a user-authored style with the same name must still win, and the
kit's native copy and its sidecar copy must be byte-identical so the probe order
cannot change which text is injected.

**Coordination with Phase 1.** This phase does not depend on Phase 1, but both
edit `packages/cli/src/install/install-plan.ts` and
`packages/cli/src/providers/spec-verified.ts`. Different regions, so the merge
is mechanical — but they must not be run as two concurrent agents against the
same worktree.

## Related Code Files

**Create**
- `plans/reports/` observation record for 2.1.259: the probe, its surface, its literal output, the per-cell re-check, and which cells were carried forward.

**Modify**
- `packages/cli/src/providers/spec-verified.ts:79-94` — `observedVersion` → `"2.1.259"`, this row's own `observedOn` literal, and the `outputStyle` cell + note.
- `packages/cli/src/providers/resolver.ts:73-75` — the comment saying the cell stays false.
- `packages/cli/src/install/install-plan.ts:53-56, 162-170` — the two comments whose stated rationale is wrong; no control-flow change.
- `packages/cli/src/providers/provider-matrix.test.ts` — claude-code outputStyle expectation.
- `packages/cli/src/providers/spec-evidence.test.ts` — claude-code assertions.
- `packages/cli/src/install/install-plan.test.ts` (or the nearest plan test) — the six styles plan a native write and a sidecar write with identical content.
- `kit/hooks/README.md` — the output-styles paragraph in Layout.
- `README.md:267-279` — regenerated matrix block.
- `docs/decisions/0006-provider-verification-evidence.md`.

**Delete** — none. If the sidecar were ever retired, the deletion would be
`CLAUDE_OUTPUT_STYLES_SIDECAR_DIR` in `packages/cli/src/adapt/paths.ts:40-47`
plus the loop at `install-plan.ts:162-170`; this phase does not do that, in any
branch.

## Implementation Steps

1. Open one session against 2.1.259 and re-check every claude-code cell using
   the surfaces the existing notes name: skills listed by name, agents as
   subagent types, commands as slash commands, the AGENTS.md managed block in
   context, hooks firing in the transcript, the `statusLine` settings key drawing
   the bar. Record each result. A cell whose surface no longer shows the artefact
   is demoted, not left alone; a cell not reachable in that session is recorded
   as carried forward.
2. In the same session, run the native output-style probe: plant one
   `coding-level-*.md` in the empty `~/.claude/output-styles/`, check the
   surface, record the output verbatim, then remove the planted file and confirm
   the directory is empty again.
3. Write the failing test for the rung the pre-decision table assigns to what
   step 2 showed: `spec-evidence.test.ts` for the level and the note,
   `provider-matrix.test.ts` for the cell.
4. Update `packages/cli/src/providers/spec-verified.ts`: `observedVersion`,
   claude-code's own `observedOn` literal, and the `outputStyle` cell with a note
   naming the probe surface and its literal result — including the negative
   result if that is what came back.
5. Remove the now-false "the matrix cell stays false until it is verified for
   real" comment at `packages/cli/src/providers/resolver.ts:73-75`.
6. Add the plan test asserting the six styles are written to
   `.claude/output-styles/` **and** to `.claude/hooks/av/output-styles/` with
   identical content, and that the sidecar skip reason still applies to every
   provider whose native cell is unverified.
7. Add the precedence test: a user-authored file at
   `~/.claude/output-styles/<name>.md` that differs from the kit's copy still
   wins `session-init`'s probe.
8. Rewrite the two comments at `packages/cli/src/install/install-plan.ts:53-56`
   and `162-170` so they describe the sidecar as the delivery path for any
   provider with a verified hook cell and an unverified native style surface —
   naming the set, not one member.
9. Update `kit/hooks/README.md`'s output-styles paragraph.
10. Regenerate the matrix (`pnpm --filter ariadnev generate:matrix`), run
    `matrix-drift.test.ts`, update
    `docs/decisions/0006-provider-verification-evidence.md` with the probe
    record.
11. `npx vitest run packages/cli/src/install packages/cli/src/providers`, then
    `pnpm lint`. Regenerate the embedded kit only if this phase is the last on
    the branch to touch `kit/` (Phase 0, step 14).

## Success Criteria

- [x] `spec-verified.ts`'s claude-code row records `observedVersion: "2.1.260"` and its own `observedOn` literal, not a constant shared with another provider.
- [x] The observation record names, per cell, whether it was re-checked against 2.1.260 or carried forward — no cell is silently re-dated.
- [x] The `outputStyle` cell sits at the rung the pre-decision table assigns, and its note quotes the probe surface and its literal result.
- [x] `~/.claude/output-styles/` is empty again after the probe, and the record says so.
- [x] If lifted: the six coding-level styles are written to `.claude/output-styles/` through `planOutputStyles`, and the native and sidecar copies are byte-identical.
- [x] A user-authored native style still wins `session-init`'s probe.
- [x] The sidecar survives in every branch, and neither comment at `install-plan.ts:53-56` / `162-170` still explains it by claude-code's cell being unverified.
- [x] README matrix regenerated; `matrix-drift.test.ts` green.
- [x] No other provider's row changed — verified by diffing `spec-verified.ts`.

## Risk Assessment

| Risk | Observable signal | Pre-decided response |
|---|---|---|
| The probe shows nothing and the cell is lifted on binary strings alone | The session surface does not name the planted style, but the cell reads `observed` | `observed` requires the artefact seen loading. An inconclusive probe lands at `convention` on the shipped-artefact ground, and the note must say the probe ran and did not show it |
| The widened `convention` wording becomes a licence to grade anything as `convention` | A later cell cites "the provider mentions the path somewhere" | The ground is the provider's **own shipped artefact** — its binary, schema, or a config file it wrote itself. A third party's file, or this tool's own output, is not that; Phase 2 exists because of exactly that confusion |
| Re-pinning the version implies six re-observations that did not happen | The record has fewer re-checks than the row has cells | Step 1 records carried-forward cells explicitly; the success criterion fails otherwise |
| Installing six kit styles into the native dir crowds out the user's own | A user reports their style stopped being picked | Precedence is by name and the user's file wins; step 7 pins it. The kit's styles are all `coding-level-*`, an unlikely accidental collision |
| Native and sidecar copies drift | The two files differ after an install | Step 6 asserts byte identity; both are written from the same `style.raw` |
| Re-observing demotes a cell other code assumes true | A resolver or plan test fails for `skill`/`agent`/`command`/`rules` | A demotion is the correct outcome and the installer's skip path already covers it; fix the assumption, do not restore the claim |
| Concurrent edit collision with Phase 1 | Both agents touch `install-plan.ts` in one worktree | Not a dependency but a coordination rule: these two phases run sequentially in the same worktree, in either order |

## Rollback

Every change is a comment rewrite, a cell literal, or a new test; the sidecar's
control flow is untouched in all branches. Reverting the `outputStyle` cell
restores the previous skip behaviour exactly, and the six native copies then
become orphans that the receipt-driven heal removes on the next install —
because unlike Phase 2's foreign files, ariadnev's own receipt claims these.
