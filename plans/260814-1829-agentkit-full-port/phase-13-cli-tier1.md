---
phase: 13
title: "CLI Tier-1 + cây subcommand"
status: completed
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

- [x] `av doctor` vẫn trả 0/1/2 theo ngữ nghĩa cũ — test đọc thẳng source, và
      `LEGACY_EXIT_COMMANDS` bắt mọi lệnh cũ phải là quyết định mới được đổi
- [x] Lệnh mới dùng bảng mới (0/1/2/3); entrypoint nay tôn trọng `exitCode` của error
      thay vì gộp mọi lỗi thành 1; khác biệt ghi trong README
- [x] Không tồn tại `av kit validate`
- [x] `av run` không đổi hành vi; `av skill run` là bề mặt riêng
- [x] `av skill run` đã có từ phase 7, chạy thật trên script Python
- [x] `av mcp verify` phát hiện server hỏng handshake — có test **spawn tiến trình thật**
- [x] `contract --json` liệt kê `plan`, `kit`, `mcp`; drift test xanh
- [x] Lệnh cũ không đổi hành vi (suite đầy đủ xanh)
- [x] `pnpm test` xanh (977 test)

## Risk Assessment

**Retrofit exit code lọt vào doctor do sơ ý.** Tín hiệu: test hồi quy bước 1 đỏ. Phản ứng:
đó chính là mục đích của test — không sửa test, sửa code.

**Nhóm lệnh phình làm file đăng ký vượt 200 LOC.** Tín hiệu: `register-harness-commands.ts`
đã 247 dòng trước phase này. Phản ứng: tách theo nhóm subcommand, mỗi nhóm một file. Lưu ý
quy tắc <200 LOC hiện **không có lint gate** nào enforce và 17 file production đã vượt —
đừng dùng nó làm tripwire, dùng nó làm hướng dẫn tách file.


## Kết quả (2026-08-15)

### Nhu cầu thật của skill khác hẳn scope phase

Đếm lời gọi CLI trong 103 skill nguồn:

| Nhóm | Lần gọi | Subcommand khác nhau |
|---|---|---|
| `plan` | ~90 | ~20 (create, update, close, check, uncheck, phase, archive, cleanup, reindex, list, search, kanban, publish, validate, migrate, parse, resolve, status, use, show) |
| `journal` | 22 | 4 (create, list, show, validate) |
| `config prefs` | 13 | — (đã có ở phase 10) |
| `kit` | 8 | validate, list-kits, init, refresh |
| `skill` | 7 | verify, install, upgrade, repair, remove (đã có ở phase 7) |
| `mcp` | 6 | add, link, list, remove, show, verify |

Phase này scope `plan {use, show}`. **Chênh lệch là thật và chưa được lấp**: skill port ở
phase 12 sẽ tham chiếu ~18 subcommand `plan` và 4 subcommand `journal` không tồn tại.

Không dựng stub. Một subcommand có mặt mà không làm gì tệ hơn một subcommand vắng mặt —
cái vắng mặt báo lỗi ngay, cái stub báo thành công rồi để người dùng tự phát hiện sau.
Quyết định mở rộng (dựng nguyên bộ quản lý plan + journal, hay chấp nhận skill tham chiếu
lệnh không có) thuộc về người dùng, ghi lại ở đây để quyết ở phase 12/16.

### Ba thứ bỏ có lý do, không phải bỏ sót

- **`av kit repair-install-mode`** — sửa lựa chọn "install mode" mà CLI này không có: một
  đường dẫn cho mỗi ô (provider, artifact), do bảng verify quyết. Port nó nghĩa là phát
  minh ra khái niệm để đi sửa, và bản trung thực của nó sẽ in "không có gì để sửa" mãi mãi.
- **`av kit validate`** — trùng `av validate` đã có ở top level. Hai cách gọi một việc là
  cách chúng trôi khỏi nhau.
- **`av mcp link`** — copy định nghĩa server giữa provider, cần đường dẫn config MCP đã
  verify cho từng provider. Luật của repo: ô chưa verify thì skip, không đoán.

### Exit code: sửa một lỗ thật

Bảng mới vô nghĩa nếu entrypoint gộp mọi lỗi thành `exit 1` — mà nó đang làm đúng thế.
Nay error nào tự khai `exitCode` thì được tôn trọng; còn lại vẫn là 1. Kiểm bằng chạy thật:
`kit install-path nope` → 2, `doctor` không receipt → 2 theo **ngữ nghĩa cũ** (unhealthy),
`mcp verify` server hỏng → 1.

### Một nguồn đường dẫn, ba chỗ đọc

`kit install-path` cần đường dẫn thật (home/cwd thật), `contract`/README cần template có
placeholder. Thay vì viết hai lần, tách `targetPathFor(id, kind, ctx)`; `targetTemplate`
nay chỉ là chính nó chạy dưới sentinel root. Installer, matrix, contract và lệnh mới không
thể bất đồng về một đường dẫn nữa.

### `av mcp` ghi vào file không thuộc về mình

`.mcp.json` là của repo, `~/.claude.json` là của người dùng và chứa rất nhiều thứ không
liên quan. Nên: ghi atomic, backup trước, và **giữ nguyên mọi khoá không hiểu** — có test
khẳng định `numStartups` và `tipsHistory` còn nguyên sau khi thêm server. Mặc định là scope
project; chỉ `--global` mới chạm vào file của người dùng. `mcp show` in **tên** biến env,
không in giá trị: đó là chỗ API key nằm.

`verify` có test spawn tiến trình thật — một verify không bao giờ khởi động cái gì vẫn qua
được mọi test dùng fake.
