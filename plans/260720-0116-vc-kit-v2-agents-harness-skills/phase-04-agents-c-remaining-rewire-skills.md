---
phase: 4
title: "Agents C: brainstormer, researcher, docs-manager, project-manager, journal-writer + rewire skills"
status: pending
priority: P2
effort: "6h"
dependencies: [3]
---

# Phase 4: Agents C + rewire 12 skills

## Overview

5 agents còn lại của roster 13, sau đó cập nhật 12 skills hiện có trỏ
delegation sang đúng tên agents vc-.

## Requirements

| Agent | Model | CK counterpart | Điểm vượt tối thiểu (gợi ý) |
|---|---|---|---|
| vc-brainstormer | opus | brainstormer (135 dòng) | + problem-first inversion mặc định (CK để references); scout-first gate như vc:brainstorm |
| vc-researcher | haiku | researcher (70 dòng) | + (claim, source, date) bắt buộc mọi finding — khớp vc:research skill |
| vc-docs-manager | haiku | docs-manager (227 dòng) | Cắt còn ≤120 dòng giữ nguyên behavioral checklist verify-before-document; bỏ coupling repomix bắt buộc |
| vc-project-manager | haiku | project-manager (37 dòng) | + evidence rule từ vc:pm sync-back (tick = named evidence) |
| vc-journal-writer | haiku | journal-writer (135 dòng) | Gọn hơn, bỏ phần "emotional honesty" dài; giữ trigger conditions |

Rewire 12 skills hiện có (2 việc):
1. Agent names: grep mọi chỗ nhắc "explore agents", "reviewer subagent",
   "delegate"… → trỏ đúng tên vc-agent; scout agent-prompt-template ghi rõ
   spawn `vc-explore`.
2. Distill repository-harness vào skills cũ:
   - `vc:cook`: thêm `references/risk-lanes.md` (flag checklist → lane;
     tiny = inline micro-plan, normal = chuẩn hiện tại, high-risk = bắt buộc
     AskUserQuestion confirm trước implement — khớp HARD-GATE sẵn có) + bảng
     routing trong SKILL.md; test-gate thêm proof vocabulary
     unit/integration/e2e/platform.
   - `vc:pm` sync-back: evidence phân loại theo proof vocabulary; "không mark
     implemented khi chưa có proof".
   - `vc:docs`: thêm mode `decision` — ghi `docs/decisions/NNNN-slug.md`
     (context → decision → consequences, ≤40 dòng/record).

## PARITY GATE

Report: `plans/reports/parity-260720-agents-c-vs-claudekit-report.md`.

## Related Code Files

- Create: 5 file `kit/agents/vc-*.md`
- Modify: `kit/skills/{cook,fix,scout,pm,brainstorm,plan,docs,research,journal?}/…` (rewire tên agent)

## Implementation Steps

1. Viết 5 agents theo mẫu (draft → gate → parity table).
2. Grep rewire toàn kit/skills; chạy skill gate lại.
3. `pnpm test` + commit.

## Success Criteria

- [ ] Roster đủ 13 agents pass gate; parity reports đủ 13 con
- [ ] `grep -r "Task(Explore)\|reviewer subagent"` trong kit/skills → 0 tham chiếu mơ hồ, tất cả trỏ tên vc-*
- [ ] cook risk-lanes routing + high-risk confirm gate; pm proof vocabulary; docs mode decision — cả 3 pass skill gate
- [ ] Install smoke: 13 agents land `.claude/agents/vc-*.md`, không đè file CK nào

## Risk Assessment

- Rewire sót chỗ nhắc agent → grep theo cả "agent"/"subagent"/"Task(" và soát tay từng SKILL.md.
