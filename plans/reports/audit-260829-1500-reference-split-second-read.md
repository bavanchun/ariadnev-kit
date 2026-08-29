# Second read — reference-file splits

**Date:** 2026-08-29 15:00 ICT. **Reader:** fresh general-purpose agent, no
authoring context. **Scope:** commits `e90412c`, `07d0c73`, `2bba4c7`,
`450b558`, `e800877` — the five that carry the over-cap reference splits.

## Verdict

All five are genuine splits. Nothing deleted, nothing renamed, content
conserved line-for-line. No fixes required in the files.

## The suspicion that sent the reader, and why it was wrong

The coordinator read `git show --stat` output of the shape `path | 399 -------`
as a file deletion, and the equal insert/delete counts as a rename mislabelled
"split". Both readings were wrong. `--stat` renders *lines removed from a file*
identically to a file deletion; `--summary` is the discriminator and shows no
`delete mode` and no `rename` line in any of the five commits. The equal counts
are the signature of a clean cut — N contiguous lines lifted verbatim onto a new
file, unedited.

Recorded because the misread is cheap to repeat and the check that settles it is
one flag.

## Evidence

Content conservation, exact in all eight cases:

| Original | Before | After | New sibling | Sum |
|---|---|---|---|---|
| `preview/references/html-css-patterns.md` | 1717 | 797 | 319 + 601 | 1717 |
| `preview/references/html-slide-patterns.md` | 1401 | 473 | 576 + 352 | 1401 |
| `mobile-development/references/mobile-debugging.md` | 1089 | 436 | 653 | 1089 |
| `payment-integration/references/sepay/best-practices.md` | 939 | 599 | 340 | 939 |
| `backend-development/references/backend-debugging.md` | 904 | 449 | 455 | 904 |
| `payment-integration/references/polar/best-practices.md` | 902 | 415 | 487 | 902 |
| `mintlify/references/api-documentation-components-reference.md` | 873 | 474 | 399 | 873 |
| `payment-integration/references/multi-provider-order-management-patterns.md` | 821 | 474 | 347 | 821 |

- Heading overlap across all six pairs of the two preview splits: empty
  (`comm -12` on sorted H1-H3 sets). No reader is sent to two places for one
  subject; SKILL.md cites each split set as a unit.
- Every new file is cited by its owning SKILL.md; no path anywhere in `kit/`
  points at a file that does not exist.
- `validate --check --strict` clean.

## Findings acted on

1. **`plan.md` "Measured" table said 6 reference files over 800; the measured
   figure is 8.** Corrected in place, matching that table's own convention of
   noting the superseded number. `phase-08` line 54 deliberately left at 6 —
   its correction section directly below opens "The table above says 6", and
   editing the table would make that sentence false.
2. **`skill-lint.ts` comment described a census that no longer holds** ("6
   exceed 800", "822-1718 lines"). Post-split that count is 0. Rewritten as the
   historical rationale for the value it guards.

## Gap found, not closed

The cap reaches only directories named exactly `references/`. Three files ship
over it:

| File | Lines |
|---|---|
| `mcp-builder/reference/node-mcp-server.md` | 918 |
| `mcp-builder/reference/mcp-best-practices.md` | 915 |
| `frontend-development/resources/complete-examples.md` | 871 |

Wider than the non-recursion the source comment already anticipates — this is a
different directory *name*, not a subdirectory. `install-plan.ts` copies
recursively and by any name, so all three reach a user's disk at full length
while the rule reads as satisfied. Left open: the phase enumerated its eight
targets by name and these are not among them.

## Unresolved questions

- Should the reference cap match on content role rather than directory name?
  Widening it flags three files immediately and turns a green gate red until
  they are split (~2-3 h).
