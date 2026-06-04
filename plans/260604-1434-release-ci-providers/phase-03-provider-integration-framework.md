---
phase: 3
title: "Provider Integration Framework"
status: done
priority: P2
effort: "2h"
dependencies: [2]
---

<!-- Updated: Validation Session 1 - strict path verification -->

# Phase 3: Provider Integration Framework

## Overview
This phase implements and documents a formal framework for adding new AI coding providers to `vcskill`. It defines step-by-step instructions, scaffolding templates, and test verification standards, ensuring that when developers need to support new coding assistants, they can do so easily, safely, and without breaking existing provider resolvers.

## Requirements
*   **Functional**:
    - Establish a documentation guide `docs/provider-onboarding-guide.md` specifying how to add a provider.
    - Define constant mappings in `packages/cli/src/adapt/paths.ts` (e.g. mapping target paths).
    - Map tool and path verification flags in `packages/cli/src/providers/spec-verified.ts`.
    - Configure scope resolution (project vs global) and rules compilation mode (e.g. `.cursor/rules/*.mdc`, `.claude/rules`, or block merging in `AGENTS.md`) in `packages/cli/src/providers/resolver.ts`.
    - Enforce mandatory test suite integration: require any new provider to have mock resolution tests added to `packages/cli/src/providers/resolver.test.ts`.
*   **Non-functional**:
    - DRY (Don't Repeat Yourself): reusable path helpers and mapping schemas.
    - Fail-safe verification: unverified configurations must default to skip-and-log.

## Architecture
The following sequence diagram outlines how path resolution is routed for providers:
```
Cli Command Execution
         │
         ▼
[loadKit()] ────> [resolveProviderPaths()] (src/providers/resolver.ts)
                          │
                          ├─► [spec-verified.ts Gate] ──► (Skipped if verified:false)
                          │
                          ▼
             [paths.ts Constant Map]
                          │
                          ▼
            [File Installation Operations]
```

## Related Code Files
*   **Modify**:
    - `packages/cli/src/adapt/paths.ts`
    - `packages/cli/src/providers/spec-verified.ts`
    - `packages/cli/src/providers/resolver.ts`
    - `packages/cli/src/providers/resolver.test.ts`
*   **Create**:
    - `docs/provider-onboarding-guide.md` (Human/AI guide for adding new providers)

## Implementation Steps
1.  **Draft the Developer Guide**: Create `docs/provider-onboarding-guide.md` describing the exact code locations and formats required to onboard a provider:
    - S1: Path Constants definition in [paths.ts](file:///packages/cli/src/adapt/paths.ts)
    - S2: Spec Verification definition in [spec-verified.ts](file:///packages/cli/src/providers/spec-verified.ts)
    - S3: Resolver Registry definition in [resolver.ts](file:///packages/cli/src/providers/resolver.ts)
    - S4: Unit tests in [resolver.test.ts](file:///packages/cli/src/providers/resolver.test.ts)
2.  **Scaffold a Template Mock Provider**: Walk through the guide by adding a verified mock test provider (`test-provider`) to ensure the guide's steps are correct and do not trigger side effects.
3.  **Run TDD validation**: Write a test in `resolver.test.ts` verifying that `test-provider` resolves rules, skills, and agents paths correctly for both project and global scopes. Verify tests run successfully.

## Success Criteria
- [ ] `docs/provider-onboarding-guide.md` is complete and clear.
- [ ] Target resolvers and paths constants support modular extension.
- [ ] Unit tests for the mock provider (`test-provider`) pass successfully.
- [ ] Main test suite coverage on the resolver package remains above $95\%$.

## Risk Assessment
*   **Risk**: Developers hardcoding custom logic in `resolver.ts` for each provider, violating DRY/KISS.
    - *Mitigation*: Restrict custom provider logic to standard resolver configuration objects. Complex mappings should be translated using standard configurations (`RulesMode`, `singular` vs `plural` directory flags) in the provider config schema.
