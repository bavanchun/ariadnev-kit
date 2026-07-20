---
phase: 1
title: "Cook-grade template + exemplar rewrite: ask"
status: completed
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Cook-grade template + exemplar rewrite: ask

## Overview

Chốt "cook-grade standard" thành 1 template cụ thể trong authoring spec, rồi
rewrite `vc:ask` làm exemplar đầu tiên. Format duyệt ở đây là khuôn cho 9 skill
còn lại — làm kỹ 1 lần, chống drift.

## Requirements

- Functional: `docs/vc-skill-authoring-spec.md` thêm section "Cook-grade skill
  standard" (7 mục từ plan.md, mỗi mục có ví dụ ngắn lấy từ cook).
- `kit/skills/ask/SKILL.md` rewrite: workflow steps thật (nhận câu hỏi → scout
  evidence trong repo → verdict), `## Output format` (Verdict 1-2 câu + Why +
  Trade-offs + Next step), `## Quality gates` (grounded-in-repo check, recency
  check, "did I answer the asked question"), chaining note.
- Parity: đọc CK `~/.claude/skills/ask/` — bảng kept/dropped + ≥1 điểm vượt
  (nháp vào parity report, phase 6 đóng).

## Related Code Files

- Modify: `docs/vc-skill-authoring-spec.md`, `kit/skills/ask/SKILL.md`
- Read: `kit/skills/cook/SKILL.md` + references (chuẩn tham chiếu), CK ask skill

## Implementation Steps

1. Đọc CK ask + vc ask hiện tại; liệt kê capability.
2. Viết section chuẩn vào authoring spec (đây là "template").
3. Rewrite ask theo template; ≤120 dòng.
4. `pnpm test` (kit-fixtures lint) xanh; nháp parity entry.

## Success Criteria

- [ ] Authoring spec có section cook-grade standard đủ 7 mục + ví dụ
- [ ] ask đạt cả 7 mục, ≤120 dòng, lint xanh
- [ ] Parity entry ask có ≥1 điểm vượt CK cụ thể

## Risk Assessment

Template quá cứng làm skill gượng ép → cho phép mục 5 (proof/risk wiring) ghi
"N/A + lý do" với skill thuần trả lời (ask, docs-seeker).
