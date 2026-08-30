---
name: av:test
description: "Run unit, integration, e2e, and UI tests. Use for test execution, coverage analysis, build verification, visual regression, and QA reports."
user-invocable: true
when_to_use: "Invoke for running or designing validation suites."
category: utilities
keywords: [test, unit, integration, e2e, coverage]
argument-hint: "[context] OR ui [url] [--ultra]"
metadata:
  origin: ported
  author: upstream
  version: "1.0.0"
---

# Testing & Quality Assurance

Comprehensive testing framework covering code-level testing (unit, integration, e2e), UI/visual testing via browser automation, coverage analysis, and structured QA reporting.

## Default (No Arguments)

If invoked with context (test scope), proceed with testing. If invoked WITHOUT arguments, use `ask_user capability` to present available test operations:

| Operation | Description |
|-----------|-------------|
| `(default)` | Run unit/integration/e2e tests |
| `ui` | Run UI tests on a website |

Present as options via `ask_user capability` with header "Test Operation", question "What would you like to do?".

## Core Principle

**NEVER IGNORE FAILING TESTS.** Fix root causes, not symptoms. No mocks/cheats/tricks to pass builds.

## When to Use

- **After implementation**: Validate new features or bug fixes
- **Coverage checks**: Ensure coverage meets project thresholds (80%+)
- **UI verification**: Visual regression, responsive layout, accessibility
- **Build validation**: Verify build process, dependencies, CI/CD compatibility
- **Pre-commit/push**: Final quality gate

## Workflows

### 1. Code Testing (`references/test-execution-workflow.md`)

Execute test suites, analyze results, generate coverage. Supports JS/TS (Jest/Vitest/Mocha), Python (pytest), Go, Rust, Flutter. Includes working process, quality standards, and tool commands.

**Load when:** Running unit/integration/e2e tests, checking coverage, validating builds

### 2. UI Testing (`references/ui-testing-workflow.md`)

Browser-based visual testing via `av:agent-browser`, `av:chrome-profile`, `av:web-testing`, or project-native Playwright/Vitest/k6 commands. Covers screenshots, responsive checks, accessibility audits, form automation, and console error collection.

**Load when:** Visual regression testing, UI bugs, responsive layout checks, accessibility audits

### 3. Report Format (`references/report-format.md`)

Structured QA report template: test results overview, coverage metrics, failed tests, performance, build status, recommendations.

**Load when:** Generating test summary reports

## Quick Reference

```
Code tests     → test-execution-workflow.md
  npm test / pytest / go test / cargo test / flutter test
  Coverage: npm run test:coverage / pytest --cov

UI tests       → ui-testing-workflow.md
  Screenshots, responsive, a11y, forms, console errors
  Auth: chrome-profile for real user login/cookies, or project-native test setup

Reports        → report-format.md
  Structured QA summary with metrics & recommendations
```

## Working Process

1. Identify testing scope from recent changes or requirements
2. Run typecheck/analyze commands to catch syntax errors first
3. Execute appropriate test suites
4. Analyze results — focus on failures
5. Generate coverage reports if applicable
6. For frontend: run UI tests via `av:agent-browser`, `av:chrome-profile`, `av:web-testing`, or project-native browser tests
7. Produce structured summary report

## Tools Integration

- **Test runners**: Jest, Vitest, Mocha, pytest, go test, cargo test, flutter test
- **Coverage**: Istanbul/c8/nyc, pytest-cov, go cover
- **Browser**: `av:agent-browser` for live browser interaction without real user cookies; `av:chrome-profile` for the user's actual Chrome login state, opened with `chrome-profile open --json` and bound by the returned selector; `av:web-testing` or project-native Playwright/Vitest/k6 for repeatable UI tests
- **Analysis**: `av:ai-multimodal` skill for screenshot analysis
- **Debugging**: `av:debug` skill when tests reveal bugs requiring investigation
- **Thinking**: `av:sequential-thinking` skill for complex test failure analysis

## Quality Standards

- All critical paths must have test coverage
- Validate happy path AND error scenarios
- Ensure test isolation — no interdependencies
- Tests must be deterministic and reproducible
- Clean up test data after execution
- Never ignore failing tests to pass the build

## Report Output
**IMPORTANT:** Invoke "the engineer project-organization skill" skill to organize the outputs.

Use naming pattern from `## Naming` section injected by hooks.

## Ultra Verifier Mode (`--ultra`)

`--ultra` applies to the analysis/design step of a suite-design,
suite-optimization, or test-audit request — the "designing validation suites"
half of this skill — never to test execution: a test run is evidence, not a
candidate, and is never fanned. When present, run that step as a best-of-5
verifier pass: one immutable evidence packet (scout reports, CI timings, git
history summary, the suspect or failing tests), exactly five independent
read-only candidates in one parallel wave, one strongest-model verifier.

- Suite design or optimization: the verifier selects the single winning suite
  design or optimization plan unchanged (or rejects all); implementation runs
  once from the winner.
- Test audit: the verifier returns the evidence-validated, deduplicated union
  of audit findings across the five candidates — a real deceptive test may be
  caught by only one candidate; repairs run once on the union.

On a plain execution request (`[context]` or `ui`), stop and say `--ultra` has
no design step to fan here; do not run the suite as if the flag were absent.
Full mechanics are in `../av-brainstorm/references/ultra-verifier-mode.md`. It
is a best-of-5 verifier mode inspired by LLM-as-a-Verifier, not the full
framework.

## Output format

Return the exact commands run, pass/fail/skip counts, focused failure evidence,
coverage only when measured, and any untested scope. Link generated reports or
screenshots when present.

## Quality gates

- Use the project's own test commands and the narrowest useful scope first.
- Never hide failures, invent coverage, or weaken assertions to make a run pass.
- Clean up test data and long-running processes created by the test run.

## Team Mode

When operating as teammate:
1. Discover the live task-management surface and the live team-coordination surface
2. Claim the assigned or next unblocked item when supported; otherwise read and update the active plan
3. Read the full work description before starting and wait for implementation prerequisites
4. Respect file ownership — only create/edit test files assigned
5. When done, record completion and report results through the live team surface

Plan files are the durable source of truth when runtime task tracking is absent
or session-scoped.

## Workflow position

**Typically follows:** `/av:cook` (test after implementation), `/av:fix` (test after bug fix)
**Typically precedes:** `the installed code-review skill` (review after tests pass)
**Related:** `/av:cook` (implement then test), `/av:fix` (fix then test)
