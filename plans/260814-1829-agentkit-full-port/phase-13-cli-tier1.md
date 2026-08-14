---
phase: 13
title: "CLI Tier-1 + cây subcommand"
status: pending
priority: P2
effort: "4d"
dependencies: [6, 7]
---

# Phase 13: CLI Tier-1

## Overview

Bổ sung nhóm lệnh Tier-1 và cung cấp lệnh thay thế cho 7 skill từng phụ thuộc binary `ak`
(phase 12 bước 7 phụ thuộc phase này). Hai cái bẫy bản plan trước dính: retrofit exit code
lên `doctor` phá hợp đồng CI đã có, và nạp chồng ngữ nghĩa lên `av run` vốn đã là command
group.

## Requirements

Functional:
- Nối `av audit` (phase 6) và `av skill *` (phase 7) vào CLI.
- `av mcp {add,link,list,remove,show,verify}`.
- `av kit {install-path,refresh,repair-install-mode}` — **không** `av kit validate`, nó
  trùng `av validate` đã có ở top level.
- `av plan {use,show}` và `av config prefs resolve --json` — hợp đồng 7 skill cần.
  `config` do **phase 10** sở hữu; phase này chỉ dùng, không định nghĩa lại.
- `av skill run <name> [script]` — chạy script của skill qua venv (phase 7). **Không**
  nạp chồng lên `av run`.
- Exit code mới **chỉ áp cho lệnh mới**.

Non-functional:
- 16 lệnh hiện có không đổi hành vi, kể cả exit code.
- Mọi lệnh có `--json` trả envelope `{schema_version, kind, data}`.

## Architecture

**Vì sao không đụng exit code của `doctor`.** `doctor-command.ts:151-153` map
`healthy→0 | degraded→1 | unhealthy→2`, và `audit-score.ts:1-4` ghi rõ đây là **CI
contract** được giữ có chủ đích. Bảng exit code mới gán `2 = bad flags`; retrofit lên
doctor sẽ biến "cài đặt hỏng" thành "sai cờ" trong mọi job CI đang gate trên đó. Lệnh mới
dùng bảng mới; doctor giữ nguyên; ghi sự khác biệt vào README.

**Vì sao không nạp chồng `av run`.** `register-harness-commands.ts:192-243` đã đăng ký
`run` với `[workflow]`, `--run-id`, và subcommand `resume`/`status`/`cancel`. Nạp thêm
nghĩa skill vào đó khiến skill tên `status`/`resume`/`cancel` vĩnh viễn không gọi được
(Commander route sang subcommand), và flag workflow-only không có nghĩa với skill. Dùng
`av skill run` — vừa tránh đụng độ, vừa nằm đúng nhóm `av skill` phase 7 đã tạo.

Ngoài ra: repo **chưa có skill runner nào**. "Chạy skill" nghĩa là gì phải định nghĩa cụ
thể trước khi chốt bề mặt lệnh — ở đây là "chạy script trong `scripts/` của skill bằng
interpreter đúng", không phải "thực thi SKILL.md".

## Related Code Files

- Create: `packages/cli/src/cli/register-mcp-commands.ts`
- Create: `packages/cli/src/cli/register-plan-commands.ts`
- Create: `packages/cli/src/cli/exit-codes.ts` — hằng số cho **lệnh mới**
- Create: `packages/cli/src/mcp/` — đọc/ghi cấu hình MCP
- Modify: `packages/cli/src/cli/register-install-commands.ts` — nhóm `kit`
- Modify: `packages/cli/src/cli/contract-command.ts` — `KNOWN_COMMANDS` + `CAPABILITIES`
  cho mọi lệnh mới; cân nhắc bump `PROTOCOL_VERSION` nếu envelope đổi
- Modify: `packages/cli/src/index.ts`
- Modify: `README.md` — bảng lệnh, ghi rõ ngoại lệ exit code của `doctor`

## Implementation Steps

1. `exit-codes.ts` + test. Áp **chỉ** cho lệnh mới. Thêm test hồi quy khẳng định
   `doctor` vẫn trả 0/1/2 theo ngữ nghĩa cũ.
2. Nối `audit` và `skill *` vào CLI kèm `--json`.
3. `av plan use/show`; dùng `av config prefs resolve --json` của phase 10 (không định nghĩa lại).
4. `av mcp` — đọc/ghi `.mcp.json` và settings provider; `verify` kiểm stdio handshake.
5. `av kit {install-path,refresh,repair-install-mode}`.
6. `av skill run <name> [script]` — phân giải script trong skill, chạy qua venv phase 7.
7. Cập nhật `contract-command.ts` cho mọi lệnh mới; chạy drift test.
8. README: bảng lệnh + ghi chú exit code `doctor` là ngoại lệ có chủ đích.

## Success Criteria

- [ ] `av doctor` vẫn trả 0/1/2 theo ngữ nghĩa cũ — test hồi quy chứng minh
- [ ] Lệnh mới dùng bảng exit code mới; khác biệt ghi trong README
- [ ] Không tồn tại `av kit validate`
- [ ] `av run` không đổi hành vi; skill tên `status`/`resume`/`cancel` gọi được qua `av skill run`
- [ ] `av skill run` chạy được script thật của 3 skill mẫu qua đúng venv
- [ ] `av mcp verify` phát hiện server hỏng handshake
- [ ] `contract --json` liệt kê mọi lệnh mới; drift test xanh
- [ ] 16 lệnh cũ không đổi hành vi (test hồi quy)
- [ ] `pnpm test` xanh

## Risk Assessment

**Retrofit exit code lọt vào doctor do sơ ý.** Tín hiệu: test hồi quy bước 1 đỏ. Phản ứng:
đó chính là mục đích của test — không sửa test, sửa code.

**Nhóm lệnh phình làm file đăng ký vượt 200 LOC.** Tín hiệu: `register-harness-commands.ts`
đã 247 dòng trước phase này. Phản ứng: tách theo nhóm subcommand, mỗi nhóm một file. Lưu ý
quy tắc <200 LOC hiện **không có lint gate** nào enforce và 17 file production đã vượt —
đừng dùng nó làm tripwire, dùng nó làm hướng dẫn tách file.
