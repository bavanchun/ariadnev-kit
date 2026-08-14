# Stack and Planning

Read this reference when selecting the implementation stack, deciding whether
design work is needed, and creating the plan/cook handoff.

## Stack decision

If the user provides a preferred stack, verify that it satisfies the accepted
constraints and move on unless evidence reveals a material conflict.

Otherwise:

1. Use the planner plus multiple researcher agents in parallel for independent
   questions such as runtime fit, persistence, deployment, and ecosystem risk.
2. Compare 2–3 best-fit stack options with concrete pros, cons, maintenance
   cost, and the condition that would disqualify each.
3. In full mode, present options through the user-question capability and wait
   for selection. Other modes follow their approval contract.
4. Record the approved tech stack in the smallest durable documentation surface
   discovered from repository instructions; do not assume `./docs` exists.

The record should name versions only when pinned, decision drivers, rejected
alternatives, and compatibility/deployment constraints. Avoid a generic stack
catalog.

## Optional design branch

Design is justified for a user-facing surface whose layout, interaction, brand,
or assets affect acceptance criteria.

- Full mode asks whether wireframes/design are wanted and skips when declined.
- Auto and parallel retain a design approval gate when design is produced.
- Fast can proceed without a separate gate only when its mode contract allows
  it and the design requirements are already concrete.
- Use an installed design/browser/media capability when available. The av kit
  does not bundle dedicated `ui-ux-designer`, `ai-multimodal`, or
  `agent-browser` assets, so never promise them.
- Without a specialist capability, encode layout, states, responsive behavior,
  accessibility, and asset requirements in the plan; do not fabricate visuals.

Store durable approved guidance where project navigation owns it. Temporary
wireframes and screenshots are artifacts, not automatically evergreen docs.

## Planning handoff

Bootstrap does not implement code directly—delegate through planning and cook
skills:

1. Provide `av:plan` the requirements and complete opening contract.
2. Include approved stack/design decisions and source paths rather than copying
   all research prose.
3. Require observable acceptance criteria, dependencies, risks, rollback, and
   proof commands.
4. For parallel mode, require exclusive file ownership and execution groups.
5. Capture the returned plan path.
6. Apply the mode's approval gate.
7. Pass the plan path to `av:cook` with the same mode intent.

Every independent planning branch receives the outcome, constraints, non-goals,
acceptance criteria, and fixed stack/design decisions. A branch must not
silently reinterpret the product contract.

## Handoff failure

If planning cannot produce a valid plan path, stop and report the missing
decision or tool failure. Do not bypass the plan gate by scaffolding directly.
If cook finds the plan stale, reconcile the plan with current evidence before
implementation resumes.
