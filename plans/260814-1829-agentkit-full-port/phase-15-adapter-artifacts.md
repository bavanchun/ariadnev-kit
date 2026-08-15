---
phase: 15
title: "Artifact adapter sinh từ receipt"
status: completed
priority: P2
effort: "4d"
dependencies: [6]
---

# Phase 15: Artifact adapter sinh từ receipt

## Overview

Nguồn ghi 5 loại artifact vào cây adapter để theo dõi thứ nó sở hữu trong provider tree và
phát hiện drift: `install-manifest.json`, `native-skill-paths.json`,
`native-skill-hashes.json`, `native-hook-expectations.json`, và `{codex,cursor}-ownership.json`.

Quyết định 2026-08-14: **port đầy đủ cho giống nguồn.**

## Ràng buộc thiết kế bắt buộc

Red-team vòng 1 xếp Critical (C2) đúng vấn đề này: hai bản ghi ownership song song không có
trọng tài sẽ lệch nhau và làm `audit` với `uninstall` bất đồng.

**Giải: receipt là nguồn sự thật duy nhất. Năm artifact trên là output phái sinh, sinh ra
từ receipt sau khi install hoàn tất.** Không có đường nào ghi vào chúng độc lập; không có
đường nào đọc chúng để ra quyết định. Lệch nhau là bất khả vì chỉ có một nơi ghi.

Vai trò của chúng: tương thích định dạng với nguồn, và cho phép công cụ ngoài đọc. Không
phải cơ chế nội bộ của ariadnev.

## Requirements

Functional:
- Sinh 5 artifact từ `Receipt` sau mỗi install thành công, ghi vào cây adapter
  `~/.ariadnev/adapters/<provider>/`.
- `install-manifest.json`: `version`, `kit`, `kit_version`, `files[] {rel_path, sha256}`,
  `skill_selection {mode, skills[], selected_count, total_count}` — khớp schema nguồn.
- `native-skill-paths.json`: danh sách đường dẫn cài.
- `native-skill-hashes.json`: SHA256 từng file.
- `native-hook-expectations.json`: event graph + matcher + thứ tự (lấy từ phase 9).
- `<provider>-ownership.json`: cây artifact adapter sở hữu.
- Lệnh `av adapters regenerate` sinh lại từ receipt hiện có (khi file bị xoá hoặc lệch).

Non-functional:
- **Không** đọc 5 file này ở bất kỳ đường quyết định nào. Chúng là output, không phải input.
- Sinh xong phải deterministic: cùng receipt → cùng byte.
- Ownership registry của nguồn nặng 337K (cursor); lưu dạng cây nén theo prefix nếu vượt 500K.

## Architecture

```
install-execute  →  Receipt (nguồn sự thật)
                        │
                        └─→ adapter-artifacts.ts (pure)
                              ├─ install-manifest.json
                              ├─ native-skill-paths.json
                              ├─ native-skill-hashes.json
                              ├─ native-hook-expectations.json
                              └─ <provider>-ownership.json
```

Hàm sinh là pure: `Receipt` + `KitMeta` → `Record<filename, content>`. Lớp ghi tách riêng.
Điều này cho phép test toàn bộ mà không đụng fs, và làm rõ rằng không có luồng ngược.

`native-hook-expectations` cần thứ tự binding — lấy từ mô hình `hook.json` mở rộng ở phase 9
(`order`, `args`). Nếu phase 9 chưa có thì phase này chặn.

## Related Code Files

- Create: `packages/cli/src/adapters/adapter-artifacts.ts` — sinh, pure
- Create: `packages/cli/src/adapters/adapter-artifacts.test.ts`
- Create: `packages/cli/src/adapters/write-adapter-artifacts.ts` — lớp ghi atomic
- Create: `packages/cli/src/cli/register-adapter-commands.ts` — `av adapters regenerate`
- Modify: `packages/cli/src/install/install-execute.ts` — gọi sau khi finalize receipt
- Modify: `packages/cli/src/cli/contract-command.ts` — `adapters` vào `KNOWN_COMMANDS`
- Modify: `packages/cli/src/adapt/paths.ts` — đường dẫn cây adapter

## Implementation Steps

1. Đọc 5 file mẫu ở `~/.agentkit/adapters/claude-code/engineer/.agentkit/` và ghi lại schema
   chính xác từng file vào phase file này trước khi code.
2. Test đỏ `adapter-artifacts.ts`: một `Receipt` fixture → 5 output đúng schema, deterministic.
3. Viết hàm sinh pure; hash lấy thẳng từ `ReceiptFile.sha256`, không tính lại.
4. Lớp ghi atomic vào `~/.ariadnev/adapters/<provider>/`.
5. Nối vào `install-execute` sau khi receipt finalize (phase 5 đã có điểm này).
6. `av adapters regenerate`; test rằng xoá file rồi regenerate cho kết quả byte-identical.
7. Đo kích thước ownership registry trên kit đầy đủ; vượt 500K thì nén theo prefix.

## Success Criteria

- [x] 5 artifact đúng schema nguồn — đối chiếu từng field với file mẫu (bảng bên dưới)
- [x] Hàm sinh pure, không fs; lớp ghi tách riêng
- [x] Không code nào **đọc** chúng để quyết định — **gate là test**, quét
      `install/`, `uninstall/`, `doctor/`, `kit/`, `providers/`, không phải quy ước
- [x] Cùng receipt → cùng byte
- [x] Xoá artifact rồi `adapters regenerate` → **byte-identical** (kiểm bằng `diff` thật)
- [ ] Ownership registry **504K**, vượt ngưỡng 500K — **không nén**, lý do bên dưới
- [x] `audit` và `uninstall` vẫn chỉ đọc receipt
- [x] `pnpm test` xanh (1006 test)

## Bước 1 — schema nguồn, đọc từ file thật

| File | Schema |
|---|---|
| `install-manifest.json` | `{version:1, kit, kit_version, files:[{rel_path, sha256}], skill_selection:{mode, skills[], selected_count, total_count}}` |
| `native-skill-paths.json` | mảng phẳng đường dẫn **tuyệt đối** (nguồn: 1515 mục) |
| `native-skill-hashes.json` | `{<đường dẫn tuyệt đối>: sha256}` |
| `native-hook-expectations.json` | `{version:1, kit, manifest:{hooks:{<event>:[{matcher?, hooks:[{type,command,args[]}]}]}}}` |
| `<provider>-ownership.json` | `{paths[], path_hashes{}, hook_ids[]}` (codex nguồn: 10K, không phải 337K) |

## Ngưỡng 500K — xem lại có số đo

Đo trên bản cài đủ kit: ownership **504K** (paths 200K + path_hashes 300K, cùng 1514 đường
dẫn tuyệt đối lặp hai lần).

Phản ứng đã định sẵn là "nén theo prefix". **Không làm**, và đây là lý do có bằng chứng chứ
không phải bỏ qua: mục đích duy nhất của 5 file này là **tương thích định dạng nguồn**. Nén
prefix (hoặc bỏ `paths` vì nó bằng `Object.keys(path_hashes)`) đều đổi bố cục field — tức là
đánh đổi đúng cái thứ chúng tồn tại để làm, lấy 200K trên một file cục bộ ghi một lần mỗi
lần cài. 504K không phải vấn đề; **tăng không giới hạn** mới là. Nên thay vì nén, có test
chặn ở mức thật sự đáng lo (2MB cho cả 5 file với 1600 file cài).

Nếu sau này con số leo thang thật, nén là câu trả lời — và khi đó đổi định dạng là đánh đổi
có lý do, không phải phản xạ theo một ngưỡng đặt trước khi có số.

## Kết quả (2026-08-15)

Hướng một chiều là điều duy nhất khiến thiết kế này không tái lập lỗi C2 (hai bản ghi
ownership lệch nhau). Nó được giữ bằng **ba thứ cụ thể**, không phải bằng lời:

1. Chữ ký hàm là `Receipt → Record<filename, content>`: không có fs, nên không có đường
   ngược nào để viết nhầm.
2. Hash lấy thẳng từ `ReceiptFile.sha256`, **không tính lại** — tính lại là ý kiến thứ hai
   về cùng bộ file, và đó chính là cách hai bản ghi bắt đầu lệch.
3. Một test quét source: bất kỳ file nào trong `install/`, `uninstall/`, `doctor/`, `kit/`,
   `providers/` import `adapter-artifacts` là đỏ.

`adapters regenerate` là **sửa chữa, không phải hoà giải**: vì hàm sinh deterministic, thứ
nó ghi luôn byte-identical với thứ install đã ghi. Sửa một artifact bằng tay rồi regenerate
thì bản sửa bị ghi đè và lệnh nói rõ "1 rewritten" — đúng ngữ nghĩa của một projection.

Ghi artifact là **best-effort**: một lần cài thành công không bị gọi là thất bại chỉ vì bản
chiếu của nó không ghi được.

## Risk Assessment

**Ai đó về sau đọc adapter artifact để ra quyết định, tái lập lỗi hai nguồn sự thật.** Tín
hiệu: grep thấy import từ `adapters/` trong `install/`, `uninstall/`, hoặc `doctor/`. Phản
ứng: tiêu chí "không code nào đọc" là gate grep chạy trong CI, không phải quy ước.

**Schema nguồn có field mà receipt không đủ dữ liệu để điền.** Tín hiệu: bước 2 phát hiện
field không map được. Phản ứng: mở rộng `Receipt` để chứa dữ liệu đó — không dựng nguồn thứ
hai để lấp. Nếu field thuần trang trí thì bỏ và ghi lý do.
