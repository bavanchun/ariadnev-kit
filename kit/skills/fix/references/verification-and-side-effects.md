# Verification and Side Effects

Read this reference after implementation. A fix is not done until fresh
evidence proves the original failure is gone, the blast radius remains sound,
and the bug class is guarded where practical.

## Iron-law comparison

1. Re-run the exact pre-fix command/input/environment.
2. Compare exact error, output, timing, exit status, or behavior before/after.
3. Record the result; do not replace it with “should work now.”
4. If the original symptom cannot be rerun, state why and use the closest safe
   evidence without claiming stronger proof.

No completion claim without fresh evidence.

## Regression guard

Add or update a test that specifically covers the repaired behavior. Demonstrate
red-green in the same session: the guard fails without the fix for the expected
reason and passes with it restored. Keep the guard in the suite.

For a purely mechanical type/lint repair where runtime behavior is unchanged,
the type/lint gate may be the guard; explain why a new behavior test is not
useful.

## Blast-radius sweep

Prove side-effect freedom across:

- all modified files and transitively affected modules;
- every dependent caller of changed functions;
- shared business workflows and error/rollback paths;
- boundary, malformed, empty, maximum, timing, security, and performance cases;
- public contracts: signatures, exported types, response shapes, APIs, database
  schemas, migrations, configuration, and environment variables.

Public contracts must remain unchanged, or the change must be intentional,
approved, migrated, documented, and tested.

## Quality commands

Run the narrowest focused test first, then the relevant full blast-radius suite.
Also run project-defined typecheck, lint, build, integration/e2e/platform checks
when the changed contract reaches those layers. Execute directly; delegate
parallel verification only when explicitly requested/permitted.

Do not hide or weaken failures. A new unrelated-looking failure is evidence to
diagnose, not permission to skip it.

## Review and prevention

Run `av:code-review` or an equivalent local read-only review with scout summary,
diagnosis, change range, and proof. Check:

1. root cause is addressed rather than symptom-patched;
2. blast-radius business logic remains valid;
3. no new failure mode or unjustified scope appeared;
4. local project patterns and public contracts are preserved.

Apply defense in depth only where cause-aligned: boundary validation, invariant,
type constraint, database uniqueness/atomicity, timeout/retry policy, monitoring,
or an additional integration guard. Do not add speculative layers unrelated to
the demonstrated bug class.

## Side-effect hard gate

If verification reveals a side effect, regression, or broken workflow, stop.
Do not silently patch around it. Present what broke, why the fix caused it, and
2–4 concrete options grounded in actual files/tests:

- revert and investigate a different root-cause angle;
- narrow the fix to a stated subset;
- update named dependents and intentionally change the contract;
- accept the behavior change because the previous behavior was itself wrong.

Let the user decide; do not assume. After selection, update the repair contract
and re-enter diagnosis/implementation as needed.

## Failure loop

If the original repro or regression guard remains red, return to diagnosis with
the new evidence. After three failed repair attempts, stop and question the
architecture instead of trying a fourth patch.
