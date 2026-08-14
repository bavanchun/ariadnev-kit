---
phase: 6
title: "vc audit như reader trên receipt"
status: completed
completed: 2026-08-14
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

## Quyết định bước 1: lệnh riêng, không phải chế độ của `doctor`

Đọc `doctor/diagnose.ts` xong, hai thứ này khác nhau về bản chất chứ không chỉ về độ sâu:

- `DiagnoseDeps` cố ý **không có** khả năng đọc nội dung file — chỉ `fileExists`,
  `readSettingsJson`, `hookExecutable`. Doctor là phân loại nhanh, không bao giờ hash.
- Đơn vị đầu ra của doctor là `ProviderFinding` **theo provider**, có `weight` nuôi
  `scoreAudit()`. Audit sinh một dòng **cho mỗi file** — 1511 dòng. Nhét chúng vào
  `ProviderFinding[]` sẽ phá luôn thanh health score (1511 × weight) và output của doctor.
- Hợp đồng exit khác nhau: `untracked` là thông tin, chỉ fail khi `--strict`.

Nên: `doctor` = phân loại nhanh + tự sửa; `audit` = pháp y từng file. Cả hai đều báo file
thiếu, và đó là chồng lấn có chủ ý — doctor trả lời "cài đặt có còn lành không" trong vài
mili giây, audit trả lời "chính xác file nào đã lệch".

Token capability cũng phải tách: `doctor.audit.v1` đã tồn tại và chỉ về **health score** của
doctor. Lệnh này lấy token riêng.

## Success Criteria

- [x] Không có file state mới nào ngoài receipt
- [x] Sửa tay một file đã cài → `modified` đúng file đó
- [x] Xoá file đã cài → `missing`; thêm file lạ vào thư mục sở hữu → `untracked`
- [x] Kit sạch → exit 0 kể cả `--strict`
- [x] `av audit scripts` phát hiện `sudo`/`curl|tar`/`go install` trong fixture install.sh
- [x] Audit 103 skill ≤ 3s mặc định — đo được **~35ms**
- [x] `contract --json` liệt kê `audit`
- [x] `pnpm test` xanh (789 vitest), `audit.ts` và `audit-scripts.ts` coverage **100%**

## Kết quả thực thi (2026-08-14)

### Bỏ bộ lọc size/mtime — có số đo, không phải phỏng đoán

Bước 3 của plan yêu cầu thêm `size`/`mtime` vào `ReceiptFile` để khỏi hash lại toàn bộ. Đã
đo trước khi viết: hash **1545 file / ~17MB** hết **31–47ms**, tức là dưới ngân sách 3s hai
bậc độ lớn.

Nên bộ lọc đó bị bỏ có chủ ý. Nó sẽ đánh đổi ~30ms lấy: hai field mới trong receipt, một bài
toán receipt cũ thiếu field, và đúng **rủi ro số 1 mà chính phase này liệt kê** — file bị sửa
mà giữ nguyên mtime sẽ được báo `ok`. Không đáng.

Hệ quả: `--strict` không còn nghĩa "bỏ bộ lọc rẻ" (không có bộ lọc nào để bỏ) mà mang nghĩa
còn lại trong plan — **`untracked` cũng tính là thất bại**. Mặc định luôn hash tất cả, nên
không có chế độ nào "nhìn hời hợt" để phải bù.

### `untracked` và những file dùng chung

Suy ra thư mục sở hữu từ tập `path` trong receipt, đúng như plan. Nhưng có một lớp phải loại
trừ: `settings.json`, `settings.local.json`, `AGENTS.md`, `CLAUDE.md` nằm **trong** thư mục
mình sở hữu nhưng là đích merge, không phải file mình tạo. Không loại trừ thì mọi cài đặt
lành mạnh đều báo `untracked` — cảnh báo sai đủ nhiều lần thì người dùng ngừng đọc.

### Quét script: hai lỗi thật của tôi, và một giới hạn thật của phân tích tĩnh

Test đỏ đầu tiên bắt được **dương tính giả**: `log_fail "$pkg" "try: sudo apt-get update &&
sudo apt install $pkg"` bị báo là leo thang đặc quyền, trong khi nó chỉ **mô tả** cách sửa
cho người dùng. Sửa bằng cách phân biệt phạm vi khớp: luật nào luôn nằm ở **vị trí lệnh**
(`sudo`, `curl | sh`) chỉ khớp ngoài chuỗi trích dẫn; luật nào khớp **giá trị tham số**
(URL `git+https://`, đường dẫn hệ thống) mới đọc cả phần trong ngoặc.

Cùng cơ chế đó cho ra một kết quả tôi ban đầu tưởng là lỗi: dòng
`echo "  ASN: bash <(curl -sL https://…)"` trong script nguồn **không** bị gắn cờ. Đúng — nó
in hướng dẫn cho người dùng, không thực thi gì. Kỳ vọng ban đầu của tôi mới là sai; test đã
được sửa để khẳng định **cả hai**: dạng in ra không bị gắn cờ, dạng thực thi thì có.

**Giới hạn thật:** `sudo mv "$bin" "$install_dir/$cmd"` — đích là biến, không phân tích tĩnh
nào giải được ở dòng đó. Tiền tố hệ thống chỉ nhìn thấy được ở nơi nó được gán
(`install_dir="${2:-/usr/local/bin}"`), nên finding neo ở đó. Dòng `mv` vẫn được báo — dưới
nhãn leo thang đặc quyền, thứ **thực sự đọc được** tại dòng đó. Ghi nhãn đúng chỗ quan trọng
hơn ghi nhãn đúng ý muốn.

### Fixture: sao chép, không đọc từ máy

Plan nói dùng chính `cti-expert/scripts/install.sh` làm fixture. Script đó nằm ở
`~/.claude/skills/` — ngoài repo, chỉ có trên máy này, và skill đó tới ở phase 11. Test đọc
đường dẫn kiểu đó sẽ hỏng trên CI và nhúng đường dẫn cá nhân vào repo.

Nên các dòng rủi ro được **sao chép nguyên văn** vào
`src/doctor/__fixtures__/risky-install.sh`, có ghi rõ nguồn gốc. Test kín, chạy được trước và
sau khi port. Khi phase 11 mang script thật vào, `av audit scripts` quét nó bằng đúng luật
này — hôm nay lệnh chạy sạch vì kit chưa ship script shell nào (0 script), đúng như mong đợi.

### Kiểm chứng qua CLI thật

Cài vào thư mục tạm → `108 ok`, exit 0. Sửa tay `cook/SKILL.md` → báo đúng một dòng
`modified`, exit 1.

## Risk Assessment

**Bộ lọc mtime bỏ sót file bị sửa giữ nguyên mtime.** Tín hiệu: audit báo `ok` cho file đã
đổi nội dung. Phản ứng: `--strict` hash lại toàn bộ; mặc định giữ bộ lọc cho tốc độ. Phase
10 gọi `--strict` trước khi chạy script.

**`untracked` báo nhầm khi người dùng cố ý thêm file.** Tín hiệu: nhiễu cảnh báo. Phản ứng:
`untracked` là finding mức thông tin, không làm exit khác 0 trừ khi `--strict`.
