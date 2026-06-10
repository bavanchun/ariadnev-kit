---
phase: 2
title: Release automation (Changesets + workflow)
status: completed
priority: P1
effort: 2-3h
dependencies:
  - 1
---

# Phase 2: Release automation (Changesets + workflow)

## Overview
Cài Changesets cho monorepo single-package + workflow `release.yml` để: PR thêm changeset
→ bot mở "Version Packages" PR (bump version + changelog) → merge → tự `npm publish`.

## Requirements
- Functional: merge Version PR trên `main` → GHA publish `vcskill` lên npm tự động.
- Non-functional: cấu hình tối giản (1 package), không phá CI hiện có.

## Architecture
- `@changesets/cli` ở devDependencies root. `.changeset/config.json` single-package, `baseBranch: main`, `access: public`.
- Publish auth: `changesets/action` dùng secret `NPM_TOKEN` (Automation token). Provenance bật qua `permissions: id-token: write` + `NPM_CONFIG_PROVENANCE: true`.
- CI `ci.yml` giữ nguyên (lint/build/test/coverage trên PR + push). `release.yml` tách riêng, chạy trên push `main`.

## Related Code Files
- Modify: root `package.json` — thêm `@changesets/cli` (dev) + script `"changeset": "changeset"`, `"version-packages": "changeset version"`, `"release": "changeset publish"`.
- Create: `.changeset/config.json`
- Create: `.changeset/README.md` (do `changeset init` sinh, giữ)
- Create: `.github/workflows/release.yml`

## Implementation Steps
1. `pnpm add -Dw @changesets/cli` rồi `pnpm changeset init`. Kiểm tra `.changeset/config.json` sinh ra.
2. Sửa `.changeset/config.json`: `"access": "public"`, `"baseBranch": "main"`, `"changelog": "@changesets/cli/changelog"`. Đảm bảo root (`vcskill-monorepo`, private) không bị publish — Changesets bỏ qua private package tự động; chỉ `vcskill` được publish.
3. Tạo `.github/workflows/release.yml`:
   - trigger: `push` branch `main`.
   - permissions: `contents: write`, `pull-requests: write`, `id-token: write`.
   - steps: checkout → setup pnpm@9 + node 18 (cache pnpm) → `pnpm install --frozen-lockfile` → `pnpm run build` → `changesets/action@v1` với `publish: pnpm run release`, `version: pnpm run version-packages`.
   - env: `GITHUB_TOKEN`, `NPM_TOKEN`, `NPM_CONFIG_PROVENANCE: true`.
   - **Quan trọng:** `release` script phải build cli trước publish. `changeset publish` gọi `prepack` của cli (tsup + bundle-kit-assets) tự động khi pack → kit + LICENSE vào tarball. Xác nhận lại prepack chạy trong publish.
4. Thêm 1 changeset khởi điểm: `pnpm changeset` → chọn `vcskill`, bump `patch` (hoặc `minor`), mô tả "public npm release". Commit `.changeset/*.md`.
5. Verify local trước khi đẩy CI: `pnpm changeset version --snapshot` thử trên nhánh tạm để xem version bump + CHANGELOG sinh đúng, rồi revert (KHÔNG commit snapshot).

## Success Criteria
- [ ] `.changeset/config.json` đúng (public, baseBranch main, single package).
- [ ] `release.yml` hợp lệ (yaml lint/`act` hoặc đọc kỹ), có `id-token: write` + `NPM_TOKEN` env.
- [ ] `changeset version` (thử local) bump đúng `vcskill` và sinh `CHANGELOG.md`, không đụng root private.
- [ ] CI `ci.yml` vẫn xanh, không xung đột với `release.yml`.

## Risk Assessment
- Risk: publish chạy nhưng tarball thiếu kit/LICENSE nếu prepack không chạy trong `changeset publish`. Mitigation: bước verify-tarball ở Phase 1 + thêm `prepublishOnly` hoặc đảm bảo `prepack` được npm gọi khi pack; smoke-test Phase 3 bắt lỗi này.
- Risk: NPM_TOKEN chưa được user thêm vào secrets → workflow fail. Mitigation: runbook Phase 3 + workflow fail rõ ràng, không publish nửa vời.
- Risk: lần publish đầu tiên cần claim tên — nếu repo chưa từng publish, `changeset publish` vẫn tạo được package mới với Automation token có quyền. Mitigation: runbook nêu fallback publish tay 1 lần.
- Trade-off đã chấp nhận (user chọn): Changesets nặng nghi thức hơn tag-trigger cho 1 package solo; đổi lại có changelog tự động.
