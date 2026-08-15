---
phase: 14
title: "Statusline"
status: completed
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

- [x] Bốn chế độ chạy thật, khác nhau thật: `full`/`compact`/`minimal` đều vẽ model,
      `none` in ra **rỗng** (test chạy tiến trình thật cho cả bốn)
- [x] 5 module render có consumer thật; port thêm 5 module nữa mà entrypoint cần
      (`colors`, `git-info-cache`, `monthly-cost-cache`, `config-counter`, `writing-language`)
- [x] Payload rác / stdin rỗng → exit 0, vẫn vẽ dòng dự phòng (test 4 dạng payload)
- [x] Không có `http`/`https`/`fetch` trong entrypoint (test đọc source)
- [x] `statusLine` người dùng đã đặt → **không bị đụng**, và gỡ cài cũng không xoá nhầm
- [x] Ô ma trận `statusline`: claude-code `observed`, 5 provider còn lại `none` có lý do
- [x] `pnpm test` xanh (987 vitest + 37 + 71 node:test)

## Kết quả (2026-08-15)

### Bước 1 — statusline là artifact kind riêng

Nó cần khoá `statusLine` riêng trong `settings.json`, không phải một binding hook, và cài
được hay không là câu hỏi **theo provider**. Ma trận là chỗ repo này trả lời "cái gì đi đâu
cho ai" — nhét statusline vào `hook` sẽ khiến bảng nói sai. Phase 3 đã mở đường với
`outputStyle`, nên đi lại đường đó.

File cài vào **cùng thư mục `av/` với hook**, không phải `.claude/statusline/`: cách dò
`_lib` khi đó vẫn đúng nguyên (bằng không phải thêm trường hợp thứ ba cho đúng một file),
và khoá settings mang đường dẫn tuyệt đối nên vị trí vô hình với người dùng.

### Hai lỗi nối dây, cả hai đều thuộc loại "im lặng không chạy"

1. **Entrypoint đọc `config.statusline` phẳng** (kiểu upstream), schema phase 10 lồng
   `statusline.mode`. Đọc phẳng nghĩa là **luôn undefined** → thanh luôn vẽ `full` bất kể
   người dùng đặt gì, và không có gì báo. Sửa sang `config.statusline?.mode` / `?.quota`.
2. **Enum schema là `off`, entrypoint switch trên `none`.** Đặt `off` thì lớp config loại
   giá trị (ngoài enum) → về mặc định `full`. Đổi schema sang `none` — tên mà consumer thật
   sự hiểu.

Cả hai chỉ lộ ra khi **chạy thật cả bốn chế độ**; validate và test đơn vị đều không thấy.

### Không cướp statusline của người dùng

Đây là thứ người dùng nhìn suốt phiên. Ba lớp:

- `mergeStatusLine` **không ghi đè** entry trỏ ra ngoài thư mục installer sở hữu — báo lại
  và để nguyên.
- Ghi `settings.json` cho statusline **dùng chung cổng xác nhận** với merge hook: từ chối
  hoặc chạy non-interactive thì chỉ chép file entrypoint, không đụng settings.
- `unmergeStatusLine` khi gỡ **chỉ xoá entry của mình**.

Kiểm bằng chạy thật: máy sandbox có sẵn `statusLine` trỏ `my-own-bar.cjs` → sau khi cài vẫn
nguyên vẹn.

### Một sửa hành vi so với nguồn

stdin rỗng: bản nguồn `console.error('No input provided')` rồi `exit(1)`. Statusline chạy
lại mỗi lần provider vẽ lại thanh — một dòng lỗi ở đây thành một dòng lỗi mỗi lần gõ phím.
Đổi sang vẽ dòng dự phòng và exit 0, giống hệt nhánh catch ngay bên dưới nó.

### Nợ đã trả và nợ mới

`statusline-custom.cjs` **không port**: không nằm trong hash manifest của AgentKit, mtime
12/07 — file riêng của người dùng, và đang là thứ `settings.json` của họ trỏ tới.

Glob test mở rộng sang `kit/statusline/**` nhưng **không** mở sang `kit/**`: skill đã port
mang theo test của upstream (`worktree`, `markdown-novel-viewer`), chạy chúng sẽ làm build
đỏ vì kỳ vọng của người khác về môi trường của người khác.

## Risk Assessment

**Statusline phụ thuộc dữ liệu mà hook usage chưa ghi.** Tín hiệu: thanh hiện rỗng hoặc
`n/a` ở mọi section. Phản ứng: phase 9 phải port xong nhóm usage/session trước — đó là lý
do `dependencies: [9]`, không phải chạy song song.

**Ghi đè statusline người dùng đang dùng.** Tín hiệu: thanh cũ biến mất sau khi cài. Phản
ứng: backup trước khi ghi là bắt buộc, và uninstall phải khôi phục được.
