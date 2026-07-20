---
phase: 2
title: "Exemplar rewrite: research + shared risk-lane quick-check reference"
status: pending
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Exemplar rewrite: research + shared risk-lane quick-check ref

## Overview

Exemplar thứ hai (skill có output nặng, khác kiểu ask) + tạo shared reference
risk-lane quick-check mà các phase sau sẽ link vào.

## Requirements

- `kit/skills/research/SKILL.md` rewrite cook-grade: workflow (scope → gather
  đa nguồn có giới hạn tool-calls → cross-validate → report), `## Output format`
  (Recommendation + Findings + Sources + Unresolved — report contract), `## Quality
  gates` (recency check, ≥2 nguồn độc lập cho claim quan trọng, proof-vocab tag
  cho khuyến nghị kỹ thuật: khuyến nghị nào cần unit/integration/e2e proof khi
  implement).
- Shared ref: `kit/skills/_shared/risk-lane-quick-check.md` (hoặc vị trí hợp
  convention kit — kiểm tra installer copy được; nếu `_shared` không nằm trong
  adapt paths thì đặt trong `kit/rules/` như intake-and-context.md đang có và
  link tương đối): bảng tiny/normal/high-risk + 10 risk flags + hard gates rút
  từ cook/references/risk-lanes.md, ≤40 dòng, 1 nguồn duy nhất (cook refs trỏ
  về đây thay vì trùng lặp).
- Parity: CK research skill đối chiếu.

## Related Code Files

- Modify: `kit/skills/research/SKILL.md`, `kit/skills/cook/references/risk-lanes.md` (trỏ shared)
- Create: shared risk-lane quick-check (vị trí chốt khi làm — xem Requirements)
- Read: `packages/cli/src/adapt/paths.ts` (xác nhận vị trí install được)

## Implementation Steps

1. Xác nhận vị trí shared ref install-able (đọc paths.ts + spec-verified).
2. Viết shared ref; sửa cook risk-lanes.md thành nguồn trỏ (không trùng nội dung).
3. Rewrite research theo template phase 1.
4. `pnpm test` xanh; parity entry research.

## Success Criteria

- [ ] Shared risk-lane ref tồn tại ở vị trí installer copy được, ≤40 dòng, không trùng lặp nội dung với cook refs
- [ ] research đạt 7 mục cook-grade, lint xanh
- [ ] Parity entry research có ≥1 điểm vượt

## Risk Assessment

Vị trí `_shared/` có thể không match adapt engine → quyết định vị trí TRƯỚC khi
viết (step 1), fallback `kit/rules/`. Không hardcode path mới vào engine.
