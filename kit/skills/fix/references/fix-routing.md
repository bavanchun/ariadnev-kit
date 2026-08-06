# Fix Routing

Read this reference only after scout and diagnosis prove the cause. Route by
repair complexity and failure class; do not let a familiar error label replace
root-cause evidence.

## Complexity routes

| Route | Proven shape | Delivery |
|---|---|---|
| Quick | one file/direct dependency, mechanical cause, one safe repair | minimal edit → focused verify → review |
| Standard | 2–5 files or shared behavior, cause known | record dependencies → implement → blast-radius verify → review |
| Deep | 5+ files, security/performance/architecture or multiple viable repairs | research if needed → post-diagnosis brainstorm → plan → phased implementation |
| Parallel | 2+ independent failures with disjoint ownership | separate scout/diagnose/fix/verify trees → integration join |

Plan files are the durable source of truth. Runtime tracking is optional and
must never be required for a fix to proceed. Quick work under three meaningful
steps does not need orchestration overhead.

Deep workflow always includes the post-diagnosis solution brainstorm and a
plan. Preserve the opening constraints and non-goals while comparing options.

## Type and lint failures

1. Run the project's typecheck/lint command and retain complete diagnostics.
2. Group errors sharing one root cause; fix errors in dependency order.
3. Never use `any` just to pass—use proper types, `unknown` plus narrowing, or
   repair the incorrect contract.
4. Never add an inline disable merely to silence a valid rule.
5. Re-run typecheck, fix errors one by one, and repeat until clean.
6. Run affected tests/build because a type-clean change may still alter behavior.

For a truly mechanical formatting rule, the configured auto-fixer is acceptable
when the diff is reviewed and behavior remains unchanged.

## Test failures

1. Compile/collect the relevant failures, then group by module or shared cause.
2. Decide from the accepted behavior whether code, test, fixture, or environment
   is wrong; never change a test merely because it is red.
3. Start with the narrow failing test, then broaden through the blast radius.
4. Preserve meaningful fixtures and real boundary contracts.
5. If the test remains red, return to diagnosis—not another implementation
   tweak.

## Logs and runtime bugs

Fetch/read the smallest useful log slice, analyze root cause from logs, trace
backward from the symptom frame, and implement only after log evidence matches
the code path. Validate ordering, state lifetime, retries, and error handling
when runtime behavior is intermittent.

## CI failures

1. Fetch failed CI logs and identify the first causal failure, not cascaded noise.
2. Compare CI and local environment/dependencies/permissions/cache.
3. Implement based on the confirmed analysis.
4. Test locally with the project test/build commands before any push.
5. If tests fail, re-diagnose from the new evidence; do not blindly repeat the
   implementation step.

## UI failures

Inspect the accepted design, screenshot/video, DOM/CSS, console, network, and
interaction state. Use installed browser/design capabilities or project-native
visual/e2e tests. The vc kit does not guarantee upstream `ak:ui-ux-pro-max` or
`ak:frontend-design`; do not claim they ran. Verify responsive, accessibility,
runtime, and visual behavior at the affected container.

## Parallel route

Parallel work requires explicit user permission (the `--parallel` flag counts),
independent issues, and non-overlapping files/contracts. Example:

1. scout payment handlers in one read-only scope;
2. scout order processors in another;
3. wait for both diagnoses before assigning disjoint fixes;
4. update the active plan/live progress surface;
5. join and verify tests, typecheck, lint, and build across both scopes.

Do not spawn subagents only because a skill says to. Without permission or a
safe split, execute the same route sequentially in the main workflow.
