---
phase: 7
title: "History rewrite (squash + rename 16 commits)"
status: completed
completed: 2026-08-14
priority: P1
effort: "1h"
dependencies: [6]
---

# Phase 07: History Rewrite (Squash & Rename 16 Commits)

## Overview
Perform a clean Git history rewrite across the current feature branch to replace the 16 legacy Wave 0 commit messages containing "distill" with clean, professional commits utilizing native kit vocabulary.

## Requirements
- Functional:
  - Identify base commit prior to Wave 0 branch inception (e.g. `f6ae16d~1` or upstream base).
  - Perform `git reset --soft` back to base commit.
  - Create new commit(s) using conventional commits with `feat(kit):` or `chore(kit):` prefixes.
  - Recommended Strategy (Option A): Create a single consolidated squash commit:
    `feat(kit): initial 25-skill kit with decisions ledger + anchor verification`
- Non-functional:
  - Commit log contains zero historical mentions of "distill", "distillation", or upstream references.
  - Working tree state matches the verified state from Phase 6.

## Architecture
```
Old Commit History:
(Base) -> [c1: chore(distill)...] -> [c2: feat(distill)...] ... (16 commits)

New Commit History (Option A Squash):
(Base) -> [feat(kit): initial 25-skill kit with decisions ledger + anchor verification]
```

## Related Code Files
- Modify: Git commit history / reflog

## Implementation Steps
1. Double-check that tag `pre-rebrand-backup` exists and points to original HEAD.
2. Identify the exact base commit hash before Wave 0:
   ```bash
   git log --oneline -20
   ```
3. Soft reset to the base commit:
   ```bash
   git reset --soft <base-commit-hash>
   ```
4. Stage all working tree changes:
   ```bash
   git add -A
   ```
5. Commit with clean native kit message:
   ```bash
   git commit -m "feat(kit): initial 25-skill kit with decisions ledger and anchor verification

- Scaffold 25 initial core skills in kit/skills/
- Provide decisions ledger in kit/decisions.json with anchor claims
- Implement kit registry and CLI validation commands
- Clean documentation and verification suites"
   ```
6. Verify commit history:
   ```bash
   git log --oneline -5
   git log --oneline | grep -i "distill"
   ```

## Success Criteria
- [ ] 16 legacy commits successfully consolidated into clean commit(s).
- [ ] `git log --oneline | grep -c -i "distill"` returns 0.
- [ ] Working tree is clean.
- [ ] All tests continue to pass after commit creation.

## Risk Assessment
- **Risk:** Erroneous git reset target causes uncommitted data loss.
  - **Observable Signal:** Missing files or unexpected diff after soft reset.
  - **Response:** Soft reset preserves working tree files; if anything is misaligned, immediately reset hard back to safety tag `git reset --hard pre-rebrand-backup`.
