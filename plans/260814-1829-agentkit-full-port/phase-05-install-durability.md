---
phase: 5
title: "Install bền: crash boundary + backup không đụng độ"
status: completed
completed: 2026-08-14
priority: P1
effort: "2d"
dependencies: [2]
---

# Phase 5: Install bền

## Overview

Hai lỗi đang tồn tại trong repo hôm nay, chưa lộ vì kit mới có 26 skill. Port lên 103 skill
/ 1511 file sẽ biến chúng thành mất dữ liệu thật. Phải sửa **trước** khi ghi đè hàng loạt.

## Requirements

Functional:
- Backup khôi phục được **từng file**, không gộp theo `kind/basename`.
- Crash giữa install để lại đủ thông tin để `av uninstall` dọn đúng những gì đã ghi.
- `av uninstall` không được báo thành công khi không có bản ghi để dọn.

Non-functional:
- Không tạo file state song song với receipt — mở rộng receipt, không dựng manifest thứ hai.

## Architecture

**Backup collision.** `backup.ts:35` tính `relPath = join(label, basename(target))` với
`label` là **kind**, không phải artifact. `install-plan.ts:26` sinh một op mỗi *file* với
`kind: "skill"` → toàn bộ 103 `SKILL.md` map về `skill/SKILL.md`; dòng `:38` `rmSync(dest)`
xoá bản trước, dòng `:41` manifest filter trùng relPath. Kết quả: 1511 file ghi đè để lại
vài chục entry backup.

Sửa: relPath là đường dẫn đích tương đối scope root — không đụng độ theo cấu trúc.

**Crash boundary.** `install-execute.ts:50-69` không có try/catch; receipt ghi một lần ở
`:112` sau toàn bộ vòng lặp. Throw ở file 1200/1511 → không receipt.
`uninstall-plan.ts:75-76` thấy provider undefined thì trả `[]` và báo thành công.

Sửa: ghi **intent journal** trước write đầu tiên (danh sách dest đã hoạch định), finalize
thành receipt sau khi xong. Uninstall đọc journal khi không có receipt. Journal là bản ghi
tạm của một lần chạy, không phải ownership record song song — nó bị xoá khi finalize.

## Related Code Files

- Modify: `packages/cli/src/install/backup.ts` — relPath theo dest tương đối scope root
- Modify: `packages/cli/src/install/backup.test.ts` — case nhiều file cùng basename
- Create: `packages/cli/src/install/intent-journal.ts` — ghi/đọc/xoá journal
- Create: `packages/cli/src/install/intent-journal.test.ts`
- Modify: `packages/cli/src/install/install-execute.ts` — journal trước vòng lặp, finalize sau
- Modify: `packages/cli/src/uninstall/uninstall-plan.ts` — fallback sang journal; không
  báo thành công khi không có bản ghi nào
- Modify: `packages/cli/src/install/install-receipt.ts` — thêm `skill_selection`
  (`mode`, `skills[]`, `selected_count`, `total_count`) vào `ReceiptInstall`

## Implementation Steps

1. Test đỏ: cài fixture có 3 skill cùng chứa `SKILL.md`, ghi đè lần hai, khẳng định backup
   manifest có **3** entry và restore trả đúng nội dung cũ của từng file.
2. Sửa `backupPath` dùng dest tương đối scope root; giữ `label` cho phân loại hiển thị.
3. Test đỏ: mô phỏng throw ở op thứ N, khẳng định uninstall sau đó gỡ đúng N file.
4. Viết `intent-journal.ts`; nối vào `install-execute.ts` trước write đầu tiên, xoá khi
   finalize receipt thành công.
5. Sửa `uninstall-plan.ts`: không có receipt thì đọc journal; không có cả hai thì báo
   "không có bản ghi cài đặt" chứ không phải thành công rỗng.
6. Thêm `skill_selection` vào `ReceiptInstall` (phase 6 và 13 cần).

## Success Criteria

- [x] Ghi đè N file → backup manifest có đúng N entry, restore đúng nội dung từng file
- [x] 103 skill cùng tên `SKILL.md` không đụng độ đường dẫn backup
- [x] Giết tiến trình ở op thứ N → `av uninstall` gỡ đúng N file đã ghi
- [x] Không receipt và không journal → uninstall báo lỗi rõ, không báo thành công rỗng
- [x] Journal bị xoá sau khi finalize; không để lại rác
- [x] `ReceiptInstall` mang `skillSelection` (camelCase — xem ghi chú bên dưới)
- [x] `pnpm test` xanh — 754 vitest + 104 node:test

## Kết quả thực thi (2026-08-14)

### Backup: một slot cho mỗi file

Test đỏ trước xác nhận đúng chẩn đoán: 3 skill cùng có `SKILL.md` → manifest chỉ còn **1**
entry, hai bản backup đầu bị chính bản sau ghi đè. `relPath` giờ soi theo cấu trúc thư mục
của chính target, nên hai file không thể chung slot. `label` vẫn còn nhưng chỉ để phân loại
hiển thị — nó không tham gia vào đường dẫn nữa, nên không thể gây đụng độ.

**Một trường hợp plan chưa tính tới:** không phải target nào cũng nằm dưới scope root. Cài
scope `project` vẫn ghi vào thư mục provider ở home (codex → `~/.agents`), nên
"đường dẫn tương đối scope root" sẽ thành `../../…`. Những target đó đi vào nhánh `abs/`
giữ nguyên hình dạng đường dẫn đầy đủ. Có test riêng cho trường hợp này.

Tương thích ngược tự nhiên: `relPath` được lưu **trong** manifest, nên `backups restore` đọc
bản cũ (`label/basename`) và bản mới bằng đúng một nhánh code — không cần đọc hai layout.

### Crash boundary: journal

`installKit` giờ hoạch định **toàn bộ** provider trước khi ghi byte đầu tiên, để journal kể
được hết đích dự kiến. Hoạch định là thuần, nên lỗi ở bước này không chạm đĩa.

Test mô phỏng crash bằng lỗi thật chứ không mock: đặt một **file** thường ở đúng chỗ thư mục
skill cần nằm → write đó ném `ENOTDIR`, đúng như tiến trình bị giết giữa chừng. Sau đó
`uninstall` gỡ đúng tập file đã kịp ghi, và không báo gỡ file chưa từng được ghi.

**Journal không kiểm hash — và đó là điều phải nói thẳng.** Nó ghi *ý định*, không ghi *kết
quả*: đường dẫn có thể chưa từng được ghi, và cái đã ghi thì không có hash. Nên đường phục
hồi không phân biệt được file nguyên vẹn với file người dùng vừa sửa — khác hẳn đường
receipt. Chấp nhận được vì nó chỉ phủ đúng một lần chạy bị ngắt; sẽ **không** chấp nhận được
nếu dùng cho uninstall thường.

Đích merge (`AGENTS.md`, `settings.json`) không bao giờ bị xoá khi phục hồi: install sửa tại
chỗ chứ không tạo ra chúng, xoá đi là phá nội dung chưa bao giờ thuộc về mình.

### Một contract bị đảo có chủ ý

Test `reports nothing-to-do when no receipt exists` khẳng định đúng cái hành vi mà C5 gọi là
lỗi: uninstall báo "nothing to do", exit 0 — không phân biệt được với dọn dẹp thành công, và
đó chính xác là thứ một install bị giết trước khi ghi receipt tạo ra. Đã đảo thành lỗi có
thông báo rõ, kèm tên thư mục đã tìm và gợi ý `--global` cho trường hợp nhầm scope. Lý do
được viết ngay trong test, không đảo lặng lẽ.

### Ghi chú: `skillSelection` camelCase

Plan viết `skill_selection` với `selected_count`/`total_count`. Đã đặt là `skillSelection` /
`selectedCount` / `totalCount` cho khớp phần còn lại của receipt (`schemaVersion`,
`agentsMdManaged`, `hookBindings`). Receipt là schema của riêng dự án này, không phải giao
diện phải khớp bên ngoài, nên nhất quán trong file thắng cách viết trong plan.

`schemaVersion` **không** bump: đây là field optional thêm vào: bump lên 3 sẽ khiến bản
ariadnev cũ từ chối receipt mới, tệ hơn hẳn so với việc bản cũ bỏ qua một field nó không
biết.

## Risk Assessment

**Journal trở thành bản ghi ownership thứ hai — đúng thứ phase này muốn tránh.** Tín hiệu:
có code đọc journal ngoài đường phục hồi crash. Phản ứng: journal chỉ tồn tại giữa write
đầu tiên và finalize; nếu thấy nhu cầu đọc nó ở nơi khác, đó là dấu hiệu thiếu field trong
receipt — thêm vào receipt, không mở rộng journal.

**Đổi relPath backup phá tương thích với backup cũ đã có trên máy.** Tín hiệu: `av backups
restore` trên bản backup tạo trước phase này. Phản ứng: đọc được cả hai layout (manifest cũ
có `label`, mới có dest tương đối); chỉ ghi theo layout mới.
