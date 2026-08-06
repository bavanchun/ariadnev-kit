# Adaptation: vc:code-review vs ak-code-review

Pinned source: `ak:code-review` v2.0.0. The vc version keeps the upstream review
order and evidence discipline while fitting vc's read-only reviewer boundary.

## Retained

- input resolution for PR, commit, pending, codebase, and parallel audit;
- YAGNI/KISS/DRY and distrust of AI-assisted polish;
- spec-compliance Stage 1 before quality Stage 2;
- edge-case scouting before findings;
- upstream `checklists/base.md` as the always-loaded
  `review-checklist.md`, with API and web overlays;
- `file:line` + problem + failure + fix finding structure;
- fresh verification before verdicts;
- tracked `scout → review → fix → verify` integration and plan sync.

## Adapted

- The reviewer remains report-only. Accepted Critical/Important findings route
  to `vc:fix`; the controller then returns fresh evidence for re-review.
- Runtime task tracking is optional and disposable; the active plan is durable.
- The many small upstream references are grouped by decision point so SKILL.md
  links directly to one-level, non-chained guidance.
- Upstream optional reviewer agents are never trusted as evidence; cited code
  and command output are rechecked by the controller.

## Rejected extraction fragments

Registry claims consisting only of “never:” or “always before:” have no
independent operational meaning after extraction. Their substantive child rules
are retained in the pipeline, checklist, and evidence references instead of
pretending the fragments themselves are verifiable behavior.

## Improvement

The shared severity rubric aligns local review with `vc:review-pr`, and every
defect names the `unit`, `integration`, `e2e`, or `platform` proof expected from
the downstream fix.
