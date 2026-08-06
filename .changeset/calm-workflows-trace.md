---
"vcskill": minor
---

Add source-aware quality gates and deepen the bundled workflow kit:

- add strict offline `vcskill coverage [--skill <name>]` checks for classified
  upstream claims and enforce the same findings through `validate`;
- enforce required skill sections, cross-skill references, and provenance for
  the complete 26-skill catalog;
- pin upstream versions and canonical whole-tree SHA-256 digests, with explicit
  fork and original-skill handling;
- reshape eight compressed skills into router-thin, references-deep workflows;
- reject unknown `eval --skill` filters instead of passing an empty selection.

All 26 skills pass the static Tier-1 gate and all eight claim-tracked skills
pass strict coverage. These checks detect structural drift and omissions; they
do not claim behavioral parity.
