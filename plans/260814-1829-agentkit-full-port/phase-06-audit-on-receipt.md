---
phase: 6
title: "vc audit như reader trên receipt"
status: pending
priority: P1
effort: "1d"
dependencies: [5]
---

# Phase 6: `av audit` như reader trên receipt

## Overview

Bản plan trước dựng ba module state mới (`manifest.ts`, `hash-inventory.ts`,
`ownership.ts`) trên tiền đề "vcskill có receipt nhưng không có hash inventory". Tiền đề đó
sai: receipt **đã là** ownership record có SHA256 mỗi file, và uninstall đã dùng hash-drift
làm bảo đảm sở hữu. Phase này chỉ viết phần thật sự thiếu — một reader phân loại drift.

Effort giảm từ 3d xuống 1d.

## Requirements

Functional:
- `av audit [kit]` phân loại từng file đã cài: `ok` | `modified` | `missing` | `untracked`.
- `av audit scripts` liệt kê script hook và skill kèm dấu hiệu rủi ro thực thi
  (`sudo`, `curl|tar`, `go install`, ghi ngoài thư mục sở hữu) — đây là cổng của phase 11.
- `--json` envelope chuẩn; `--strict` bỏ bộ lọc rẻ và hash lại toàn bộ.
- Exit 0 khi khớp, 1 khi có drift.

Non-functional:
- Audit kit 103 skill ≤ 3s ở chế độ mặc định.
- **Không** tạo bản ghi state mới. Đọc `Receipt`, hết.

## Architecture

`ReceiptFile { path, sha256 }` đã có sẵn tại `install-receipt.ts:11-15`, ghi mỗi write op
tại `:97`. `doctor/diagnose.ts:56-75` đã duyệt receipt và phát `missing file:`.

Nên `audit.ts` là hàm pure nhận `Receipt` + kết quả `stat`/hash và trả phân loại. Phần đọc
đĩa tách riêng. Phân loại `untracked` cần biết thư mục nào ariadnev sở hữu — suy ra từ tập
`path` trong receipt, không cần registry riêng.

Bộ lọc rẻ: `size` + `mtime` thêm vào `ReceiptFile` (phase 5 đã mở receipt), chỉ hash lại
file có dấu hiệu đổi. `--strict` bỏ qua bộ lọc.

Cân nhắc gộp vào `doctor` thay vì lệnh riêng: `doctor` đã đọc receipt và đã có khái niệm
findings. Quyết ở bước 1 sau khi đọc `diagnose.ts`.

## Related Code Files

- Modify: `packages/cli/src/install/install-receipt.ts` — thêm `size`, `mtime` vào `ReceiptFile`
- Create: `packages/cli/src/doctor/audit.ts` — phân loại thuần
- Create: `packages/cli/src/doctor/audit.test.ts`
- Create: `packages/cli/src/doctor/audit-scripts.ts` — quét dấu hiệu rủi ro
- Create: `packages/cli/src/doctor/audit-scripts.test.ts`
- Modify: `packages/cli/src/cli/register-quality-commands.ts` — đăng ký `audit`
- Modify: `packages/cli/src/cli/contract-command.ts` — thêm `audit` vào `KNOWN_COMMANDS`
  và capability tương ứng

## Implementation Steps

1. Đọc `doctor/diagnose.ts` và quyết: `audit` là lệnh riêng hay một chế độ của `doctor`.
   Ghi lý do vào phase file này trước khi code.
2. Test đỏ `audit.ts`: bốn phân loại trên fixture receipt + trạng thái đĩa giả lập.
3. Thêm `size`/`mtime` vào `ReceiptFile`; xử lý receipt cũ thiếu field (coi như luôn hash lại).
4. Viết reader đọc đĩa; hash streaming cho file lớn.
5. `audit-scripts.ts`: quét pattern rủi ro; test bằng chính `cti-expert/scripts/install.sh`
   làm fixture (nó có đủ `sudo`, `go install`, `curl|tar`).
6. Đăng ký lệnh + `--json` + exit code; cập nhật `KNOWN_COMMANDS` và `CAPABILITIES`.
7. Đo thời gian audit trên kit đầy đủ.

## Success Criteria

- [ ] Không có file state mới nào ngoài receipt
- [ ] Sửa tay một file đã cài → `modified` đúng file đó
- [ ] Xoá file đã cài → `missing`; thêm file lạ vào thư mục sở hữu → `untracked`
- [ ] Kit sạch → exit 0 kể cả `--strict`
- [ ] `av audit scripts` phát hiện `sudo`/`curl|tar`/`go install` trong fixture install.sh
- [ ] Audit 103 skill ≤ 3s mặc định
- [ ] `contract --json` liệt kê `audit`
- [ ] `pnpm test` xanh, `audit.ts` coverage ≥ 90%

## Risk Assessment

**Bộ lọc mtime bỏ sót file bị sửa giữ nguyên mtime.** Tín hiệu: audit báo `ok` cho file đã
đổi nội dung. Phản ứng: `--strict` hash lại toàn bộ; mặc định giữ bộ lọc cho tốc độ. Phase
10 gọi `--strict` trước khi chạy script.

**`untracked` báo nhầm khi người dùng cố ý thêm file.** Tín hiệu: nhiễu cảnh báo. Phản ứng:
`untracked` là finding mức thông tin, không làm exit khác 0 trừ khi `--strict`.
