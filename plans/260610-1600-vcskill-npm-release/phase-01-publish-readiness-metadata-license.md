---
phase: 1
title: Publish-readiness metadata + LICENSE
status: completed
priority: P1
effort: 1-2h
dependencies: []
---

# Phase 1: Publish-readiness metadata + LICENSE

## Overview
Bổ sung metadata phát hành cho `packages/cli/package.json` và thêm LICENSE (MIT)
để `npm publish --access public` chạy đúng, không cảnh báo thiếu trường.

## Requirements
- Functional: `npm publish --dry-run` (trong `packages/cli`) chạy không lỗi/không thiếu trường bắt buộc cho public package có provenance.
- Non-functional: không đổi `files`, không kéo thêm runtime dependency; KISS.

## Architecture
Chỉ sửa metadata + thêm file tĩnh. Không đụng `src/`, không đụng adapt engine.
Root monorepo giữ `private: true` (chỉ publish `packages/cli`).

## Related Code Files
- Modify: `packages/cli/package.json`
- Create: `LICENSE` (root) — MIT, năm 2026, holder = VChun (bavanchun)
- (Tùy) Create: `packages/cli/LICENSE` hoặc thêm `"LICENSE"` vào `files` nếu muốn license nằm trong tarball. Quyết định: thêm `LICENSE` vào `files` của cli và copy khi prepack (xem Steps).

## Implementation Steps
1. Thêm vào `packages/cli/package.json`:
   - `"license": "MIT"`
   - `"author": "VChun <hoangbavan4478@gmail.com>"`
   - `"repository": { "type": "git", "url": "git+https://github.com/bavanchun/vcskill.git", "directory": "packages/cli" }`
   - `"homepage": "https://github.com/bavanchun/vcskill#readme"`
   - `"bugs": { "url": "https://github.com/bavanchun/vcskill/issues" }`
   - `"keywords": ["agent-skills","claude-code","codex","cursor","opencode","skills","cli","ai-agents"]`
   - `"publishConfig": { "access": "public", "provenance": true }`
2. Tạo `LICENSE` ở root (chuẩn MIT text).
3. Đảm bảo LICENSE có trong tarball: thêm `"LICENSE"` vào mảng `files` của `packages/cli/package.json`, và trong `scripts/bundle-kit-assets.mjs` copy `repoRoot/LICENSE` → `pkgDir/LICENSE` (cùng pattern đang copy kit.config.json). KISS: tái dùng cơ chế bundle sẵn có.
4. Chạy `pnpm --filter vcskill run verify-tarball` — phải vẫn pass, và tarball giờ có `LICENSE`.
5. Chạy `cd packages/cli && npm publish --dry-run 2>&1` — đọc output, xác nhận không thiếu trường, version = 0.1.0, files đúng. (KHÔNG publish thật ở phase này.)

## Success Criteria
- [ ] `package.json` có đủ license/repository/homepage/bugs/keywords/author/publishConfig.
- [ ] LICENSE (MIT) tồn tại ở root và xuất hiện trong tarball (`verify-tarball` pass).
- [ ] `npm publish --dry-run` không báo thiếu trường bắt buộc.
- [ ] `pnpm test` vẫn 85/85 pass (metadata không phá test).

## Risk Assessment
- Risk: `provenance: true` yêu cầu publish từ CI có OIDC; publish tay local sẽ bỏ qua provenance (npm cảnh báo, không fail). Mitigation: publish thật qua GHA ở Phase 2; lần claim tên đầu tiên (tay) chấp nhận không provenance.
- Risk: `directory` field sai khiến npm link nguồn sai. Mitigation: verify bằng dry-run output.
