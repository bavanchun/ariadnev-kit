# Remote Sync Workflows: push, PR, merge

Execute via `vc-git-manager` subagent. Three related remote operations; jump to
the section you need. PRs and merges always work from the **remote** branch, not
local WIP.

---

## Push

### Pre-push checklist
1. All changes committed
2. Secrets scanned (see `safety-protocols.md`)
3. Branch tracked / pushed to remote

### Verify state, then push
```bash
git status && \
git log origin/$(git rev-parse --abbrev-ref HEAD)..HEAD --oneline 2>/dev/null || echo "NO_UPSTREAM"
```
- Uncommitted changes → warn, suggest commit first.
- `NO_UPSTREAM` → `git push -u origin HEAD`; else `git push origin HEAD`.

### Force push (DANGER)
**NEVER force-push `main`/`master`/production.** On an explicit feature-branch
request: `git push -f origin HEAD`, and warn "force push rewrites history;
collaborators may lose work."

### Errors
| Error | Solution |
|---|---|
| `rejected - non-fast-forward` | `git pull --rebase`, resolve, push again |
| `no tracking branch set` | `git push -u origin HEAD` |
| `Authentication failed` | check `gh auth status` / SSH keys |
| `Repository not found` | verify `git remote -v` |
| `Permission denied` | check repo write access |

Output: `✓ pushed: N commits to origin/{branch}` + hashes.

---

## Pull Request

Variables: `TO_BRANCH` (default `main`), `FROM_BRANCH` (default current).

**Use the REMOTE diff** — PRs are based on remote branches; local diff includes
unpushed changes. Do **not** use `git diff main...HEAD`, `git diff --cached`, or
`git status` to build the PR.

### Sync + analyze (always merge base into current first)
```bash
git fetch origin && \
git push -u origin HEAD 2>/dev/null || true && \
BASE=${BASE_BRANCH:-main} && HEAD=$(git rev-parse --abbrev-ref HEAD) && \
echo "=== PR: $HEAD → $BASE ===" && \
git log origin/$BASE...origin/$HEAD --oneline && \
git diff origin/$BASE...origin/$HEAD --stat
```
Branch not on remote → push first, retry.

### Content + create
Title: conventional-commit format, <72 chars, no version numbers. Body: summary
bullets + a test-plan checklist.
```bash
gh pr create --base $BASE --head $HEAD --title "..." --body "$(cat <<'EOF'
## Summary
- Bullet points

## Test plan
- [ ] Test item
EOF
)"
```

### Errors
| Error | Action |
|---|---|
| Branch not on remote | `git push -u origin HEAD`, retry |
| Empty diff | warn "No changes for PR" |
| Push rejected | `git pull --rebase`, resolve, push |

---

## Merge

Variables: `TO_BRANCH` (default `main`), `FROM_BRANCH` (default current).

```bash
# 1. Sync target with remote
git fetch origin && git checkout {TO_BRANCH} && git pull origin {TO_BRANCH}
# 2. Merge from REMOTE (committed+pushed changes only, not local WIP)
git merge origin/{FROM_BRANCH} --no-ff -m "merge: {FROM_BRANCH} into {TO_BRANCH}"
# 4. Push
git push origin {TO_BRANCH}
```

Pre-merge: fetch latest, ensure `FROM_BRANCH` is pushed, dry-run conflicts with
`git merge --no-commit --no-ff origin/{FROM_BRANCH}` then abort.

Conflicts → resolve manually, `git add . && git commit`; report if clarification
needed.

### Errors
| Error | Action |
|---|---|
| Merge conflicts | resolve manually, then commit |
| Branch not found | verify name, ensure pushed |
| Push rejected | `git pull --rebase`, retry |
