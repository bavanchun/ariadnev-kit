# Bootstrap Mode Routing

Read this reference after the opening contract is concrete. Mode changes speed,
parallelism, and approval pauses; it never lowers product-definition or safety
quality.

## Full mode (default)

Use for ambiguous or consequential blank-slate products.

1. Refine only material gaps in the accepted outcome, constraints, non-goals,
   and acceptance criteria.
2. Research feasibility, risks, and viable approaches. Present findings and
   wait for approval.
3. Ask for the preferred tech stack. If none is supplied, compare 2–3 options
   against the contract and obtain approval.
4. For a user-facing product, ask whether wireframes/design are wanted. Skip the
   branch when declined; otherwise obtain design approval.
5. Run thorough planning and present the plan's trade-offs.
6. **Gate:** user approves the plan. Do not start implementing without approval.
7. Hand the approved plan to interactive `av:cook`.

Ask one material question at a time. Do not ask for facts discoverable in the
workspace.

## Explicit auto mode

Use only when the user explicitly requests `--auto` or unambiguously authorizes
autonomous completion.

- Research and select the best-fit stack from the accepted contract without a
  routine approval pause.
- If design is in scope, present it for approval before planning further.
- Plan and cook autonomously after that gate.
- Stop for a true blocker, destructive/high-risk authorization boundary, or a
  decision whose alternatives materially change the accepted product.
- Auto does not imply Git commit, push, deployment, payment, or external
  communication authority.

## Fast mode

Use when requirements and stack constraints are already clear.

1. Run only targeted, parallel research needed to close a real evidence gap.
2. Resolve stack and design once; avoid a second research pass inside planning.
3. Call `av:plan` with fast intent and the full opening contract.
4. Hand off to ordinary `av:cook`; fast mode keeps cook review gates.

Fast optimizes setup latency. It does not bypass approvals or test depth.

## Parallel mode

Use only when the plan can assign disjoint file ownership and explicit
dependencies.

1. Research requirements and best-fit stack in parallel where source scopes are
   independent.
2. Resolve optional design and obtain approval.
3. Ask `av:plan` to produce a dependency graph, execution groups, and exclusive
   file ownership.
4. Pass the opening brainstorm contract to every independent planning branch.
5. Run `av:cook` with parallel intent while retaining normal review gates.

Parallel controls execution shape, not approval bypass. If two phases touch the
same file, generated artifact, migration order, or shared config, sequence them.

## Mode conflicts

- No flag means full.
- More than one flag is ambiguous; ask which behavior governs.
- “Quickly” alone does not authorize fast or auto.
- “Do not stop; finish it” can authorize autonomous continuation within scope,
  but does not broaden destructive or external actions.
