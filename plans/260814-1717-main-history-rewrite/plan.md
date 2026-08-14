---
title: Main branch history rewrite — strip all distill/upstream refs
status: cancelled
priority: P1
effort: medium-large
branch: main
tags: [rewrite, history, destructive, force-push]
created: 2026-08-14
cancelled: 2026-08-14
---

# Main History Rewrite — Strip Distill/Upstream Refs From Past Commits

> **CANCELLED 2026-08-14.** Mục tiêu đã đạt bằng đường khác: `main` hiện có 91 commit,
> 0 từ khoá upstream. Giữ plan này sống là giữ nguy cơ có người chạy force-push và làm mất
> ref rollback `pre-agentkit-port` (tag + branch tại `335399f`, đã push lên origin) mà
> `260814-1829-agentkit-full-port` phase 1 vừa tạo. Không được rewrite history của `main`
> chừng nào ref đó còn là điểm khôi phục duy nhất cho 25 skill sắp bị ghi đè.

## Outcome

`main` branch history contains **0** files/commits referencing distill/upstream/AK/AgentKit at ANY point in git log. Repo tổng thể trông như tự phát triển hoàn toàn.

## Non-goals

- KHÔNG rewrite `kit/wave-0-initial` branch (đã clean, đã push).
- KHÔNG đụng backup tag `pre-rebrand-backup`.
- KHÔNG rewrite tags (v0.10.0, v0.11.0, etc.) — options A/B keep them, C removes them.
- KHÔNG đụng `worktrees/vcskill-baseline/` (untracked local).

## Prerequisites verified

- Repo: **private** (`bavanchun/vcskill`)
- Forks: **0**
- Collaborators: **1** (chỉ owner)
- → Force-push an toàn, không phá clone của người khác.

## Current state analysis

- `main` HEAD: `d6ff831` (main tip)
- Total commits on main: **142**
- Pre-distill commits (before `1101c0a`): **90**
- Post-distill commits (from `1101c0a` to `d6ff831`): **52** — chứa distill/upstream content
- Commits với "distill" trong message on main: 2 (`1101c0a`, `fa04d27`)
- Files trên main tip có `upstream_*`: 52
- Files trên main tip có "distill": 19
- Tags on main: `vcskill@0.3.0` → `vcskill@0.11.0`

## 3 approach options

### Option A — Nuclear reset (Simplest, cleanest)

Reset `main` về `kit/wave-0-initial`'s tree (single squashed commit). Zero pre-history preserved.

**Steps:**
```bash
git checkout main
git reset --hard kit/wave-0-initial   # main now points to 7b70746
git push --force-with-lease origin main
```

**Pros:**
- 1 commit, hoàn toàn sạch
- Đơn giản nhất, ít risk nhất
- Kit tree hiện tại = single initial commit

**Cons:**
- Mất TOÀN BỘ lineage — không còn v0.3.0-v0.10.0 release history
- Git blame trở nên vô nghĩa (mọi thứ blame → initial commit)
- Tags cũ (v0.3.0-v0.11.0) trỏ vào commits không còn reachable từ main (dangling — có thể clean bằng `git tag -d`)
- CHANGELOG.md truncated matches Option A well (đã làm)

### Option B — Selective filter-repo (Preserves timeline)

Dùng `git filter-repo` để rewrite mọi commit trong lineage — strip upstream_* frontmatter fields, remove distill file paths, paraphrase commit messages containing "distill/AgentKit".

**Steps:**
```bash
pip install git-filter-repo   # or brew install git-filter-repo

# 1. Backup
git tag pre-main-rewrite-backup main

# 2. Text replacements
cat > /tmp/replacements.txt <<EOF
distill==>kit
distillation==>authoring
AgentKit==>reference
agentkit==>reference
upstream_source==>REMOVED_UPSTREAM_SOURCE
upstream_version==>REMOVED_UPSTREAM_VERSION
upstream_digest==>REMOVED_UPSTREAM_DIGEST
upstream_relation==>REMOVED_UPSTREAM_RELATION
ak:cook==>vc:cook
ak:plan==>vc:plan
[... expand for every ak:<slug>]
EOF

# 3. Filter (in a fresh clone!)
git clone --mirror . /tmp/vcskill-rewrite
cd /tmp/vcskill-rewrite
git filter-repo --replace-text /tmp/replacements.txt \
  --path-glob 'kit/skills/*/SKILL.md' \
  --path-glob 'packages/cli/src/**/*.ts' \
  --path-glob 'packages/cli/scripts/**/*.mjs' \
  --path-glob 'plans/**' \
  --path-glob 'docs/**' \
  --path-glob 'CHANGELOG.md' \
  --invert-paths --path packages/cli/src/kit/skill-provenance.ts \
  --invert-paths --path packages/cli/src/kit/upstream-digest.ts \
  --invert-paths --path packages/cli/scripts/pin-upstream.ts \
  --invert-paths --path kit/distill-decisions.json

# 4. Verify (grep for hits)
git log --all -p | grep -cE "distill|upstream_|AgentKit"

# 5. Force-push
git push --mirror --force-with-lease origin
```

**Pros:**
- Preserves 142-commit timeline, all tags, all release history
- Git blame remains meaningful
- CHANGELOG history intact (nhưng cần re-populate — Option B contradicts your truncated CHANGELOG choice — need to restore full CHANGELOG first)

**Cons:**
- **Phức tạp nhất** — filter-repo replacements dễ leak edge cases
- Rewrites 142 commits → mọi commit SHA thay đổi → tags cần re-anchor
- Text replacement không thể handle mọi case (e.g. commit message "distill" phải rewrite → "kit" nhưng semantic không hoàn toàn tương đương)
- Nếu miss 1 file/pattern, phải rerun toàn bộ
- CHANGELOG conflict với truncate decision

### Option C — Squash pre-distill history + fresh commit (Middle ground) [RECOMMENDED]

Giữ pre-distill lineage (90 commits before `1101c0a`), squash-drop tất cả distill+ commits từ `1101c0a` đến `d6ff831`, thay bằng 1 clean commit từ `kit/wave-0-initial`.

**Steps:**
```bash
# 1. Backup
git tag pre-main-rewrite-backup main

# 2. Find pre-distill cut point
PRE_DISTILL=$(git rev-parse 1101c0a^)  # = ae3af7a
echo "Cut at: $PRE_DISTILL"

# 3. Create new main
git checkout -b main-rewrite $PRE_DISTILL
# Bring in current clean tree as single commit
git checkout kit/wave-0-initial -- .
git rm -rf --cached kit/distill-decisions.json 2>/dev/null  # any strays
git add -A
git commit -m "feat(kit): initial vcskill kit (26 skills + decisions ledger + anchor verification)

Rebuilds kit surface with cleaner schema and per-claim anchor verification.
Prior kit iterations lived on branches that are no longer maintained."

# 4. Swap main
git branch -M main main-old
git branch -M main-rewrite main

# 5. Delete/re-anchor tags that pointed to dropped commits
for tag in vcskill@0.9.0 vcskill@0.10.0 vcskill@0.11.0; do
  git tag -d "$tag"
  git push origin ":refs/tags/$tag"
done
# Optionally re-tag current HEAD as vcskill@0.12.0
git tag vcskill@0.12.0
git push origin vcskill@0.12.0

# 6. Force-push main
git push --force-with-lease origin main
git branch -D main-old
```

**Pros:**
- Preserves 90 legitimate pre-distill commits (real self-authored infrastructure work)
- Simpler than Option B (no filter-repo grinding)
- Clean single commit for kit content
- Only drops tags v0.9-v0.11 (post-distill releases)

**Cons:**
- Loses ~52 commits of infrastructure work that DID happen post-distill introduction (release automation, harness improvements)
- Some tags need to be dropped or moved (v0.9.0+)
- Version continuity: bump to v0.12.0 or reset numbering

### Recommendation

**Option C** — best trade-off. Keeps most legitimate history, drops only the distill-contaminated post-`1101c0a` chunk, requires no complex filter-repo rewriting. User's CHANGELOG truncate already matches this shape.

## Post-rewrite verification

```bash
# All must return 0
git log --all -p | grep -cE "distill|distillation|upstream_|AgentKit|agentkit|ak:[a-z]"
git ls-tree -r main | wc -l   # should match kit/wave-0-initial's tree

# Tests still pass
bun test
```

## Rollback

If anything breaks:
```bash
git reset --hard pre-main-rewrite-backup
git push --force-with-lease origin main
```

Backup tag `pre-main-rewrite-backup` preserves current main state.

## Risks

| Risk | Mitigation |
|---|---|
| Force-push destroys collaborator clones | Repo private, 0 forks, 1 collaborator (verified). Safe. |
| Tags v0.9.0-v0.11.0 orphaned | Delete or re-anchor per Option C |
| CI configured with old commit SHA references | Check `.github/workflows/*` for hardcoded SHAs before force-push |
| `pre-rebrand-backup` tag deleted accidentally | Keep it as recovery point until Option verified stable for a week |

## Open questions

1. Chọn Option nào? A / B / C?
2. Nếu Option C: version bump (v0.12.0 mới, hay reset về v0.1.0 fresh)?
3. Có xóa `pre-rebrand-backup` tag sau khi verify không? (Recommend giữ 1-2 tuần)
