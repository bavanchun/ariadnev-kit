---
phase: 15
title: "Artifact adapter sinh từ receipt"
status: pending
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

- [ ] 5 artifact sinh đúng schema nguồn, đối chiếu với file mẫu ở bước 1
- [ ] Hàm sinh là pure, không fs, coverage ≥ 90%
- [ ] Không code nào **đọc** 5 file này để ra quyết định (grep chứng minh)
- [ ] Cùng receipt → cùng byte (test deterministic)
- [ ] Xoá artifact rồi `av adapters regenerate` → byte-identical
- [ ] Ownership registry ≤ 500K hoặc đã nén
- [ ] `av audit` và `av uninstall` vẫn chỉ đọc receipt, không đọc adapter artifact
- [ ] `pnpm test` xanh

## Risk Assessment

**Ai đó về sau đọc adapter artifact để ra quyết định, tái lập lỗi hai nguồn sự thật.** Tín
hiệu: grep thấy import từ `adapters/` trong `install/`, `uninstall/`, hoặc `doctor/`. Phản
ứng: tiêu chí "không code nào đọc" là gate grep chạy trong CI, không phải quy ước.

**Schema nguồn có field mà receipt không đủ dữ liệu để điền.** Tín hiệu: bước 2 phát hiện
field không map được. Phản ứng: mở rộng `Receipt` để chứa dữ liệu đó — không dựng nguồn thứ
hai để lấp. Nếu field thuần trang trí thì bỏ và ghi lý do.
