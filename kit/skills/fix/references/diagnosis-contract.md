# Diagnosis Contract

Read this reference before proposing a repair. The output is a reproducible
failure model and evidence chain, not a solution.

## Scout-first inventory

Collect before forming hypotheses:

1. project type, languages, and frameworks from `package.json`,
   `pyproject.toml`, `go.mod`, manifests, and repository instructions;
2. exact files where the symptom surfaces plus direct callers/dependents;
3. related tests and fixtures covering the affected area;
4. recent commits touching those files (`git log --oneline -20 -- <paths>`) as
   possible introducers, without assuming the newest commit is guilty;
5. existing local patterns/conventions for this behavior;
6. docs or contracts that define expected behavior when the code alone cannot.

Use `vc:scout` or native search/read. Launch 2–3 independent explore subagents
only when delegation is explicitly requested/permitted and their scopes do not
overlap.

## Capture pre-fix state

Record exact error messages, failing assertions, stack traces, relevant log
snippets, command, input/data shape, environment, and exit status. Copy the
symptom verbatim instead of paraphrasing. This is the baseline re-run during
verification.

Reduce the reproduction to the smallest deterministic sequence. If it is
environment-, timing-, or data-dependent, record those conditions. A static
security/contract defect can use a source-level proof plus a failing guard when
runtime reproduction would be unsafe.

## Six concrete answers

Do not propose a fix until each has one concrete sentence:

| Question | Required evidence |
|---|---|
| Exact symptom | verbatim error/assertion/observed behavior |
| Reproduction | minimal commands, inputs, environment |
| Expected vs actual | contract and observed mismatch |
| Root cause | specific line, missing check, race, contract violation, or design flaw at `file:line` |
| Why now | introducing commit, new data shape, environment, timing, or dependency change |
| Blast radius | every dependent path or shared mechanism |

The cause must explain all observed symptoms. Leftover symptoms indicate a
second bug or an incomplete model.

## Hypothesis discipline

Use a concise structured ledger, optionally through `vc:sequential-thinking`:

| Hypothesis | Decisive probe | Result | Evidence |
|---|---|---|---|
| <cause> | <check that distinguishes it> | confirmed/eliminated | <output/path> |

Test one hypothesis at a time. Prefer the cheapest probe that can confirm or
eliminate it: focused test, instrumentation, code-path trace, environment diff,
query/profile data, or a history bisect.

Use the vc-debugger agent/capability when available for deep root-cause tracing.
If two or more hypotheses fail, route to `vc:problem-solving` to reframe instead
of manufacturing another variation of the same guess.

## Missing diagnostic facts

First search the workspace and available logs. If a required fact still belongs
to the user or external environment, ask with grounded options such as:

- which of these exact commands reproduces;
- which named deployment/environment fails;
- whether behavior changed after a cited commit/dependency version;
- which accepted contract governs an ambiguous expected result.

Never ask an abstract “what do you think the cause is?” and never use user
uncertainty as permission to guess.

## Logs and CI

For logs, correlate timestamps, error codes, stack frames, and repeated groups
with source paths. A plan is premature until log evidence and code paths agree
on the root cause.

For CI, inspect the failed step and preceding context, then compare runtime,
OS, dependency lock, environment variables, permissions, cache, and timing with
local execution. Fetch logs with `gh` only when available/authenticated. Test
the cause-aligned fix locally before any separately authorized push.

## Diagnosis output

Return the six answers, hypothesis ledger, evidence chain, affected scope, and
remaining unknowns. Do not include implementation steps until the cause gate
passes.
