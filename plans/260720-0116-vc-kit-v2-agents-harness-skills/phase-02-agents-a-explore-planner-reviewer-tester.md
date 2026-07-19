---
phase: 2
title: "Agents A: vc-explore, vc-planner, vc-reviewer, vc-tester"
status: completed
priority: P1
effort: "6h"
dependencies: [1]
---

# Phase 2: Agents A — mẫu chuẩn

## Overview

4 agents được delegate nhiều nhất bởi skills hiện có (scout→explore,
plan→planner, cook→reviewer+tester). Con đầu (vc-explore) làm mẫu chuẩn cho
cả roster.

## Requirements

Công thức mỗi agent (từ brainstorm report): frontmatter (name vc-*, description
2-3 `<example>`, tools tối thiểu, model tier) → Persona 1 câu → Behavioral
Checklist 5-8 items → Workflow gọn → Output template → Status protocol.
Không coupling hạ tầng (không script path, không config file riêng).

| Agent | Model | CK counterpart | Điểm vượt tối thiểu (gợi ý — chốt khi viết) |
|---|---|---|---|
| vc-explore | haiku | explore (36 dòng) | + giới hạn budget đọc file tường minh + bắt buộc cite path mọi claim |
| vc-planner | opus | planner (154 dòng) | Giữ verification discipline (re-grep/cite/trace/enumerate) nhưng bỏ coupling set-active-plan.cjs; + gate "no phase without failure modes" |
| vc-reviewer | sonnet | code-reviewer (182 dòng) | Giữ anti-AI-slop posture + behavioral checklist; + map từng acceptance criterion → code+test (từ vc:cook review-gate) |
| vc-tester | haiku | tester (164 dòng) | Giữ diff-aware mapping A-E + auto-escalation; + quy tắc red-green evidence bắt buộc trong report |

## PARITY GATE (per plan.md)

Đọc bản CK trước khi viết; bảng đối chiếu capability → phủ/bỏ-có-lý-do + điểm
vượt, lưu `plans/reports/parity-260720-agents-a-vs-claudekit-report.md`.

## Related Code Files

- Create: `kit/agents/vc-explore.md`, `kit/agents/vc-planner.md`, `kit/agents/vc-reviewer.md`, `kit/agents/vc-tester.md`
- Create: report parity (trên)

## Implementation Steps

1. Đọc 4 bản CK, extract capability checklist từng con.
2. Viết vc-explore trước (nhỏ nhất) → chạy agent lint gate → chỉnh làm mẫu.
3. Viết 3 con còn lại theo mẫu; mỗi con: draft → gate → parity table → chỉnh.
4. `pnpm test` + commit.

## Success Criteria

- [x] 4 agents pass gate (49/63/75/59 dòng), sandbox smoke claude-code + codex TOML xác nhận
- [x] Parity report đầy đủ 4 bảng (parity-260720-agents-a-vs-claudekit-report.md), mỗi con ≥3 điểm vượt
- [x] Không câu nào copy nguyên văn CK

## Risk Assessment

- 120 dòng chật cho vc-planner/vc-reviewer → ưu tiên cắt phần trùng với skill
  tương ứng (vc:plan, cook review-gate) — agent trỏ skill, không lặp.
