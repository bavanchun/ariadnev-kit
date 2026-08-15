---
phase: 10
title: "User config schema (tách quyền project/user)"
status: completed
priority: P2
effort: "3d"
dependencies: [2]
---

# Phase 10: User config schema

## Overview

Bản plan trước đặt cascade `project > user > default` cho một schema chứa `privacyBlock` và
`trust.*`. Đó là đảo ngược đúng biện pháp bảo mật repo này đã thiết lập và ghi thành lời
trong `env-scope.ts`. Phase này giữ config schema nhưng chia quyền theo lớp.

## Requirements

Functional:
- Hai lớp khoá, tách bằng cấu trúc chứ không bằng quy ước:
  - **Project-overridable**: `paths.{docs,plans}`, `locale.*`, `plan.*`, `docs.maxLoc`,
    `project.{type,packageManager,framework}`, `statusline`.
  - **User-only**: `privacyBlock`, `trust.enabled`, `assertions[]`, đích notification,
    chính sách thực thi script.
- Project layer đặt khoá user-only → reject khi load kèm cảnh báo nêu tên khoá và file.
- `av config prefs resolve --json` — hợp đồng ổn định mà hook phase 9 gọi.
- Validate bằng ajv; config hỏng → mặc định + cảnh báo, không chết phiên.
- Xuất `schemas/av-config.schema.json` cho editor.

Non-functional:
- **Không** có `trust.passphrase` trong schema. Xem Architecture.
- `resolve --json` không được in giá trị nhạy cảm.

## Architecture

**Vì sao tách lớp.** `env-scope.ts:3-11` ghi rõ: "vcskill's own config is owned by the
user's shell, never by a project file … This is a security control, so it fails toward
stripping". Nếu `.vc/config.json` trong repo clone về đặt được `privacyBlock: false` thì
hook chặn `.env`/secrets tắt im lặng. Tách lớp phải là cấu trúc — hàm resolve nhận project
layer đã lọc, không phải merge rồi mới kiểm.

**Vì sao bỏ `passphrase`.** Nguồn có `trust.passphrase`. Đặt secret plaintext vào file
config rồi định nghĩa `resolve --json` in ra toàn bộ config đã phân giải là đường rò thẳng
vào stdout hook và transcript. `credential-sanitizer.ts:23,33-39` không cứu được: nó lặp
`process.env` và khớp theo **tên env var**, không đọc nội dung config. Giữ `trust.enabled`;
nếu về sau cần secret thật thì lưu hash có salt, file mode 0600, và `resolve --json` phải
bỏ nguyên nhánh `trust` khỏi output.

**Không port** `watch.*` và `content.*` — thuộc Tier-3 đã loại ở non-goals.

## Related Code Files

- Create: `packages/cli/src/config/config-schema.ts` — định nghĩa + phân lớp khoá
- Create: `packages/cli/src/config/resolve-config.ts` — cascade thuần, nhận project layer đã lọc
- Create: `packages/cli/src/config/filter-project-layer.ts` — loại khoá user-only
- Create: test cho cả ba file trên
- Create: `packages/cli/src/config/load-config.ts` — đọc file, validate ajv
- Create: `packages/cli/src/cli/register-config-commands.ts`
- Create: `schemas/av-config.schema.json`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/cli/contract-command.ts` — `config` vào `KNOWN_COMMANDS`

## Implementation Steps

0. Đọc `~/.agentkit/adapters/*/engineer/.agentkit/schemas/ck-config.schema.json` (19K) và
   `~/.agentkit/config.yaml` trước khi thiết kế — lập bảng ánh xạ khoá nguồn → khoá ariadnev,
   ghi rõ khoá nào bỏ (nhóm Tier-3 `watch.*`, `content.*`) và khoá nào thuộc lớp user-only.
1. Test đỏ `filter-project-layer.ts`: project layer đặt `privacyBlock: false` → bị loại +
   cảnh báo nêu tên khoá và đường dẫn file.
2. Test đỏ `resolve-config.ts`: cascade 3 lớp, giá trị thiếu, sai kiểu.
3. Định nghĩa schema với phân lớp khoá là một phần của type, không phải danh sách rời.
4. `load-config.ts` + ajv; hỏng → mặc định + cảnh báo.
5. `av config prefs resolve --json`; khẳng định output không chứa nhánh nhạy cảm nào.
6. Xuất JSON Schema trong bước build; test đối chiếu với định nghĩa TypeScript.

## Success Criteria

- [x] Project layer không thể đặt `privacyBlock`, `trust.*`, `assertions[]`, đích notification
- [x] Cố đặt → cảnh báo nêu tên khoá và file, giá trị bị bỏ
- [x] Schema không có `trust.passphrase`
- [x] `resolve --json` không in giá trị nhạy cảm nào
- [x] Config sai kiểu → cảnh báo + mặc định, phiên vẫn chạy
- [x] JSON Schema xuất ra khớp định nghĩa TypeScript
- [x] `pnpm test` xanh (117 file / 897 test), `src/config/` coverage **96.8%**

## Kết quả (2026-08-15)

**Bước 0 — ánh xạ khoá nguồn.** Đọc `ck-config.schema.json` (19K) và
`~/.agentkit/config.yaml`. Quyết định từng nhánh:

| Khoá nguồn | ariadnev | Lớp |
|---|---|---|
| `privacyBlock`, `assertions`, `trust.enabled` | giữ nguyên tên | user-only |
| `trust.passphrase` | **bỏ** — secret plaintext trong file mà lệnh resolve in ra | — |
| `paths.*`, `plan.{namingFormat,dateFormat,issuePrefix,reportsDir}`, `locale.*`, `docs.maxLoc`, `project.*` | giữ nguyên tên | project |
| `statusline` (string) + `statuslineQuota` (bool) | `statusline.mode` + `statusline.quota` | project |
| (mới) `scripts.executionPolicy` | consumer thật: `av skill run` | user-only |
| (mới) `notifications.*` | đích + bật/tắt cho phase 9 | user-only |
| `watch.*`, `content.*` | **bỏ** — Tier-3 nằm trong non-goals | — |
| `gemini.*`, `skills.research.useGemini`, `codingLevel`, `simplify.*` | **bỏ** — không có consumer trong bản port | — |
| `hooks.<name>` (10 khoá bật/tắt) | **hoãn sang phase 9** — khai field khi hook có thật, không khai trước | user-only |
| `plan.resolution.*`, `plan.validation.*` | **hoãn** — không consumer; thêm khi lệnh plan được port | project |

**Phân lớp là một phần của type.** Field khai qua `projectField.*`/`userField.*`;
literal trần không phải `SchemaNode` nên không biên dịch được. Không có danh sách
rời để quên đồng bộ.

**Hai tầng chặn, không phải một.** `filterProjectLayer` loại khoá user-only trước
khi resolve nhìn thấy; `resolveConfig` vẫn chỉ đọc khoá user-only từ lớp user, nên
caller quên lọc cũng không mở được đường. Merge-rồi-kiểm bị loại: nó im lặng hỏng
ngay lần thêm field đầu tiên mà ai đó quên thêm kiểm.

**`scripts.executionPolicy` chỉ hai tầng** `allow` (mặc định) / `never`. Tầng
`prompt` cần bề mặt tương tác mà `av skill run` không có; chính sách "đáng lẽ hỏi
nhưng im lặng không hỏi" tệ hơn không có chính sách. Mặc định giữ nguyên hành vi
hiện tại.

**Host allowlist kiểm ở chỗ đọc, không ở chỗ gửi.** Đích notification phải là
https trên `discord.com` / `slack.com` / `api.telegram.org` (đúng host hoặc
subdomain — `hooks.slack.com.evil.test` bị loại). Giá trị sai không bao giờ tới
tay sender, và cảnh báo không trích lại URL vì cảnh báo đi vào log.

Chạy thật (HOME cô lập): project file đặt `privacyBlock` + `discordWebhook` → cả
hai bị loại kèm cảnh báo nêu file; `resolve --json` in `<redacted>`, grep token
thật ra 0 dòng; `executionPolicy: never` → `av skill run` từ chối, exit 1.

ADR: `docs/decisions/0007-config-layers-and-no-stored-passphrase.md`.
Schema xuất: `schemas/av-config.schema.json` (sinh từ định nghĩa TS, có test
chống trôi).

### Nợ chuyển sang phase 9

- `hooks.<name>` toggles: khai khi hook có thật.
- `av-config-client.cjs` phải soi lại cùng ranh giới lớp này (hoặc chỉ đọc file
  user cho khoá nhạy cảm) — hook là tiến trình riêng, không import được TS.

## Risk Assessment

**Ranh giới hai lớp khoá bị xói mòn khi thêm field mới.** Tín hiệu: field mới thêm vào mà
không khai lớp. Phản ứng: phân lớp là một phần của type — field không khai lớp thì không
biên dịch được, không dựa vào review để nhớ.

**Schema phình theo nguồn rồi mang nợ.** Tín hiệu: thêm field không có consumer. Phản ứng:
chỉ thêm khi có hook hoặc lệnh thật đọc nó.
