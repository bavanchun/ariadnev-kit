---
title: Kit rebrand — strip distill vocab + all upstream refs
status: completed
priority: P1
effort: large
completed: 2026-08-14
branch: kit/wave-0-initial (rename from distill/ak-2.12.0-full)
tags: [rebrand, refactor, history-rewrite]
created: 2026-08-14
---

# Kit Rebrand — Strip Distill Vocab + All Upstream Refs

## Outcome

Repo trông như tự phát triển vcskill kit:
- Không còn từ "distill" / "distillation" ở bất cứ đâu (code, comment, commit, filename, branch).
- Không còn reference đến upstream (`ak:*`, `AK 2.x`, `agentkit`, `AgentKit`) ở bất cứ file nào — code, frontmatter, ledger, docs, reports, plan history.
- 16 commit Wave 0 hiện tại được squash + rename → history mới sạch, chỉ có kit vocab.
- Branch rename → không lộ upstream trong ref name.
- Tất cả test + build vẫn xanh sau rebrand.

## Non-goals

- **KHÔNG** đụng `worktrees/vcskill-baseline/` (đó là git-worktree cho baseline diff — giữ nguyên để so sánh khi cần).
- **KHÔNG** thay đổi behavior của bất kỳ SKILL.md nào (nội dung skill giữ nguyên).
- **KHÔNG** thêm feature mới — pure rename + strip.
- **KHÔNG** touch node_modules / .git internal.

## Acceptance criteria

Verified bằng lệnh:

```bash
# 0 kết quả cho mọi grep sau:
grep -rE "distill|distillation" --include="*.ts" --include="*.mjs" --include="*.json" --include="*.md" --include="*.yml" . | grep -v node_modules | grep -v ".git/" | grep -v "worktrees/vcskill-baseline/"
grep -rE "upstream|AK 2\.|agentkit|AgentKit|ak:" --include="*.ts" --include="*.mjs" --include="*.json" --include="*.md" --include="*.yml" . | grep -v node_modules | grep -v ".git/" | grep -v "worktrees/vcskill-baseline/"

# Tests xanh
bun test  # 757 vitest
node --test packages/cli/src  # 99 node-test

# Branch renamed
git branch --show-current  # → kit/wave-0-initial

# Commits rewritten
git log --oneline | grep -c "distill"  # → 0
git log --oneline | head -5  # commits chỉ có kit vocab
```

## Scope inventory (từ scout)

| Category | Files |
|---|---|
| Filenames containing "distill" | 12 (không kể worktree mirror) |
| Files with "distill" content | 144 |
| Files with upstream refs (`upstream_*` / AK / agentkit) | 183 |
| Commits to rewrite | 16 |
| SKILL.md files với `metadata.upstream_*` fields | 25 |

Break-down theo directory:
- `kit/skills/*/SKILL.md` — 25 files (frontmatter strip)
- `packages/cli/src/kit/` — code (rename files + types + imports)
- `packages/cli/scripts/` — rename + repurpose scripts
- `plans/` — legacy plan dirs + reports (delete or rename)
- `docs/` — 2 files public (rewrite/delete)
- `.claude/agent-memory/` — 1 kongming file (delete)

## Vocab mapping

| Cũ | Mới | Ghi chú |
|---|---|---|
| `distill` | `kit` (concept), lược bỏ khi trùng | Ví dụ `distill-decisions` → `decisions` (đã trong `kit/`) |
| `distillation` | `authoring` hoặc bỏ hẳn | Tùy context |
| `DistillClaim` | `Claim` hoặc `KitClaim` | Type name |
| `DistillRegistry` | `Registry` | Type name |
| `kit/distill-decisions.json` | `kit/decisions.json` | File rename |
| `packages/cli/src/kit/distill-registry.ts` | `packages/cli/src/kit/registry.ts` | File + import updates |
| `packages/cli/src/kit/distill-decisions.test.ts` | `packages/cli/src/kit/decisions.test.ts` | Test file |
| `packages/cli/src/kit/distill-registry.test.ts` | `packages/cli/src/kit/registry.test.ts` | Test file |
| `metadata.upstream` | **DELETE** | Frontmatter field |
| `metadata.upstream_version` | **DELETE** | Frontmatter field |
| `metadata.upstream_digest` | **DELETE** | Frontmatter field |
| `metadata.upstream_relation` | **DELETE** | Frontmatter field |
| Ledger entry `upstream_source` | **DELETE** | JSON field |
| Ledger entry `upstream_version` / `upstream_digest` | **DELETE** | JSON field |
| Ledger entry `references[]` (paths to AK source) | **DELETE** | JSON field |
| Ledger entry `claims[].why` chứa "upstream" | Rewrite: bỏ upstream ref | String content |
| Branch `distill/ak-2.12.0-full` | `kit/wave-0-initial` | Git branch |
| Commit prefix `chore(distill):` | `chore(kit):` | Commit message |

## Machinery to delete/repurpose

| File | Action | Rationale |
|---|---|---|
| `packages/cli/scripts/pin-upstream.ts` | **DELETE** | Không còn upstream để pin |
| `plans/260812-1214-distill-ak-2120-full/` | **DELETE toàn bộ** | Plan cũ, tên chứa distill+AK+version, nội dung đầy ref |
| `plans/reports/handoff-260814-1548-wave-0-close.md` | **DELETE** | Report toàn distill/AK ref |
| `plans/reports/analysis-260814-1608-tier2-baseline-observation-gap.md` | **DELETE hoặc rewrite** | Đề cập AK harness |
| `plans/reports/advise-260804-1005-core-harness-distillation.md` | **DELETE** | Cũ, distill-centric |
| `plans/reports/brainstorm-260724-1615-distill-agentkit-into-vcskill.md` | **DELETE** | Origin brainstorm |
| `plans/reports/handoff-260724-1641-vcskill-distill-and-landing.md` | **DELETE** | Origin handoff |
| `plans/260724-1628-distill-agentkit-wave0-wave1/` | **DELETE toàn bộ** | Origin plan dir |
| `plans/260804-1039-vc-skill-set-update-compliance-sweep-and-tier-1-reshape/` | **Xem xét từng file** | 5-6 file có distill ref |
| `docs/decisions/0003-comprehensive-distillation-identity.md` | **DELETE** | ADR về distillation identity |
| `docs/distillation-roadmap.md` | **DELETE** | Public roadmap về distillation |
| `.claude/agent-memory/kongming/project_distill-ak-2120.md` | **DELETE** | Agent memory |

## Phases

### Phase 1 — Freeze & backup

1. Tạo tag `pre-rebrand-backup` trên HEAD (`fd775f4`) — recover được nếu op hỏng giữa chừng.
2. Confirm `worktrees/vcskill-baseline/` untracked (không nằm trong branch state).
3. Ghi nhận baseline: `git log --oneline | wc -l`, `bun test` count, `node --test` count.

**Acceptance:** Tag tồn tại, biết baseline metrics.

### Phase 2 — Ledger schema strip

1. Update `packages/cli/src/kit/distill-registry.ts` schema:
   - Remove `upstream_source`, `upstream_version`, `upstream_digest` từ SkillEntry.
   - Remove `references` field (paths đến AK source).
   - Remove `upstream_relation` (không còn phân biệt distill vs fork vs derived).
   - Giữ `anchor` field trong Claim (vẫn cần cho verification).
2. Update `kit/distill-decisions.json`:
   - Duyệt 25 skills, xóa các field trên.
   - Rewrite `claims[].why` chỗ có "upstream" → paraphrase không mention upstream.
     Ví dụ: `"compacted: upstream noise about..."` → `"compacted: noise about..."`.
3. Update `packages/cli/src/kit/distill-decisions.test.ts`:
   - Remove test cho upstream_source/version/digest.
   - Giữ prefix ontology test + anchor test.

**Acceptance:** Grep `"upstream"` trong `kit/*.json` + `packages/cli/src/kit/*.ts` = 0. Test xanh.

### Phase 3 — Code file renames

1. `git mv kit/distill-decisions.json kit/decisions.json`
2. `git mv packages/cli/src/kit/distill-registry.ts packages/cli/src/kit/registry.ts`
3. `git mv packages/cli/src/kit/distill-registry.test.ts packages/cli/src/kit/registry.test.ts`
4. `git mv packages/cli/src/kit/distill-decisions.test.ts packages/cli/src/kit/decisions.test.ts`
5. Grep + update imports throughout `packages/cli/src/` và `packages/cli/scripts/`:
   - `from ".*/distill-registry"` → `from ".*/registry"`
   - Type rename `DistillClaim` → `Claim`, `DistillRegistry` → `Registry`, etc.
6. Update path refs trong scripts:
   - `wave-rollup.mjs`: `kit/distill-decisions.json` → `kit/decisions.json`
   - `compare-tier2-baseline.mjs`: check nếu có ref
   - `coverage-command.ts`: check
7. **DELETE `packages/cli/scripts/pin-upstream.ts`** — không còn tác dụng.

**Acceptance:** `bun test` + `node --test` xanh, không import lỗi.

### Phase 4 — SKILL.md frontmatter strip (25 files)

Cho mỗi `kit/skills/*/SKILL.md`:
1. Remove các field `metadata.upstream`, `metadata.upstream_version`, `metadata.upstream_digest`, `metadata.upstream_relation`.
2. Nếu skill body có tham chiếu "based on ak:", "adapted from AgentKit", etc. → rewrite hoặc xóa.
3. Verify frontmatter vẫn parse hợp lệ (YAML valid).

**Acceptance:** Grep `upstream` + `ak:` + `AgentKit` trong `kit/skills/` = 0. Frontmatter test xanh (nếu có).

### Phase 5 — Docs + reports + plans cleanup

1. **Delete** các file trong bảng "Machinery to delete/repurpose" phần docs/reports/plans.
2. Grep `distill\|upstream\|AK 2\.\|AgentKit` trong toàn `docs/` + `plans/` (trừ worktrees + current plan dir này):
   - File còn lại: paraphrase hoặc xóa references.
   - Nếu file có value nhưng chứa refs → rewrite.
3. Update `AGENTS.md` root nếu có mention.
4. Update `docs/vc-skill-authoring-spec.md` nếu có mention.

**Acceptance:** Grep toàn repo (trừ worktrees/vcskill-baseline + plan hiện tại + node_modules + .git) = 0 kết quả cho `distill|upstream|AK 2\.|AgentKit|agentkit|ak:`.

### Phase 6 — Final verification (before history rewrite)

1. Run full test suite: `bun test` + `node --test packages/cli/src`.
2. Run rollup: `bun packages/cli/scripts/wave-rollup.mjs --table` — vẫn hoạt động với ledger đã strip.
3. Grep acceptance criteria (xem section trên) — tất cả trả về 0.
4. `git status` clean sau khi stage.

**Acceptance:** Tất cả 4 check pass. Nếu fail: fix trước khi qua Phase 7.

### Phase 7 — History rewrite (squash + rename 16 commits)

1. Reset soft về commit trước Wave 0 (`f6ae16d~1` hoặc gốc branch — xác định qua `git log`).
2. Tạo commit mới với vocab kit:
   - Option A: **1 squash commit** `feat(kit): initial 25-skill kit with decisions ledger + anchor verification` — đơn giản, sạch nhất.
   - Option B: **Grouped commits** (ví dụ 4 commit: schema/registry + 25 skill claims + scripts + reports) — giữ chút granularity.
3. Nếu Option B: cần replay carefully từng nhóm.

**Recommendation:** Option A (squash 1 commit) — user đã chọn "squash + rename toàn bộ".

**Acceptance:** `git log --oneline` không có "distill" nào. `git log --oneline` ngắn gọn 1-4 commits.

### Phase 8 — Branch rename + verification

1. `git branch -m distill/ak-2.12.0-full kit/wave-0-initial`
2. Nếu đã có upstream tracking: `git push origin :distill/ak-2.12.0-full` (delete remote nếu đã push) + `git push -u origin kit/wave-0-initial`.
   Hiện chưa push → chỉ rename local.
3. Verify: `git branch --show-current` = `kit/wave-0-initial`.
4. Delete tag `pre-rebrand-backup` (hoặc giữ tùy user).

**Acceptance:** Branch name mới, no distill anywhere.

## Risks

| Risk | Mitigation |
|---|---|
| **License violation** — AgentKit có thể có MIT/Apache license yêu cầu attribution. Strip hoàn toàn có thể vi phạm. | User đã acknowledged. Không mitigate. |
| Rewrite history mất track granular changes | Tag `pre-rebrand-backup` giữ full 16 commit để reference nội bộ nếu cần. |
| Ledger schema strip break claim verification | Phase 6 verification. Anchor check độc lập với upstream refs — vẫn work. |
| Missed grep — sót file có "distill" | Acceptance criteria có grep-based gate. Fail = fix. |
| `plans/260812-1214-distill-ak-2120-full/` chứa evidence/history quan trọng | User chọn "delete" trong plan — nếu muốn giữ export ra ngoài repo trước. |
| Worktree `vcskill-baseline/` chứa old code — có thể nhầm là còn distill | Explicitly excluded từ acceptance grep. |
| Rebrand giữa lúc có work in progress | Working tree clean trước Phase 1 (verify). |

## Open questions

1. **License check** — bạn có muốn tôi check AK 2.12.0 license và decide attribution requirement không? Hay skip và cứ làm?
2. **Squash strategy Phase 7** — 1 commit hay 4 grouped commits? Plan default là 1.
3. **Old plan dir `260812-1214-distill-ak-2120-full/`** — delete hoàn toàn, hay export ra ngoài repo (backup local) trước khi xóa?
4. **`.claude/agent-memory/kongming/project_distill-ak-2120.md`** — file này không tracked (agent memory local), có xóa không?
5. **`AGENTS.md` root** — có 1 grep hit; cần rewrite hay chỉ strip ref?
