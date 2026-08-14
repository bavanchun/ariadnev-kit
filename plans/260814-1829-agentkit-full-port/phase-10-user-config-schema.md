---
phase: 10
title: "User config schema (tách quyền project/user)"
status: pending
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

- [ ] Project layer không thể đặt `privacyBlock`, `trust.*`, `assertions[]`, đích notification
- [ ] Cố đặt → cảnh báo nêu tên khoá và file, giá trị bị bỏ
- [ ] Schema không có `trust.passphrase`
- [ ] `resolve --json` không in giá trị nhạy cảm nào
- [ ] Config sai kiểu → cảnh báo + mặc định, phiên vẫn chạy
- [ ] JSON Schema xuất ra khớp định nghĩa TypeScript
- [ ] `pnpm test` xanh, `src/config/` coverage ≥ 90%

## Risk Assessment

**Ranh giới hai lớp khoá bị xói mòn khi thêm field mới.** Tín hiệu: field mới thêm vào mà
không khai lớp. Phản ứng: phân lớp là một phần của type — field không khai lớp thì không
biên dịch được, không dựa vào review để nhớ.

**Schema phình theo nguồn rồi mang nợ.** Tín hiệu: thêm field không có consumer. Phản ứng:
chỉ thêm khi có hook hoặc lệnh thật đọc nó.
