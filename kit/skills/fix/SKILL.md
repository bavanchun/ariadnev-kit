---
name: vc:fix
description: Fix bugs, test failures, and CI errors with proven root causes. Use for type errors, lint issues, failing tests, runtime bugs, or broken pipelines.
user-invocable: true
argument-hint: "<error message, failing test, or bug description>"
metadata:
  author: vchun
  version: "1.0.0"
  upstream: "ak:fix"
  upstream_version: "2.2.0"
  upstream_digest: "sha256:8d530048e1a977f21926a1c50a7ba5e83742d9bd31afd1795d6c38afba3b6167"
  upstream_relation: "distill"
---

# Fix

Bug-fixing pipeline with one non-negotiable rule: **prove the cause before
changing behavior**. A fix without a demonstrated root cause is a guess, and
guesses get reverted.

Handles: bugs, failing tests, type/lint errors, CI failures, runtime crashes.
Does not handle: new features (`vc:cook`), performance redesigns
(`vc:brainstorm` first).

## Routing by error class

| Class | Fast path |
|---|---|
| Type error | Read the full compiler message; fix the type model, not with `as any` |
| Lint error | Auto-fix if the rule is mechanical; otherwise fix the code, never inline-disable without a comment saying why |
| Failing test | Decide first: is the test wrong or the code wrong? Evidence, not preference |
| CI-only failure | Diff CI env vs local (node version, env vars, cache, OS) before touching code |
| Runtime bug | Full root-cause loop — read `references/root-cause.md` |

For anything beyond a one-line mechanical fix, run the root-cause loop.

## The loop (details in references/root-cause.md)

1. **Reproduce** — make it fail on demand; capture the exact command+output.
2. **Hypothesize** — list 2-3 candidate causes ranked by likelihood.
3. **Prove** — instrument, isolate, or write a failing test that pins the
   cause. This step gates the next: no proof, no fix.
4. **Fix** — smallest change that addresses the proven cause. Keep the
   regression test.
5. **Verify** — reproduction now passes; nearby suite still green; the fix
   explains all observed symptoms (not just the loudest one).

## Hard rules

- No fix without a reproduced failure and a proven cause ("prove-before-fix").
- No shotgun edits: one hypothesis under test at a time.
- Symptoms in different places than the edit → walk the connection out loud.
- Regression test stays in the suite; commit via `vc:git`
  (`fix: <cause, not symptom>`).
- Three failed hypotheses → stop, summarize evidence, widen with `vc:scout`
  or take it to `vc:ask` — do not keep poking.

## Output format

```
✅/⚠️ <one-line: what was broken and why>
- Root cause: <proven mechanism>
- Evidence: <repro command, failing→passing test>
- Fix: <files changed>
- Regression guard: <test name/path>
```

## Quality gates

- [ ] The failure was reproduced on demand; the exact command + output captured
- [ ] The cause is proven, not inferred — instrumentation, isolation, or a test
      that fails for the stated reason
- [ ] The fix is the smallest change addressing that cause; no `as any`, no
      uncommented lint disable
- [ ] The cause explains every observed symptom, not just the loudest one
- [ ] A regression test stays in the suite and the nearby suite is green
- [ ] After three failed hypotheses, stopped and widened instead of poking

## Workflow position

**Typically follows:** a failing test, CI run, or bug report — often handed over
by `vc:test` (a suite went red) or `vc:cook` (a gate caught a regression).
**Typically precedes:** `vc:code-review` (review the fix), `vc:git` (commit as
`fix: <cause>`), `vc:journal` (record a hard-won root cause).
**Related:** `vc:cook` for feature work; `vc:scout` to widen the search when
hypotheses run out; `vc:brainstorm` when the "bug" is really a design problem.
