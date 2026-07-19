---
phase: 1
title: "Skill spec + kit CI gates"
status: completed
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Skill spec + kit CI gates

## Overview

Chuẩn hóa skill authoring spec cho bộ `vc` và dựng CI gate tự động (lint frontmatter/description/size) TRƯỚC khi viết 11 skills mới — gate này chính là "test" cho các phase 4-6.

## Requirements

- Functional: spec doc + validator script chạy trong `pnpm test` và CI; validate mọi skill trong `kit/skills/`.
- Non-functional: validator thuần Node (không deps mới nặng), chạy <2s, lỗi báo rõ file + rule vi phạm.

## Architecture

- Spec sống ở `docs/vc-skill-authoring-spec.md` (rút từ CK: 3-tầng disclosure, giới hạn dòng, no-duplication, naming `vc:`).
- Validator = mở rộng `load-kit.ts` validation hiện có (đã enforce `vc:` prefix + name==dir) thêm rule mới, test qua vitest (KHÔNG tạo script rời — DRY với KitValidationError sẵn có).
- Rules enforce: description 20-200 chars + chứa trigger verb; SKILL.md ≤300 dòng; mỗi `references/*.md` ≤300 dòng; không duplicate heading content giữa SKILL.md và references (heuristic: trùng heading text); frontmatter fields hợp lệ (name, description bắt buộc; user-invocable, allowed-tools, metadata optional).

## Related Code Files

- Modify: `packages/cli/src/kit/load-kit.ts` (thêm validation rules)
- Modify: `packages/cli/src/kit/kit-types.ts` (frontmatter type mở rộng)
- Create: `packages/cli/src/kit/skill-lint.ts` (nếu rules >200 LOC thì tách; ngược lại giữ trong load-kit)
- Modify: `packages/cli/src/kit/kit-fixtures.test.ts` (tests mới)
- Create: `docs/vc-skill-authoring-spec.md`
- Modify: `.github/workflows/*` (nếu CI chưa chạy đủ — hiện `pnpm test` đã trong CI thì không cần đổi)

## Implementation Steps

1. **Tests first**: thêm vitest cases vào `kit-fixtures.test.ts` — negative fixtures cho từng rule mới (description quá ngắn/dài, SKILL.md >300 dòng, reference >300 dòng, thiếu frontmatter field). Chạy → đỏ.
2. Implement rules trong load-kit/skill-lint đến khi xanh.
3. Chạy validator lên 4+1 skills hiện có (echo-tool, hello-world, obsidian, vchun-git) — sửa skill vi phạm (dự kiến vchun-git/obsidian cần chỉnh description).
4. Viết `docs/vc-skill-authoring-spec.md`: anatomy, 3-tầng disclosure, limits, checklist trước khi thêm skill (chưng cất từ CK skill-creator checklist — viết lại, không copy).
5. Verify `pnpm test` + coverage ≥90% giữ nguyên.

## Success Criteria

- [x] Tests mới đỏ-trước-xanh-sau (TDD evidence trong commit history)
- [x] 5 skills hiện có pass gate (vchun-git frontmatter đã chỉnh)
- [x] Spec doc ≤300 dòng, có checklist actionable (docs/vc-skill-authoring-spec.md, 97 dòng)
- [x] `pnpm test` xanh, coverage không tụt (99.28%)

## Risk Assessment

- Heuristic no-duplication dễ false-positive → bắt đầu mức warning (không fail), nâng thành error sau phase 6.
- Rule 300 dòng có thể chật cho vc:cook (nhúng test/review) → cho phép per-skill override qua frontmatter `metadata.maxLines` với trần 400, ghi rõ trong spec.
