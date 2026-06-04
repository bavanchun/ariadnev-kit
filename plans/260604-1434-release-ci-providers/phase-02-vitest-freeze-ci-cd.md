---
phase: 2
title: "Vitest Freeze (CI/CD)"
status: done
priority: P1
effort: "3h"
dependencies: [1]
---

<!-- Updated: Validation Session 1 - raise coverage threshold to 95% -->

# Phase 2: Vitest Freeze (CI/CD)

## Overview
This phase implements continuous integration automation using GitHub Actions. It establishes a pipeline that validates every Commit and Pull Request against compiling typechecks (`tsc --noEmit`), unit test assertions (`vitest run`), and strict code coverage minimums (enforcing $\ge 95\%$ coverage on the `adapt/` module). This locks in codebase quality and prevents regression.

## Requirements
*   **Functional**:
    - Build a `.github/workflows/ci.yml` file.
    - Set triggers for push events to `main` and pull requests targeting `main`.
    - Set execution environment to standard Linux container (`ubuntu-latest`).
    - Cache dependencies via `pnpm` action setup.
    - Run type check verification: `pnpm run lint` (runs `tsc`).
    - Run compile check: `pnpm run build` (runs `tsup`).
    - Run test suite and coverage gates: `pnpm run coverage` (runs `vitest run --coverage`).
    - Ensure CI fails automatically if Vitest coverage falls below configured thresholds.
*   **Non-functional**:
    - Fast build execution times (<2 minutes overall CI runtime).
    - Cache key optimization for Node modules.

## Architecture
```
GitHub Push / PR
       │
       ▼
[Setup Runner: ubuntu-latest]
       │
       ▼
[Setup Node.js & pnpm cache]
       │
       ▼
[pnpm install --frozen-lockfile]
       │
       ├─────────────────────────────────┐
       ▼                                 ▼
[pnpm run lint (Typecheck)]     [pnpm run build (Compile)]
       │                                 │
       └────────────────┬────────────────┘
                        ▼
           [pnpm run coverage (Vitest)]
                        │
                        ▼
                [Deploy / Success]
```

## Related Code Files
*   **Create**:
    - `.github/workflows/ci.yml` (CI Workflow configuration)
*   **Modify**:
    - `vitest.config.ts` (Ensure thresholds apply strictly and cover all critical adapt layers)

## Implementation Steps
1.  **Create workflow directory and file**: Scaffold `.github/workflows/ci.yml`.
2.  **Define job steps**:
    - Checkout code.
    - Setup Node $\ge 18$.
    - Setup pnpm.
    - Install dependencies using `pnpm install --frozen-lockfile`.
    - Run type checking: `pnpm run lint`.
    - Run build step: `pnpm run build`.
    - Run coverage check: `pnpm run coverage`.
3.  **Local validation**:
    - Simulate CI run steps locally in a clean shell sequence to ensure they run without interactive prompts.
    - Intentionally lower coverage in a temporary dummy file to confirm Vitest exits with non-zero code, successfully failing the run.

## Success Criteria
- [ ] `.github/workflows/ci.yml` is successfully committed.
- [ ] Local simulation of pipeline commands completes successfully.
- [ ] Coverage gate enforcement is verified (non-zero exit on threshold violation).

## Risk Assessment
*   **Risk**: Flaky tests failing the pipeline randomly.
    - *Mitigation*: Ensure unit tests do not rely on local environment settings, user directories, or clock drifts. Use absolute project root resolutions.
*   **Risk**: Missing lockfile updates causing install mismatch.
    - *Mitigation*: Run `pnpm install` locally first to ensure `pnpm-lock.yaml` is clean and fully synchronized before push.
