---
title: "vc kit v1: 12 skills + 5 hooks harness distilled from ClaudeKit"
description: "Rewrite-from-scratch 12-skill roster + 5-hook Claude harness in kit/, gated by new CI lint + adapt-engine hook artifact kind. TDD throughout."
status: pending
priority: P2
branch: "main"
tags: [kit, skills, hooks, adapt-engine, tdd]
blockedBy: []
blocks: []
created: "2026-07-19T17:23:58.211Z"
createdBy: "ck:plan"
source: skill
---

# vc kit v1: 12 skills + 5 hooks harness distilled from ClaudeKit

## Overview

Build bộ `vc` v1 trong `kit/`: 12 skills (8 core loop + 3 support + 1 personal: obsidian; term-config chốt ở ngoài kit — validation) viết lại từ đầu theo pattern ClaudeKit (3-tầng progressive disclosure, <300 dòng, no-duplication), cộng 5 hooks harness chất lượng cao (TDD, fail-open, atomic). Hooks = artifact kind mới trong adapt engine, chỉ verified cho claude-code, provider khác skip-and-log.

Context: brainstorm report `plans/reports/brainstorm-260720-0014-vc-kit-skill-roster-hooks-distill-report.md` (user-confirmed decisions) + 2 scout reports `scout-260720-0004-*`.

Mode: `--tdd` — mỗi phase engine/hook viết failing test trước; phase skill content dùng CI gate (phase 1) làm "test" tự động.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Skill spec + kit CI gates](./phase-01-skill-spec-kit-ci-gates.md) | ✅ Completed |
| 2 | [Adapt engine hooks artifact kind](./phase-02-adapt-engine-hooks-artifact-kind.md) | Pending |
| 3 | [Harness 5 hooks TDD](./phase-03-harness-5-hooks-tdd.md) | Pending |
| 4 | [Core loop skills A: brainstorm cook git plan](./phase-04-core-loop-skills-a-brainstorm-cook-git-plan.md) | Pending |
| 5 | [Core loop skills B: ask scout fix pm](./phase-05-core-loop-skills-b-ask-scout-fix-pm.md) | Pending |
| 6 | [Support + personal skills + install smoke](./phase-06-support-personal-skills-install-smoke.md) | Pending |

Dependency chain: 1 → (2 ∥ 4,5 partially) nhưng an toàn nhất tuần tự 1→2→3→4→5→6. Phase 4/5 chỉ cần phase 1 (gate); phase 3 cần phase 2 (installer chở hooks).

## Acceptance Criteria (whole plan)

- [ ] `pnpm test` xanh toàn bộ (85 tests cũ + tests mới), coverage adapt engine ≥90% giữ nguyên
- [ ] 12 skills trong `kit/skills/` pass CI gate mới (frontmatter contract + description lint + <300 dòng SKILL.md)
- [ ] 5 hooks trong `kit/hooks/` với `node:test` coverage cho pure functions, fail-open verified bằng test
- [ ] `npx vcskill install` (claude-code) cài đủ skills + hooks; settings merge idempotent sau prompt y/n, có backup; từ chối/non-interactive → in snippet
- [ ] Install sang provider ≠ claude-code: hooks skip-and-log, không lỗi
- [ ] vchun-git đổi tên `vc:git`, changeset ghi nhận breaking rename

## Dependencies

Cross-plan: none (3 plans cũ đều completed).

## Validation Log

### Session 1 — 2026-07-20 (ck:plan validate)

#### Verification Results
- Claims checked: 7 | Verified: 7 | Failed: 0 | Unverified: 0
- Tier: Full (6 phases)
- Evidence: KitValidationError (load-kit.ts:6), rotateBackups keep=3 (backup.ts:20), skip-with-reason (install-plan.ts:10-19), kit-fixtures không hardcode tên demo skill (chỉ ≥2), managed-block merge pattern sẵn có (agents-md.ts), vchun-git/obsidian dirs tồn tại, CI = ci.yml+release.yml
- Bonus finding: settings-merge nên tái dùng pattern agents-md.ts (marker + preserve + pure) — đã propagate vào phase 2

#### Decisions (6 câu, user-confirmed)
| # | Topic | Decision | Propagated |
|---|---|---|---|
| 1 | Settings.json merge | **Prompt y/n khi cài**; từ chối/non-interactive → copy files + in snippet | phase-02 |
| 2 | Ngôn ngữ skill content | **Tiếng Anh** (phases 4-6) | phase-04 |
| 3 | vc:plan vs ck CLI | **Độc lập hoàn toàn** (Write tool scaffold) | phase-04 (giữ nguyên) |
| 4 | term-config | **Ngoài kit** → roster 13→**12 skills** | phase-06, plan.md |
| 5 | scout-block matcher | **Dep `ignore`** (vendor single-file khi install) | phase-03 |
| 6 | Demo skills | **Xóa** echo-tool + hello-world | phase-06 (giữ nguyên) |

#### Whole-Plan Consistency Sweep
- Grep "13 skill|term-config" toàn plan dir: 0 stale sau reconcile (title, overview, acceptance, phase-06 đều 12)
- Phase deps không đổi; settings-merge prompt không tạo mâu thuẫn với acceptance (đã sửa dòng criteria)
- Unresolved contradictions: **0**
