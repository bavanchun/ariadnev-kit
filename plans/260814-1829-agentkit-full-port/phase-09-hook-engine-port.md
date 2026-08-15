---
phase: 9
title: "Hook engine port"
status: completed
priority: P2
effort: "7d"
dependencies: [8, 10]
---

# Phase 9: Hook engine port

## Overview

Port **17 hook** (15 `.cjs` + 2 `.sh`) + **28 module `_lib`** + 6 file notification. Ba ràng buộc mà bản plan trước
bỏ sót: loader chỉ chấp nhận một file `hook.cjs` mỗi thư mục hook, sanitizer không chạy
trong tiến trình hook, và ngân sách 150ms không đạt được với mô hình một tiến trình `node`
mỗi hook.

## Requirements

Functional:
- 17 hook + 28 module `_lib`, đổi `AGENTKIT_*` → `ARIADNEV_*`.
- Notification (Discord/Slack/Telegram) mặc định tắt; đích **chỉ** lấy từ user-scope config
  (phase 10), không từ project layer, không từ env trần.
- Host allowlist cho egress: `discord.com`, `slack.com`, `api.telegram.org`.
- Payload notification giới hạn: tên event + tên skill. Không command text, không nội dung file.
- Sanitizer chạy được **trong** tiến trình hook.
- `av-config-client.cjs` thay `ak-prefs-client`, đọc config phase 10, không gọi binary ngoài.

Non-functional:
- Hook lỗi không chặn phiên.
- Không hook nào ghi ngoài thư mục ariadnev sở hữu, và không hook nào gửi ra ngoài
  allowlist.
- Ngân sách session start: đo lại theo mô hình binding thật, xem Architecture.

## Architecture

**Dịch `hooks.json`.** Nguồn dùng một file tổng hợp `~/.claude/hooks/hooks.json` (237 dòng)
mô tả **8 event / 21 binding** trên 17 file hook. Cấu trúc: mỗi event có nhiều matcher
group, mỗi group có **danh sách hook theo thứ tự**, mỗi hook có `command` + `args`.

Mô hình của kit là per-hook `hook.json` (`event` | `events[]`, `matcher`, `description`) —
biểu diễn được event và matcher, **nhưng không biểu diễn được**:
- thứ tự trong một matcher group (`Stop` có 3 binding, `UserPromptSubmit` có 6),
- `args` tuỳ biến ngoài đường dẫn hook.

Cần mở rộng `HookManifest` thêm `order?: number` và `args?: string[]`, rồi viết bước dịch
`hooks.json` → 17 file `hook.json` giữ nguyên thứ tự. Không có bước này, hook cài xong chạy
sai thứ tự và một số binding biến mất — mà `av validate` vẫn xanh vì nó chỉ đếm file.

**Bố cục file.** `load-kit.ts:121-133` coi mỗi thư mục không bắt đầu bằng `_` là đúng một
hook cần `hook.cjs` + `hook.json`, ném `KitValidationError` nếu thiếu.
`install-plan.ts:90-96` chỉ ghi một file mỗi hook; `_lib` là cây duy nhất được copy nguyên.
Nên `notifications/` phải nằm **dưới `_lib/`**, không phải thư mục hook ngang hàng.

**Sanitizer trong hook.** `credential-sanitizer.ts` được gắn ở `emit()` của tiến trình CLI
(`index.ts:94`). Hook là tiến trình `.cjs` riêng, không import nó; `_lib` logger append
`JSON.stringify(entry)` thô. Cần bản `.cjs` của sanitizer trong `_lib/`, mọi lời gọi log
đi qua nó.

Sanitizer hiện tại cũng không bắt được secret notification: `SECRET_KEY` khớp tên **env
var** kết thúc `_TOKEN|_KEY|_SECRET|_PASSWORD`, còn webhook Discord/Slack giấu token trong
**path** URL và tên env quy ước kết thúc `_URL`. `URL_USERINFO` chỉ khớp `user:pass@host`.
Phải thêm `_URL`/`_WEBHOOK` vào `SECRET_KEY` và pattern path webhook vào `TOKEN_PATTERNS`.

**Ngân sách.** `install-plan.ts:103` bind hook dạng `node <dest>` — một tiến trình Node
lạnh mỗi hook. 17 tiến trình lạnh là ~0.5-1.5s, không phải 150ms. Ngân sách phải đặt theo
mô hình thật: đo trước, đặt ngưỡng sau, và nếu cần thì gộp hook cùng event vào một
entrypoint thay vì 17 lời gọi riêng.

## Related Code Files

- Create: `kit/hooks/<name>/{hook.json,hook.cjs|hook.sh}` — 11 hook mới (6 đã có)
- Create: `kit/hooks/_lib/notifications/lib/env-loader.cjs`
- Create: `kit/hooks/docs/`, `kit/hooks/_lib/notifications/docs/slack-hook-setup.md`
- Modify: `packages/cli/src/kit/kit-types.ts` — `HookManifest` thêm `order?`, `args?`
- Modify: `packages/cli/src/kit/load-kit.ts` — nhận `hook.sh`
- Create: `packages/cli/scripts/translate-hooks-json.mjs` — dịch `hooks.json` → per-hook
- Create: `kit/hooks/_lib/*.cjs` — 28 module
- Create: `kit/hooks/_lib/sanitizer.cjs` — bản `.cjs` của credential sanitizer
- Create: `kit/hooks/_lib/notifications/{notify,sender,discord,slack,telegram}.cjs`
- Create: `kit/hooks/_lib/av-config-client.cjs`
- Modify: `packages/cli/src/security/credential-sanitizer.ts` — `_URL`/`_WEBHOOK` + pattern
  path webhook (giữ đồng bộ với bản `.cjs`)
- Modify: `kit/hooks/` — 6 hook hiện có, đồng bộ `_lib` mới

## Implementation Steps

1. Đo baseline: session start với 6 hook hiện tại. Rồi đo với 17 hook giả (no-op) để biết
   chi phí thuần của mô hình spawn. Đặt ngân sách theo số đo, ghi vào phase file này.
2. Port `_lib` trước, bắt đầu từ nhóm không phụ thuộc: `bounded-json-file`,
   `private-json-store`, `hook-logger`, `project-detector`.
3. Viết `sanitizer.cjs` + test; định tuyến mọi lời gọi log qua nó. Mở rộng bản `.ts` tương
   ứng và test rằng hai bản redact giống nhau trên cùng bộ input.
4. `av-config-client.cjs` đọc config phase 10 — chỉ đọc lớp user cho khoá nhạy cảm.
5. Dịch `hooks.json` sang 17 `hook.json` giữ thứ tự (`translate-hooks-json.mjs`), rồi port
   hook theo thứ tự rủi ro thấp → cao: quality gate → plan/workflow → session →
   privacy/security → notification. **Nhóm statusline thuộc phase 14, không port ở đây.**
6. Notification dưới `_lib/notifications/`; host allowlist; payload tối thiểu; test bằng
   transport giả, không gọi mạng thật.
7. Nếu bước 1 cho thấy mô hình spawn không đạt ngân sách, gộp hook cùng event vào một
   entrypoint và cập nhật `install-plan.ts` tương ứng.

## Success Criteria

- [x] **14** hook cài được và bind đúng event **và đúng thứ tự** trên claude-code
- [x] `notifications/` nằm dưới `_lib/` và mọi file của nó có mặt sau khi cài
- [x] Không hook nào tham chiếu `ak`, `AGENTKIT_*`, `~/.agentkit` — nay có **cổng CI** săn cả họ định danh upstream
- [x] Webhook URL không bao giờ xuất hiện trong JSONL log (corpus dùng chung cho cả hai bản sanitizer)
- [x] Đích notification lấy từ user-scope config; project layer đặt không có tác dụng (test)
- [x] Egress ngoài allowlist bị chặn ở cả nơi đọc config lẫn nơi gửi
- [x] Hook throw → phiên vẫn chạy (test chạy 14 hook × 3 payload rác)
- [x] Session start **96–109ms** (đo trên cây đã cài), dưới mốc 150ms của plan
- [x] `node --test kit/hooks/**/*.test.cjs` xanh; `av validate` báo **14 hooks**
- [x] Không có hook `.sh` để chuyển — nguồn không ship cái nào (xem "Số liệu sai" bên dưới)
- [x] Thứ tự binding sau khi cài khớp topology nguồn — kiểm bằng test trên bản cài thật

## Risk Assessment

**Mô hình spawn không bao giờ đạt ngân sách hợp lý.** Tín hiệu: bước 1 đo 17 hook no-op
vượt xa mức chấp nhận được. Phản ứng đã chọn: gộp hook cùng event vào một entrypoint —
thay đổi `install-plan.ts`, nằm trong scope phase này.

**Hai bản sanitizer (`.ts` và `.cjs`) trôi khỏi nhau.** Tín hiệu: một bản redact, bản kia
không. Phản ứng: test dùng chung bộ input cho cả hai bản, chạy trong cả hai suite.

**Dịch `hooks.json` làm mất binding im lặng.** Tín hiệu: số binding sau khi cài < 21.
Phản ứng: test đối chiếu số lượng và thứ tự per-event là tiêu chí bắt buộc, không phải
kiểm bằng mắt.


## Kết quả (2026-08-15)

### Số liệu nguồn sai trong plan — đã đo lại

| Hạng mục | Plan ghi | Thực tế | Bằng chứng |
|---|---|---|---|
| Hook | 17 (15 `.cjs` + 2 `.sh`) | **14, toàn `.cjs`** | `hooks.json` chỉ tham chiếu 14 file; backup gốc của AgentKit không có file `.sh` nào |
| Binding | 21 | **19 sau khi gỡ trùng** | `secret-output-guardrail` và `simplify-gate` nằm trong **cả hai** matcher group của `UserPromptSubmit` |
| Module `_lib` | 28 | **18 có thể chạm tới** từ 14 hook | quét bao đóng `require`; 10 module còn lại thuộc statusline (phase 14) |

Ba file trong `~/.claude/hooks/` **không phải của AgentKit**: `typeburn-protect-main.sh`,
`herdr-agent-state.sh`, `usage-limits-refresh.cjs` — chúng do settings riêng của người
dùng bind (`bash "$HOME/..."`), không phải qua `${CLAUDE_PLUGIN_ROOT}` như hooks.json.
Port chúng vào kit sẽ là chép công cụ của tool khác vào sản phẩm này. Audit vòng 2 đếm
file trong thư mục, không đếm file của AgentKit.

Bỏ 2 binding trùng tiết kiệm ~120ms mỗi prompt và không mất hành vi nào — chạy guardrail
hai lần trên cùng một prompt không tạo thêm kết quả gì.

### Ngân sách (bước 1) — đo trên cây đã cài, không phải trong repo

| Event | Số hook | Tốt nhất | Xấu nhất |
|---|---|---|---|
| SessionStart | 1 | 96ms | 109ms |
| PreCompact | 1 | 63ms | 66ms |
| SubagentStop | 1 | 61ms | 67ms |
| SubagentStart | 2 | 138ms | 148ms |
| PreToolUse | 3 | 177ms | 183ms |
| Stop | 3 | 182ms | 189ms |
| UserPromptSubmit | 4 | 242ms | 244ms |
| PostToolUse | 4 | 273ms | 319ms |

Giả định "17 tiến trình lạnh lúc session start" của plan sai: SessionStart chỉ bind **một**
hook. Chi phí thật ~60–70ms/hook, gần như toàn bộ là node khởi động lạnh. Không cần gộp
entrypoint; rủi ro "mô hình spawn không đạt ngân sách" không xảy ra.

### Bốn lỗi thật do test phát hiện, không phải do đọc code

1. **`scout-checker.cjs` require sai đường** (`../scout-block/` trong khi layout mới là
   `./scout-block/`). Hook fail-open nên **im lặng tắt guard**: node_modules không còn bị
   chặn, không có dòng log nào. Nếu chỉ smoke-test "hook chạy không crash" thì lỗi này qua cửa.
2. **`path.dirname(__dirname)` giả định layout cũ.** ariadnev cài sâu hơn một cấp
   (`.claude/hooks/av/`), nên `.claude` bị trỏ nhầm thành `.claude/hooks` → file pattern
   "không tồn tại" → lại fail-open im lặng. Thay bằng `_lib/provider-paths.cjs` dò ngược lên.
3. **`require('../_lib/…')` chỉ đúng ở một trong hai layout.** Kit lồng hook thêm một cấp
   so với bản cài. Dùng lại quy ước dò `_lib` mà 6 hook distill cũ đã dùng.
4. **Hook tự tạo `.logs/` cạnh chính nó**, và loader coi mọi thư mục là hook → `av validate`
   chết vì `hook ".logs": missing hook.cjs`. Loader nay bỏ qua thư mục dấu chấm.

### Chệch có chủ đích so với plan

- **Không tạo `translate-hooks-json.mjs`.** Đây là port một chiều của một phiên bản cố
  định; một script chạy đúng một lần rồi nằm lại là code chết. Thứ bảo vệ thật là test
  đối chiếu topology (8 event / 19 binding, kèm thứ tự và matcher) trên **bản cài thật** —
  rủi ro "dịch làm mất binding im lặng" được chặn ở chỗ đó, không phải ở script.
- **Viết lại `notifications/`, không port.** Bản nguồn gửi `cwd` tuyệt đối, tên project và
  session id tới dịch vụ chat, và lấy đích từ cascade env (`process.env` > `~/.claude/.env`
  > `.claude/.env`) — chính là kênh exfil S3. Bản mới dựng payload theo **allowlist trường**
  (event + tên agent), lấy đích **chỉ** từ config user, và chặn host ở cả hai đầu.
- **`bindings[]` thay vì `order`/`args` rời.** `events[] + matcher` không diễn tả nổi một
  hook cần matcher trên PostToolUse và không matcher trên UserPromptSubmit — plan không
  nêu ràng buộc này. `order` và `args` nằm trong cùng cấu trúc đó.
- **`hooks.<name>` chốt luôn ở phase này**, không hoãn: 14 hook đã gọi `isHookEnabled`, nên
  không khai field nghĩa là tính năng im lặng không chạy. User-only, có test đối chiếu
  danh sách hook thật.

### Đã kiểm bằng chạy thật

Cài vào HOME cô lập → `doctor` **healthy, 141 file**; chạy chính bản đã cài: privacy-block
chặn `.env` (exit 2), scout-block chặn `node_modules`, `hooks.privacy-block: false` trong
config user tắt được guard, đặt trong config project thì **không**.

### Nợ chuyển tiếp

- 10 module `_lib` nhóm statusline chưa port → phase 14 (đã có consumer ở đó).
- `.ariadnev-runtime.json` marker: installer chưa ghi, `runtime-state-identity` rơi về
  fallback. Vô hại khi chỉ cài claude-code; xem lại nếu hook mở sang provider khác.
- `av plan --help` xuất hiện trong 2 chuỗi hướng dẫn — lệnh đó tới ở phase 13.
