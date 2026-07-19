---
name: vc:fix
description: Fix bugs, test failures, and CI errors with proven root causes. Use for type errors, lint issues, failing tests, runtime bugs, or broken pipelines.
user-invocable: true
argument-hint: "<error message, failing test, or bug description>"
metadata:
  author: vchun
  version: "1.0.0"
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
