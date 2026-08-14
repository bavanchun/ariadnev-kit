---
phase: 14
title: "Statusline"
status: pending
priority: P2
effort: "3d"
dependencies: [9]
---

# Phase 14: Statusline

## Overview

Nguồn có một statusline hoàn chỉnh mà bản plan trước hoãn vô thời hạn: 2 entrypoint
(`statusline-custom.cjs`, `ak-engineer-statusline.cjs`) cộng 5 module render trong `_lib`.
Hoãn mà không có phase kế nghĩa là 5 module bị port ở phase 9 rồi nằm mồ côi, và một tính
năng người dùng nhìn thấy được bị bỏ im lặng.

Quyết định 2026-08-14: **port đầy đủ, phase riêng có acceptance riêng.**

## Requirements

Functional:
- Port 2 entrypoint statusline, đổi định danh sang `ariadnev`/`av`.
- Port 5 module render trong `_lib`: `statusline-section-registry`,
  `statusline-activity-renderers`, `statusline-string-utils`, `statusline-render-modes`,
  `statusline-session-cache`.
- Cấu hình `statusline` trong user config (phase 10 đã có khoá): `full | compact | minimal | none`.
- Cài đặt statusline vào `settings.json` của provider — đây là ô ma trận **mới**, phải verify
  hoặc để `unverified` như mọi ô khác.

Non-functional:
- Statusline lỗi không được làm hỏng phiên: fail mở, render rỗng.
- Không tự gọi mạng. Dữ liệu lấy từ cache mà hook đã ghi.

## Architecture

Statusline là process riêng do provider spawn, không phải hook. Nó đọc state mà nhóm hook
usage/session đã ghi — nên phụ thuộc phase 9 (những hook đó phải chạy trước thì mới có dữ
liệu để hiển thị).

Ô ma trận: cài statusline nghĩa là ghi khoá `statusLine` vào `settings.json` của provider.
Với claude-code đây là đường đã biết; với provider khác chưa rõ. Theo nguyên tắc chung, ô
nào không verify được thì skip + log.

Chọn giữ **một** entrypoint chứ không hai: nguồn có `statusline-custom.cjs` (người dùng
tuỳ biến) và `ak-engineer-statusline.cjs` (bản kit ship). Port bản kit ship thành
`av-statusline.cjs`; bản tuỳ biến là file của người dùng, không thuộc kit — ghi rõ trong docs.

## Related Code Files

- Create: `kit/hooks/_lib/statusline-*.cjs` — 5 module (nếu phase 9 chưa port thì port ở đây)
- Create: `kit/statusline/av-statusline.cjs` — entrypoint
- Modify: `packages/cli/src/kit/kit-types.ts` — kind `statusline` nếu cần artifact riêng
- Modify: `packages/cli/src/providers/resolver.ts` — đường dẫn cài + khoá `settings.json`
- Modify: `packages/cli/src/providers/spec-verified.ts` — ô mới, mặc định `false`
- Modify: `packages/cli/src/install/hook-settings-merge.ts` — merge khoá `statusLine`
- Create: test cho render modes và section registry

## Implementation Steps

1. Quyết statusline là artifact kind riêng hay một biến thể của `scripts` — dựa trên việc
   nó có cần khoá `settings.json` riêng không. Ghi lý do vào file này.
2. Port 5 module `_lib` + test cho `render-modes` (4 chế độ) và `section-registry`.
3. Port entrypoint thành `av-statusline.cjs`; đổi định danh.
4. Merge khoá `statusLine` vào `settings.json` provider, dùng lại cơ chế merge của hook.
   Không ghi đè `statusLine` người dùng đã tự đặt — backup rồi mới ghi, như mọi write khác.
5. Nối khoá config `statusline` (phase 10) vào chế độ render.
6. Cài thử và xem thật trên claude-code ở cả 4 chế độ.

## Success Criteria

- [ ] Statusline hiện đúng trên claude-code ở cả `full | compact | minimal`; `none` thì tắt
- [ ] 5 module `_lib` có consumer thật, không còn mồ côi
- [ ] Statusline throw → phiên vẫn chạy, thanh render rỗng (test)
- [ ] Không phát request mạng nào (test)
- [ ] `settings.json` người dùng đã có `statusLine` khác → được backup trước khi ghi
- [ ] Ô ma trận statusline có `evidence` hoặc là `unverified` có lý do
- [ ] `pnpm test` xanh

## Risk Assessment

**Statusline phụ thuộc dữ liệu mà hook usage chưa ghi.** Tín hiệu: thanh hiện rỗng hoặc
`n/a` ở mọi section. Phản ứng: phase 9 phải port xong nhóm usage/session trước — đó là lý
do `dependencies: [9]`, không phải chạy song song.

**Ghi đè statusline người dùng đang dùng.** Tín hiệu: thanh cũ biến mất sau khi cài. Phản
ứng: backup trước khi ghi là bắt buộc, và uninstall phải khôi phục được.
