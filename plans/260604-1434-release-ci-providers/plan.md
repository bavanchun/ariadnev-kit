---
title: "Next Actions: Package Release, CI Freeze, and Provider Framework"
description: "Detailed implementation plan for publishing the vcskill CLI package, setting up GitHub Actions CI with strict test coverage gates, and establishing a robust framework for adding new AI provider target adapters."
status: done
priority: P2
branch: "feature/release-ci-providers"
tags: ["release", "ci-cd", "providers"]
blockedBy: []
blocks: []
created: "2026-06-04T14:34:24.000Z"
createdBy: "ck:plan"
source: skill
---

# Plan: Next Actions (Release, CI Freeze, and Provider Framework)

## Overview
This plan outlines the next phase of work for the `vcskill` codebase. It details the process for packaging and releasing the CLI tool, establishing GitHub Actions CI/CD to lock test coverage at $\ge 90\%$, and defining a robust procedure for adding and verifying new AI provider adapters.

To maximize execution efficiency, this plan utilizes **Agent Teams** (`ck:team` / `Agent`) for parallelized implementation and verification, coordinated by a `Lead Manager Agent`.

---

## Architecture & Team Orchestration

### Team Composition (`ck:team cook`)
*   **`lead-manager` (Lead Agent)**: Handles coordination, task tracking, plan approval, and branch merging. Runs in `--delegate` mode (does not edit files directly).
*   **`packager-dev` (Developer Agent)**: Handles configuration setup, npm packaging, scripts, and build validation (Phase 1).
*   **`ci-dev` (Developer Agent)**: Handles GitHub Actions setup and test coverage enforcement configurations (Phase 2).
*   **`provider-dev` (Developer Agent)**: Handles resolver configurations and scaffolding of new providers (Phase 3).
*   **`tester` (Tester Agent)**: Runs global test suites and verifies coverage gates.

### Core Skills Activated
*   **`ck:deploy`**: Used by `packager-dev` for packaging, bundling, and dry-run publishing.
*   **`ck:test`**: Used by `tester` to verify unit tests and test coverage metrics.
*   **`ck:project-organization`**: Used by all agents to place configurations and plan reports in correct directories.
*   **`ck:code-review`**: Activated before finalizing any merge to check security, path traversals, and code standards.

---

## Phases

| Phase | Name | Status | Priority | Effort |
|-------|------|--------|----------|--------|
| 1 | [Publish Package](./phase-01-publish-package.md) | done | P1 | 3h |
| 2 | [Vitest Freeze (CI/CD)](./phase-02-vitest-freeze-ci-cd.md) | done | P1 | 3h |
| 3 | [Provider Integration Framework](./phase-03-provider-integration-framework.md) | done | P2 | 2h |

---

## Dependencies
*   **Phase 1 $\to$ Phase 2**: Packaging configurations should be finalized to verify build compatibility under CI.
*   **Phase 2 $\to$ Phase 3**: CI workflow must be in place to automatically test any new provider mappings added in Phase 3.

---

## Key Decisions

| Topic | Decision | Rationale |
|---|---|---|
| **Local/NPM Release** | Pack using `pnpm pack`, test CLI output structure before publishing | Ensures no dev dependencies are bundled and binary maps correctly in the published tarball. |
| **Coverage Gate** | Set vitest coverage threshold strictly at 95% on `packages/cli/src/adapt/**/*.ts` | Enforces structural integrity of the pure adapt module. |
| **CI Automation** | Run on push to main and all pull requests | Prevents broken code or regressions from reaching production. |
| **Provider Onboarding** | Enforce path verification in `spec-verified.ts` for all new providers | Prevents speculation and ensures errors are logged rather than producing corrupt targets. |

---

## Validation Log

### Verification Results
- Claims checked: 10
- Verified: 9 | Failed: 1 | Unverified: 0
- Tier: Standard
- Failures:
  - `vitest.config.ts:8`: Coverage configuration in the project currently restricts `include` strictly to `packages/cli/src/adapt/**/*.ts` only. It does not measure coverage globally across the entire `packages/cli/src/` codebase.

### Session 1 — 2026-06-04
**Trigger:** User requested plan validation (/ck:plan validate)
**Questions asked:** 3

#### Questions & Answers

1. **[Assumptions]** The codebase currently only includes 'packages/cli/src/adapt/**/*.ts' in the Vitest coverage scope. How should the CI coverage gate be configured?
   - Options: (Recommended) Keep coverage restricted to packages/cli/src/adapt/**/*.ts but raise the threshold to 95% (currently 90%). | Expand the coverage scope to all packages/cli/src/ files with a global 90% threshold. | Keep the scope restricted to adapt/ at the current 90% threshold.
   - **Answer:** Keep coverage restricted to packages/cli/src/adapt/**/*.ts but raise the threshold to 95% (currently 90%).
   - **Rationale:** Focuses validation rigor on the pure mapping logic where absolute correctness is vital, without introducing testing overhead on side-effect CLI UI shells.

2. **[Architecture]** How should the local packaging verification process (Phase 1) be simulated and tested?
   - Options: (Recommended) Package the tarball in packages/cli/, extract it, and execute global CLI commands inside an isolated temporary directory. | Package in the workspace root and verify the CLI using execution aliases without installing. | Defer packaging tests entirely to standard npm publish dry-runs.
   - **Answer:** Package the tarball in packages/cli/, extract it, and execute global CLI commands inside an isolated temporary directory.
   - **Rationale:** Simulates real-world user installations accurately and ensures no development files bleed into the published build.

3. **[Risks]** For onboarding new providers (Phase 3), how strictly should path verification gates be enforced?
   - Options: (Recommended) Enforce paths and tools mapping strictly: if 'verified: false' in spec-verified.ts, skip with a log message to prevent guesses. | Allow path resolution by guessing standard directory naming conventions, and only skip if explicitly disabled.
   - **Answer:** Enforce paths and tools mapping strictly: if 'verified: false' in spec-verified.ts, skip with a log message to prevent guesses.
   - **Rationale:** Prevents path corruption or file overwriting in unverified coding environments, keeping operations fail-safe.

#### Confirmed Decisions
- Coverage Gate: Enforce Vitest coverage at >= 95% for the adapt engine module.
- Smoke Tests: Verify package outputs globally using temporary environment installs.
- Safety Gate: Maintain a strict `verified: true` flag check for all target AI coding providers.

#### Action Items
- [ ] Update `vitest.config.ts` thresholds configuration to 95%.
- [ ] Implement `packages/cli/scripts/verify-package-tarball.mjs` using isolated tmp directory extraction and execution checks.
- [ ] Add strict logging of unverified targets when resolver paths are skipped.

#### Impact on Phases
- Phase 1: Overview and steps updated to reflect using temporary extraction validation directory.
- Phase 2: Success criteria updated to enforce 95% threshold check on adapt/ module.
- Phase 3: Requirements updated to enforce path mapping security constraints.

### Whole-Plan Consistency Sweep
- **Status**: Complete. Zero unresolved contradictions.
- **Checked**: Key decisions, phase requirements, and implementation steps are fully aligned with Session 1 validation decisions.



