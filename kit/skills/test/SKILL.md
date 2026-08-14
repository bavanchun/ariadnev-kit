---
name: av:test
description: Run unit, integration, and e2e suites with coverage and build verification, then emit a QA gate verdict. Use to validate an arbitrary target's tests standalone, not inside a cook run.
user-invocable: true
argument-hint: "[scope or path] [ui <url>]"
metadata:
  author: vchun
  version: "1.0.0"
  category: core-loop
---

# Test

Run and judge tests for a target you point it at — standalone, outside a full
`av:cook` cycle. Produces a QA verdict against the project's own thresholds, not
a vibe.

Handles: unit / integration / e2e suites, coverage analysis, build verification,
and (with `ui <url>`) browser/visual checks. When a test reveals a real bug,
hand off to `av:fix` — this skill validates and reports, it does not fix code.

## Core rule

**Never ignore a failing test.** No mocks, skips, or `.only` to force green. A
red suite is the output, reported honestly — fixing the cause is `av:fix`.

## Workflow

1. **Scope** from the argument or recent changes: which suites cover the target.
   No scope + no context → ask the user (`AskUserQuestion`).
2. **Typecheck/lint first** — cheap syntax/type errors before running the slow
   suite.
3. **Run** the auto-detected runner (Vitest/Jest, pytest, `go test`, `cargo test`,
   `flutter test`, …). Delegate the run + analysis to the `av-tester` agent.
4. **Coverage + build** when the project defines them: compare against the
   project's threshold; run the build for an exit-0 check.
5. **UI** (`ui <url>`): browser checks — screenshots, responsive, a11y, console
   errors — via the project's Playwright/native setup.
6. **Classify** each result by proof layer (`unit`/`integration`/`e2e`/`platform`,
   `cook/references/risk-lanes.md`) and emit the gate verdict.

## Output format

```
<verdict emoji> Gate: PASS | FAIL
Suites: <N passed, M failed, K skipped> · runner: <detected>
Build: <exit 0 | failed> · Typecheck: <clean | N errors>

Coverage (if configured):
| Layer | Covered | Threshold | Status |
|-------|---------|-----------|--------|
| unit  | 84%     | 80%       | ✅     |

Failures (if any):
- <test name> — <file:line> — <assertion: expected vs actual>

Next: <"green — ready for review/ship" | "route <failure> to av:fix">
```

Proof/risk: this skill *is* the proof step — it states which layers
(`unit`/`integration`/`e2e`/`platform`) actually ran, so a downstream
`av:code-review` or `av:ship` verdict rests on evidence, not assumption.

## Quality gates

Before returning, confirm:
- The reported pass/fail reflects real command output pasted/summarized, not an
  assumed result — no "should pass".
- Gate is FAIL if any suite failed or the build broke, regardless of coverage.
- Coverage compared against the *project's* threshold, not a guessed number.
- Each failure names `file:line` + expected-vs-actual so `av:fix` can start.

## Workflow position

**Typically follows:** `av:cook` (validate after implementing), `av:fix` (confirm a fix)
**Typically precedes:** `av:code-review` (review once tests are green), `av:ship` (ship gate)
**Related:** `av:fix` (fix what fails), `av:scenario` (design the cases before running)

