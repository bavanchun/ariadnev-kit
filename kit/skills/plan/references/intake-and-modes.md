# Intake and Planning Depth

Use this reference before research or phase design. Its purpose is to keep the
plan tied to a real goal and a real repository instead of an imagined system.

## Pre-creation check

1. Resolve whether the current context has an active plan, a suggested plan, or
   no plan. Continue an active plan only when its goal matches the request.
2. Read `plan.md` frontmatter for every unfinished project plan (`status` is not
   `completed` or `cancelled`).
3. Compare file scope, shared dependencies, feature area, public contracts, and
   delivery order.
4. Classify overlap:
   - new work needs an existing result → new `blockedBy` existing;
   - existing work needs this result → new `blocks` existing;
   - independent overlap → record shared ownership/risk, not a false dependency.
5. Update both plan hubs for a confirmed bidirectional relationship. When the
   direction is ambiguous, present the detected overlap and ask whether it is
   `blocks`, `blockedBy`, or `none`.

Resolve references against the explicit project plan root. A missing reference
must warn and show `not found`; it must not block plan creation by itself.

If existing `plan.md` or generated `phase-*.md` stubs will be edited, enumerate
all of them, read the hub, then read every phase stub—including future phases—
before drafting. Never overwrite a generated stub unread in the current session.

## Discover owning context

Do not assume a standard documentation corpus or fixed docs path.

1. Read loaded repository instructions and the root README.
2. Follow their navigation to current development/security rules, architecture
   maps, product requirements, and design guidance relevant to the goal.
3. Verify documented behavior against source, tests, manifests, schemas, build
   configuration, and live state where appropriate.
4. When navigation is absent, stale, or conflicting, scout for owning evidence
   and record the actual paths.
5. Research external APIs or standards only when they affect the design, using
   current primary documentation.

Research can run in the main session. Delegation is an optimization only when
the user authorized it and ownership is separable; it is never a prerequisite.

## Scope challenge

Answer three questions before investing in design:

1. **What already exists?** Find reusable utilities, services, tests, patterns,
   migrations, and partially completed plans.
2. **What is the minimum change set?** Separate core outcome from optional or
   stretch work. Label every stretch item explicitly.
3. **What carries complexity?** Challenge more than eight touched files, more
   than two new abstractions, or more than three phases; keep them only with an
   evidence-backed reason.

If scope is still a material choice, ask: “Based on analysis, how should we
scope this plan?” Offer concrete expansion, hold-scope, and reduction options.
Respect the answer; never silently expand or shrink a user-selected scope.

## Choose depth

- **Fast:** clear and low-risk. Skip broad research, but still inspect owning
  files/tests and write verifiable criteria.
- **Standard:** cross-module or contract-sensitive. Research alternatives,
  verify current architecture, then design and review.
- **Deep:** five-plus affected areas, architectural debt, security/data risk, or
  hard rollback. Add focused scouting for every phase.
- **Parallel-ready:** three-plus independent work streams. Prove disjoint file
  ownership and express parallel groups without depending on a special runner.

Scope expansion may research adjacent features and alternatives; keep them as
clearly labeled stretch work. Scope reduction defers every non-blocking item.

## Load-bearing assumptions

List only assumptions the design fails without. Resolve each from source,
tests, or live state when possible. For every unresolved assumption, record:

- the observable signal that it broke;
- the success criterion it invalidates;
- the switching cost or lock-in;
- whether the response is adjust inside the phase or stop and replan.

Prefer the design cheapest to reverse when equally plausible assumptions remain.
