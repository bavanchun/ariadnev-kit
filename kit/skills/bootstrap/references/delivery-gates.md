# Delivery Gates

Read this reference after planning succeeds and `vc:cook` owns implementation.
It records bootstrap-specific completion obligations without duplicating cook's
internal workflow.

## Implementation and proof

- Implement phase by phase from the accepted plan.
- Run the narrowest relevant typecheck, compile/build, and tests as each phase
  changes behavior; widen at shared/public boundaries.
- Write real behavior and meaningful assertions. Do not use fake data, mocks,
  cheats, or temporary shortcuts merely to satisfy a check.
- Do not ignore failed tests to pass build/CI. Diagnose, fix, and rerun; report
  a real blocker if the failure cannot safely be resolved.
- Review delivered code for correctness, security, compatibility, scope, and
  test coverage. Fix accepted critical/important findings and retest.

The final evidence names commands, exit results, and proof layers actually run.
“Should pass” is not evidence.

## Documentation impact

After review passes, discover the repository's instruction documents and docs
navigation. Update the smallest justified owning surface only when delivery
changed user-visible behavior, setup, commands, configuration, architecture,
security, public contracts, or durable maintainer decisions.

Do not create or refresh a fixed document inventory. Update the active plan or
phase record for execution state; plans are not evergreen product authority.

## Onboarding

Guide the user through the minimum path to run the project:

1. prerequisites and install command;
2. safe environment-variable names and where to obtain values;
3. database/setup command when applicable;
4. deterministic development command and URL;
5. first verification or smoke test.

Never ask the user to paste a secret into chat or commit it. When a real product
choice is needed, ask one question at a time.

## Final report

Return:

1. summary of all changes with brief explanations;
2. test, build, review, and unresolved-risk evidence;
3. a getting-started guide and suggested next steps;
4. unresolved questions, or `none`;
5. a separate question asking whether the user wants a commit and/or push when
   neither action was already authorized.

Commit and push are distinct. If the user approves a commit, use `vc:git` for a
focused conventional commit. Push only when explicitly requested; speed or auto
mode never supplies that authorization.

## Completion gate

Bootstrap is complete only when acceptance criteria are mapped to evidence, the
project has a documented run path, the plan reflects actual completion, and all
known failures or omissions are stated plainly.
