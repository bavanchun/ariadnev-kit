---
phase: 3
title: "Agents B: vc-debugger, vc-developer, vc-git-manager, vc-simplifier"
status: pending
priority: P1
effort: "5h"
dependencies: [2]
---

# Phase 3: Agents B

## Overview

4 agents thi hành: debug, implement, git, simplify. Nhân bản mẫu phase 2.

## Requirements

| Agent | Model | CK counterpart | Điểm vượt tối thiểu (gợi ý) |
|---|---|---|---|
| vc-debugger | sonnet | debugger (171 dòng) | Giữ 2-3 competing hypotheses + evidence chain; trỏ vc:fix root-cause loop thay vì lặp; bỏ coupling repomix/gemini dài dòng |
| vc-developer | sonnet | fullstack-developer (120 dòng) | Generalist (quyết định brainstorm UQ#1); + strict file-ownership khi chạy parallel + TDD mặc định từ vc:cook |
| vc-git-manager | haiku | git-manager (18 dòng) | CK quá mỏng — thêm: secret scan trước stage, conventional commit từ diff thật (không bịa scope), 2-4 tool calls budget giữ nguyên |
| vc-simplifier | haiku | code-simplifier (54 dòng) | + ranh giới "không đổi behavior" enforce bằng test-trước-sau + danh sách simplification patterns cụ thể |

## PARITY GATE

Như phase 2; report: `plans/reports/parity-260720-agents-b-vs-claudekit-report.md`.

## Related Code Files

- Create: `kit/agents/vc-debugger.md`, `kit/agents/vc-developer.md`, `kit/agents/vc-git-manager.md`, `kit/agents/vc-simplifier.md`

## Implementation Steps

1. Đọc 4 bản CK, extract checklist.
2. Viết theo mẫu phase 2, từng con: draft → gate → parity table.
3. `pnpm test` + commit.

## Success Criteria

- [ ] 4 agents pass gate ≤120 dòng; parity report đủ; ≥1 điểm vượt/con
- [ ] vc-git-manager tương thích flow vc:git skill (cm/cp/pr/prc)

## Risk Assessment

- vc-developer generalist có thể mỏng ở frontend chuyên sâu → ghi rõ trong
  description là generalist, cụm UI chuyên sâu để v3.
