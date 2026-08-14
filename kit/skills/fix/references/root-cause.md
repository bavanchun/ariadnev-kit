# Root-Cause Loop

The full protocol behind av:fix step "prove". Read this when the bug is not
mechanically obvious.

## 1. Reproduce

- Find the exact command that fails and run it. Paste real output into your
  notes — memory of an error is not an error.
- Can't reproduce? That is the first mystery to solve. Vary: environment,
  data, ordering, timing, clean vs dirty state. An unreproduced bug cannot be
  proven fixed.
- Reduce: strip the reproduction to the smallest input/steps that still fail.

## 2. Hypothesize

- Write 2-3 candidate causes ranked by likelihood. One hypothesis is a bias;
  five is a fog.
- For each: what evidence would confirm it, what would rule it out.
- Prefer hypotheses that explain ALL symptoms. A cause that explains one
  symptom of three is probably a co-symptom, not the root.

## 3. Prove — pick the cheapest decisive probe

| Probe | When |
|---|---|
| Failing unit test that encodes the hypothesis | Cause is in reachable, testable code |
| Targeted log/print at the suspected boundary | State or ordering unclear |
| Binary search (git bisect, comment-out halves, input halving) | Regression with a known-good past |
| Read the code path end to end | Small surface; often fastest of all |
| Diff environments | Works-here-fails-there class |

Rules:
- One hypothesis under test at a time; record the verdict before moving on.
- A probe that neither confirms nor rules out was a bad probe — redesign it.
- When confirmed: state the mechanism in one sentence ("X returns stale Y
  because Z caches before invalidation"). If you cannot say that sentence,
  you have not proven it.

## 4. Fix

- Smallest change that removes the proven mechanism.
- Remove your debug probes; keep the failing-test probe as the regression
  guard.
- If the true fix is large (design flaw), stop and surface it: a scoped
  workaround + a plan beats a sprawling stealth refactor.

## 5. Verify

- Original reproduction passes.
- The regression test passed red → green in the same session (evidence).
- Neighboring tests/suites green; no new lint/type errors.
- Every original symptom is accounted for by the mechanism. Leftover
  symptoms mean a second bug — loop again, do not stretch the first fix.
