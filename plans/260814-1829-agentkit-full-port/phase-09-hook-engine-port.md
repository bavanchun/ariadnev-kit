---
phase: 9
title: "Hook engine port"
status: pending
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

- [ ] 17 hook cài được và bind đúng event **và đúng thứ tự** trên claude-code
- [ ] `notifications/` nằm dưới `_lib/` và mọi file của nó có mặt sau khi cài
- [ ] Không hook nào tham chiếu `ak`, `AGENTKIT_*`, `~/.agentkit`
- [ ] Webhook URL không bao giờ xuất hiện trong JSONL log (test có case lỗi gửi)
- [ ] Đích notification lấy từ user-scope config; project layer đặt không có tác dụng
- [ ] Egress ngoài allowlist bị chặn
- [ ] Hook throw → phiên vẫn chạy
- [ ] Session start trong ngân sách đo được ở bước 1
- [ ] `node --test kit/hooks/**/*.test.cjs` xanh; `av validate` báo 17 hooks
- [ ] Hook `.sh` cài và chạy được (hoặc đã chuyển `.cjs` có ghi lý do)
- [ ] Với mỗi event nguồn, thứ tự binding sau khi cài khớp `hooks.json` gốc (test)

## Risk Assessment

**Mô hình spawn không bao giờ đạt ngân sách hợp lý.** Tín hiệu: bước 1 đo 17 hook no-op
vượt xa mức chấp nhận được. Phản ứng đã chọn: gộp hook cùng event vào một entrypoint —
thay đổi `install-plan.ts`, nằm trong scope phase này.

**Hai bản sanitizer (`.ts` và `.cjs`) trôi khỏi nhau.** Tín hiệu: một bản redact, bản kia
không. Phản ứng: test dùng chung bộ input cho cả hai bản, chạy trong cả hai suite.

**Dịch `hooks.json` làm mất binding im lặng.** Tín hiệu: số binding sau khi cài < 21.
Phản ứng: test đối chiếu số lượng và thứ tự per-event là tiêu chí bắt buộc, không phải
kiểm bằng mắt.
