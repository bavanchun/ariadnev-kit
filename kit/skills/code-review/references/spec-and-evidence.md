# Spec Compliance and Verification Evidence

Read this reference before code-quality ranking and before any review verdict.
Well-written code that implements the wrong request is still wrong.

## Stage 1 — spec compliance

1. Load the spec/plan: read `plan.md`, the owning phase file, issue, or accepted
   requirements that defined the work.
2. List every requirement, explicit non-goal, acceptance criterion, and public
   compatibility constraint.
3. Check each against actual implementation and tests:
   - present → `PASS` with `file:line`/test evidence;
   - missing → `MISSING` (must fix before quality review);
   - extra → `EXTRA` and require a justification/decision;
   - conflicting evidence → `UNRESOLVED`, never silently choose the tidy story.
4. Verdict: all requirements met and no unjustified extras → Stage 1 passes;
   otherwise stop before Stage 2.

| Requirement | Status | Implementation evidence | Proof gap |
|---|---|---|---|
| <what it should do> | PASS/MISSING/EXTRA/UNRESOLVED | <file:line/test> | <gap> |

Do not infer scope from the diff alone; compare it with the accepted contract.
Do not reverse a verified user decision because a generic checklist prefers
another trade-off.

## Stage 2 — quality

After Stage 1 passes, inspect correctness, security, reliability, performance,
maintainability, edge cases, and project-rule compliance. Use the baseline
checklist and severity rubric. A quality improvement outside scope is a
Suggestion only when it has concrete value and no compatibility cost.

## Evidence before claims

Core principle: evidence before claims, always.

Before stating a test/build/fix/requirement result:

1. identify the command or source inspection that proves it;
2. run/read it fresh and completely;
3. inspect exit code, failure count, and relevant output;
4. compare the result with the exact claim;
5. state the evidence or state that it is unverified.

| Claim | Sufficient evidence | Not sufficient |
|---|---|---|
| Tests pass | test command output: 0 failures | previous run, “should pass” |
| Build succeeds | full build exits 0 | lint or typecheck alone |
| Bug fixed | original symptom/regression test passes | code changed |
| Requirement met | requirement-to-code/test mapping | suite green in general |
| Reviewer finding valid | cited code/reproduction supports failure | agent report |

## Language red flags

Using “should”, “probably”, or “seems to” signals a missing check. “Should work
now” means run the verification, not soften the sentence. Satisfaction before
verification and trusting agent reports are also stop signs.

## Finding proof

Every finding must include:

- exact `file:line`;
- problem and violated contract/invariant;
- reproducible input/state → wrong result;
- cause-aligned fix, not a symptom patch;
- proof layer that would fail before and pass after the fix.

If the failure cannot be demonstrated from source or execution, phrase it as an
open question or omit it. Do not promote uncertainty into a blocking finding.

## Final verdict

- `Request changes`: one or more Critical/Important findings or Stage 1 fails.
- `Comment`: only non-blocking Suggestions or bounded verification gaps.
- `Approve`: no actionable findings and required evidence is fresh.

The verdict summarizes evidence; it does not authorize edits, commits, replies,
merges, or deployment.
