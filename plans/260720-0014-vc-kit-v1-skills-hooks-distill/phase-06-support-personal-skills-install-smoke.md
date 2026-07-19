---
phase: 6
title: "Support + personal skills + install smoke"
status: completed
priority: P2
effort: "5h"
dependencies: [3, 5]
---

# Phase 6: Support + personal skills + install smoke

## Overview

Hoàn thiện roster: 3 support skills (`vc:problem-solving`, `vc:research`, `vc:docs`), nâng obsidian-second-brain-note đạt spec (term-config ngoài kit — validation), dọn kit demo, rồi smoke test cài đặt end-to-end đa provider. Đóng plan.

## Requirements

- Functional:
  - **vc:problem-solving**: kỹ thuật gỡ bí (reframe, inversion, simplification cascade) — size S.
  - **vc:research**: đánh giá công nghệ/best practices, output report chuẩn `plans/reports/` — size S.
  - **vc:docs**: init/update docs theo cấu trúc `docs/` chuẩn của user; quy tắc "update chỉ khi user-facing behavior đổi".
  - **Personal migrate**: `obsidian-second-brain-note` đạt spec phase 1 (description/size, content English). **term-config Ở NGOÀI kit** (validation decision — chứa path chezmoi cá nhân, không public npm; roster kit = 12 skills (obsidian là 1 trong 12)).
<!-- Updated: Validation Session 1 - term-config out of kit -->

  - **Dọn kit**: xóa `echo-tool`, `hello-world` (demo skills — không thuộc bộ vc) hoặc chuyển thành fixtures test.
  - **Smoke test**: máy sạch (tmp HOME): `npx vcskill install` → claude-code nhận 12 skills + 5 hooks + settings merge; codex/cursor nhận skills, hooks skip-log.
- Non-functional: `pnpm test` xanh; coverage ≥90%; nâng no-duplication heuristic (phase 1) từ warning → error nếu ổn.

## Architecture

- Smoke test = script test tích hợp trong `install.test.ts` mở rộng (fixture kit thật thay vì kit mini) hoặc bash script thủ công có ghi kết quả — ưu tiên vitest integration để CI giữ được.
- echo-tool/hello-world nếu đang được `kit-fixtures.test.ts` dùng làm fixture thật → chuyển thành fixtures tổng hợp trong test tmpdir trước khi xóa (không để test phụ thuộc kit content).

## Related Code Files

- Create: `kit/skills/problem-solving/`, `kit/skills/research/`, `kit/skills/docs/`
- Modify: `kit/skills/obsidian-second-brain-note/SKILL.md` (đạt spec)
- Delete: `kit/skills/echo-tool/`, `kit/skills/hello-world/` (sau khi gỡ phụ thuộc test)
- Modify: `packages/cli/src/kit/kit-fixtures.test.ts` (fixtures độc lập kit content)
- Modify: `packages/cli/src/install/install.test.ts` (integration smoke)
- Modify: `README.md` (roster + hooks matrix), `docs/` cập nhật
- Create: changeset minor "vc kit v1 complete"

## Implementation Steps

1. **Tests first**: viết integration test đỏ — install full kit vào tmp HOME, assert 12 skills + 5 hooks + settings merge + provider-skip.
2. Gỡ phụ thuộc test khỏi demo skills → xóa demo skills → gate + tests xanh lại.
3. Viết 3 support skills (đã có mẫu 2 phase trước).
4. Nâng personal skills đạt spec.
5. Chạy full: `pnpm test` + coverage + integration smoke → xanh.
6. Sync-back plan: check mọi checkbox các phase, update plan.md status = completed (dùng đúng quy trình vc:pm vừa viết — dogfood).
7. Changeset + cập nhật README/docs.

## Success Criteria

- [ ] Integration smoke pass trên CI — chạy trong `pnpm test` (CI verify khi push)
- [x] Kit chỉ còn 12 skills roster + 5 hooks (demo skills đã xóa, smoke test assert)
- [x] README matrix đúng thực tế (hooks: claude only)
- [x] Toàn plan sync-back: 6 phases completed, checkbox khớp
- [x] Dogfood: chính vc:pm dùng để đóng plan này

## Risk Assessment

- Xóa demo skills làm gãy tests hiện có → bước 2 gỡ phụ thuộc TRƯỚC khi xóa, có test chứng minh.
- term-config đã chốt ngoài kit (validation) — không còn open question; chỉ cần đảm bảo docs/README không hứa skill này.
- Smoke test tmp HOME trên Windows CI khác biệt path — dùng `os.homedir()` mock theo pattern test hiện có.
