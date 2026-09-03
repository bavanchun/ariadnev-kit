---
phase: 8
title: "Branch rename + verification"
status: completed
completed: 2026-08-14
priority: P1
effort: "30m"
dependencies: [7]
---

# Phase 08: Branch Rename & Verification

## Overview
Rename the Git branch from `distill/ak-2.12.0-full` to `kit/wave-0-initial`, verify that no dangling references remain in git refs or configs, and complete the final acceptance validation.

## Requirements
- Functional:
  - Rename local branch: `git branch -m distill/ak-2.12.0-full kit/wave-0-initial`.
  - Verify current branch reports `kit/wave-0-initial`.
  - Handle remote tracking branch if previously pushed (push new branch, prune old).
  - Perform final comprehensive check: all tests pass, zero banned terms in tracked files, commit history clean.
- Non-functional:
  - Smooth developer onboarding onto the newly named branch.

## Architecture
```
Branch Lifecycle:
[distill/ak-2.12.0-full] ──(git branch -m)──► [kit/wave-0-initial]
                                                      │
                                                      ▼
                                       Final Clean Verification:
                                       • git branch --show-current
                                       • bun test / vitest run
                                       • repo-wide grep audit = 0
```

## Related Code Files
- Modify: Git branch refs

## Implementation Steps
1. Rename local branch:
   ```bash
   git branch -m distill/ak-2.12.0-full kit/wave-0-initial
   ```
2. Verify active branch:
   ```bash
   git branch --show-current
   ```
3. If remote tracking exists and user requests remote update:
   ```bash
   git push -u origin kit/wave-0-initial
   # git push origin --delete distill/ak-2.12.0-full (if remote exists)
   ```
4. Run final acceptance test suite:
   ```bash
   pnpm test
   node --test "kit/hooks/**/*.test.cjs" "packages/cli/scripts/**/*.test.mjs"
   ```
5. Run full grep scan verifying 0 banned occurrences across the entire repository.
6. Optional: Review retention of `pre-rebrand-backup` tag.

## Success Criteria
- [ ] Active branch is `kit/wave-0-initial`.
- [ ] No git branch contains `distill` in its name.
- [ ] Test suites are 100% green.
- [ ] Rebrand is complete, self-contained, and verified.

## Risk Assessment
- **Risk:** CI/CD or collaborator worktrees break due to sudden branch rename.
  - **Observable Signal:** Git fetch warnings or detached HEAD in collaborator worktrees.
  - **Response:** Communicate branch rename clearly; supply standard checkout instructions: `git fetch origin && git checkout kit/wave-0-initial`.
