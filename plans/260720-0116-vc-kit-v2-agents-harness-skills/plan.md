---
title: "vc kit v2: 13 vc- agents + rules + subagent-init + 9 skills mới"
description: "Agents roster đầy đủ (parity-or-better vs ClaudeKit), rules thật, hook subagent-init, mở roster 12→21 skills."
status: pending
priority: P1
branch: "main"
tags: [kit, agents, hooks, skills, parity]
blockedBy: []
blocks: []
created: "2026-07-19T18:30:00.000Z"
createdBy: "ck:brainstorm handoff"
source: skill
---

# vc kit v2: agents + harness + skills

## Overview

Lấp gap lớn nhất của v1: kit chưa có agents thật. Viết mới 13 agents `vc-*`
theo công thức persona + behavioral checklist + verification discipline, ship
rules thật, thêm hook subagent-init, mở roster 12→21 skills.

Context: `plans/reports/brainstorm-260720-0116-vc-kit-v2-agents-cli-parity-report.md`
(quyết định user-confirmed: Full 13 agents, prefix vc-, 21 skills, approach B)
+ `plans/reports/scout-260720-0116-repository-harness-distill-for-vc-kit-report.md`
(chưng cất repository-harness: risk lanes, authority gate, context budget,
proof vocabulary, trace, decision records — SQLite layer chủ đích KHÔNG lấy).

## PARITY-OR-BETTER GATE (bắt buộc, mọi phase content)

Yêu cầu gốc từ user: *"tên ngoài khác là hiển nhiên — cái lõi từng skill/agent
tối thiểu phải bằng hoặc CAO HƠN ClaudeKit."*

Quy trình cho MỖI agent/skill viết mới có bản CK tương ứng:
1. Đọc bản CK (`~/.claude/agents/*.md` hoặc `~/.claude/skills/*/`), liệt kê
   capability checklist của họ (mục, gate, mode, output format).
2. Mỗi capability: **phủ** trong bản vc, hoặc **bỏ có lý do 1 dòng** (coupling
   hạ tầng CK, YAGNI với usage thật...). Không được im lặng bỏ.
3. Ghi tối thiểu **1 điểm vượt** cụ thể (gate chặt hơn, mode thông minh hơn,
   gọn hơn cùng năng lực, chống AI-slop tốt hơn...) — đo được, không cảm tính.
4. Bảng đối chiếu lưu vào phase report (`plans/reports/`), reviewer đối chiếu
   trước khi tick phase.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Agent spec + CI gate + rules + subagent-init](./phase-01-agent-spec-gate-rules-subagent-init.md) | Pending |
| 2 | [Agents A: explore planner reviewer tester](./phase-02-agents-a-explore-planner-reviewer-tester.md) | Pending |
| 3 | [Agents B: debugger developer git-manager simplifier](./phase-03-agents-b-debugger-developer-git-simplifier.md) | Pending |
| 4 | [Agents C: 5 con còn lại + rewire skills](./phase-04-agents-c-remaining-rewire-skills.md) | Pending |
| 5 | [Skills wave 1: skill-creator journal sequential-thinking docs-seeker](./phase-05-skills-wave-1-meta-journal-thinking-docs-seeker.md) | Pending |
| 6 | [Skills wave 2: bootstrap security-scan predict scenario worktree + smoke](./phase-06-skills-wave-2-bootstrap-security-predict-scenario-worktree.md) | Pending |

Tuần tự 1→6. Phase 2 làm mẫu chuẩn; 3-4 nhân bản. Phase 5-6 độc lập với 2-4
(chỉ cần phase 1) nhưng làm sau để dùng vc-reviewer tự review.

## Acceptance Criteria (whole plan)

- [ ] 13 agents `vc-*` trong `kit/agents/`, mỗi con ≤120 dòng, pass CI gate agents mới
- [ ] Mỗi agent/skill có bảng parity-or-better vs bản CK trong phase report; 100% capability được phủ hoặc bỏ-có-lý-do; mỗi con ≥1 điểm vượt
- [ ] Cài song song với agents CK không đụng tên file/tên agent
- [ ] `kit/rules/` ship rules thật; sample-rule + sample-cmd + sample-reviewer đã xóa; hook rules-inject inject được nội dung thật
- [ ] Hook subagent-init (hook thứ 6) TDD, fail-open, inject paths/naming/rules cho subagent
- [ ] Distill repository-harness: rules `intake-and-context.md` (authority gate + risk lanes + context budget); vc:cook route theo lane với high-risk bắt buộc confirm; proof vocabulary (unit/integration/e2e) trong test-gate + pm; session-state trace enrich (files-changed, outcome); vc:docs mode `decision`
- [ ] 21 skills pass gate; 12 skills cũ trỏ delegation sang agents vc- đúng tên
- [ ] `pnpm test` xanh, coverage ≥90%; install smoke assert 21 skills + 13 agents + 6 hooks
- [ ] Changeset minor ghi roster mới

## Dependencies

Cross-plan: độc lập với plan CLI v2 (file ownership: kit/ + kit-loader vs cli commands). Cook song song được.
