---
phase: 2
title: "Rebrand vcskill → ariadnev (+ release pipeline, dữ liệu đã ghi)"
status: pending
priority: P1
effort: "6d"
dependencies: [1]
---

# Phase 2: Rebrand vcskill → ariadnev

## Overview

Đổi toàn bộ định danh sang `ariadnev`, gắn domain `ariadnev.com`, version nhảy lên `1.0.0`.
Phải làm **trước** khi port nội dung: rebrand 205 file hiện tại là việc vừa phải, rebrand
sau khi port thêm 1511 file là việc khác hẳn.

Effort 3d → 6d sau audit vòng 2: con số "130 file" ban đầu sai (thực tế **205 file** chứa
`vcskill`, **~1700** occurrence `vc:`), và ba khối việc không nằm trong ước lượng cũ —
pipeline release, dữ liệu đã ghi, và gate có allowlist.

## Bảng định danh

| Hạng mục | Cũ | Mới |
|---|---|---|
| Binary / package | `vcskill` | `ariadnev` |
| Alias ngắn | `vc` | `av` |
| Prefix env | `VCSKILL_*` | `ARIADNEV_*` |
| Namespace skill / agent | `vc:` / `vc-` | `av:` / `av-` |
| Cache dir | `~/.cache/vcskill` | `~/.cache/ariadnev` |
| State dir (global) | `~/.vcskill/` | `~/.ariadnev/` |
| State dir (per-repo) | `.vcskill/` | `.ariadnev/` |
| Hook install dir | `.claude/hooks/vc/` | `.claude/hooks/av/` |
| Support dir | `.agents/vcskill` | `.agents/ariadnev` |
| Base URL | `vcskill.vchun.dev` | `ariadnev.com` |
| Schema `$id` host | `vcskill.dev` | `ariadnev.com` |
| Temp suffix | `.vcskill-tmp` | `.ariadnev-tmp` |
| Release tag | `vcskill@X` | `ariadnev@X` |
| Asset name | `vcskill-{os}-{arch}` | `ariadnev-{os}-{arch}` |
| Repo consumer web | `bavanchun/vcskill-web` | `bavanchun/ariadnev-web` |
| Version | `0.12.0` | **`1.0.0`** |

## Quyết định (2026-08-14)

- **State cũ: không viết code migration.** Người dùng tự dọn tay. Hệ quả được chấp nhận:
  `~/.vcskill/`, `~/.cache/vcskill/{0.6.0,0.9.0,0.10.0,0.11.0}`, và mọi file bản cũ đã ghi
  vào `.claude/`/`.codex/`/`.cursor/` sẽ không được `av uninstall` nhận ra. Ghi cảnh báo
  trong README + release note, không code.
- **Version nhảy `1.0.0`**, đánh dấu bản đầu hoàn chỉnh của ariadnev.
- **`bavanchun/vcskill-web` đổi tên** thành `ariadnev-web`. Thao tác đổi tên repo trên
  GitHub do người dùng làm; phase này cập nhật `const` trong schema.

## Requirements

Functional:
- Đổi định danh trên toàn repo, không chỉ `src/`+`kit/`+`docs/`.
- **Pipeline release**: tag grammar, asset name, artifact name, `$id` schema, consumer repo.
  `resolve-previous-stable` phải xử lý được "chưa có release nào dưới tên mới".
- **Dữ liệu đã ghi** — hai thứ không phải định danh mà là dữ liệu trên đĩa người dùng:
  - Marker AGENTS.md: đổi sang `<!-- ariadnev:start/end -->` **nhưng `stripAgentsBlock` phải
    nhận cả hai spelling**, nếu không mỗi lần cài sẽ nối thêm một block mới.
  - Key receipt `vcskillVersion` → `ariadnevVersion`, kèm bump `RECEIPT_SCHEMA_VERSION` và
    reader chấp nhận receipt cũ.
- `.gitignore` có cả `.ariadnev/` và `.vcskill/` (giữ cái cũ cho repo đã cài).
- Gate `check-brand-drift.mjs` quét **toàn repo trừ allowlist**.

Non-functional:
- Không đổi hành vi ngoài hai mục "dữ liệu đã ghi" ở trên, và cả hai phải có test.

## Allowlist của gate (bản ghi lịch sử, không sửa)

Các file dưới đây ghi lại sự thật tại một version quá khứ. Sửa brand trong chúng làm chúng
nói dối; gate phải bỏ qua:

- `evals/baselines/**` — baseline đóng băng, ghi tag + commit + tree hash cụ thể
- `docs/journal/**` — nhật ký có ngày
- `docs/decisions/0001-*` … `0005-*` — ADR mô tả quyết định đã ra dưới tên cũ
- `plans/**` — plan và report có ngày
- `CHANGELOG.md` — lịch sử phát hành

## Related Code Files

**Lõi**
- `packages/cli/src/adapt/paths.ts` — hằng số đường dẫn (nguồn duy nhất)
- `packages/cli/src/env-scope.ts` — namespace env
- `packages/cli/src/kit/embedded-kit.ts` — cache dir
- `packages/cli/src/install/fs-atomic.ts` — hậu tố temp
- `packages/cli/src/install/install-execute.ts` — `.vcskill/receipt.json`, `.vcskill/backups`
- `packages/cli/src/uninstall/uninstall-execute.ts`
- `packages/cli/src/history/store.ts`, `packages/cli/src/migrate/applied-state.ts`

**Dữ liệu đã ghi**
- `packages/cli/src/install/agents-md.ts` — marker; strip nhận cả hai spelling
- `packages/cli/src/install/install-receipt.ts` — key `vcskillVersion`, schema version
- `packages/cli/src/cli/update-command.ts` — reader của key đó

**Pipeline release**
- `packages/cli/scripts/resolve-previous-stable.mjs` — glob tag, xử lý "chưa có release"
- `packages/cli/scripts/binary-targets.mjs`, `build-binaries.mjs`, `generate-docs-bundle.ts`
- `.github/workflows/{ci,release,release-candidate-build,release-candidate-publish,finalize-release}.yml`
- `.github/release/*.schema.json` — `$id` + `const` repo consumer
- `.changeset/*.md` — tên package
- `install.sh`, `install.ps1` — asset name, base URL, alias

**Kit + docs**
- `kit/skills/*/SKILL.md`, `kit/agents/*.md`, `kit/hooks/**`, `kit/workflows/schema/*.json`
- `README.md`, `AGENTS.md`, `CLAUDE.md`, `SECURITY.md`
- `.gitignore`
- `package.json` (root + cli), `kit.config.json`, `portable-manifest.json`

**Mới**
- `packages/cli/scripts/check-brand-drift.mjs` + allowlist
- `.github/workflows/ci.yml` — chạy gate

## Implementation Steps

1. Viết `check-brand-drift.mjs` **trước**, quét toàn repo trừ allowlist, pattern:
   `vcskill`, `VCSKILL_`, `\bvc:`, `\bvc-`, `vcskill\.dev`, `vchun\.dev`,
   `bavanchun/vcskill`, case-insensitive. Chạy để có baseline đếm được (~205 file).
2. Đổi hằng số ở `paths.ts` + `env-scope.ts` trước; chạy test để trình biên dịch liệt kê
   consumer thật.
3. Xử lý **dữ liệu đã ghi**: test đỏ trước cho cả hai —
   (a) AGENTS.md có block `<!-- vcskill:start -->` cũ → cài lại → vẫn đúng **một** block;
   (b) receipt cũ đọc được, cảnh báo version vẫn phát.
4. Đổi `.gitignore` (thêm `.ariadnev/`, giữ `.vcskill/`), package.json, bin entries,
   `install.sh`, `install.ps1`, file cấu hình.
5. Pipeline release: tag glob, asset/artifact name, `$id`, `const` repo consumer.
   `resolve-previous-stable` phải trả kết quả hợp lệ khi chưa có tag `ariadnev@*` nào.
6. Bump version lên `1.0.0`; tạo changeset major mô tả rename + breaking changes.
7. Đổi kit (26 skill, 13 agent, 3 rules, 6 hook) và docs/README.
8. Chạy gate — về 0. Nối vào CI.
9. Cài thử thật: build binary, `av install --provider claude-code`, xác nhận
   `ariadnev --version` = `1.0.0`, `av --version` chạy, `av validate` xanh, và
   `git status` sạch sau khi cài (kiểm `.gitignore`).

## Success Criteria

- [ ] `check-brand-drift.mjs` trả 0 trên toàn repo trừ allowlist, và chạy trong CI
- [ ] Allowlist ghi tường minh trong script, có lý do từng mục
- [ ] AGENTS.md có block cũ → cài lại → đúng một block (test)
- [ ] Receipt cũ vẫn đọc được, cảnh báo version vẫn phát (test)
- [ ] `git status` sạch sau `av install` trong repo mới
- [ ] `resolve-previous-stable` không ném lỗi khi chưa có tag `ariadnev@*`
- [ ] `install.ps1` tải asset `ariadnev-windows-x64.exe` từ `ariadnev.com`
- [ ] `ariadnev --version` = `1.0.0`; `av --version` chạy
- [ ] `av validate` xanh: 26 skills / 13 agents / 6 hooks
- [ ] `skill-crossrefs` 0 ref gãy sau khi đổi namespace
- [ ] `pnpm test` xanh

## Risk Assessment

**Đổi tên sót ở chỗ chỉ lộ lúc runtime** (env đọc bằng chuỗi động, đường dẫn ghép). Tín
hiệu: gate xanh nhưng bước 9 cài thử lỗi. Phản ứng: bước 9 là bắt buộc; gate phải quét cả
chuỗi ghép và template literal.

**Allowlist bị lạm dụng để giấu file chưa đổi.** Tín hiệu: allowlist phình thêm mục không
phải bản ghi lịch sử. Phản ứng: mỗi mục allowlist phải có lý do viết trong script; thêm mục
mới là thay đổi cần review.

**Đổi tên repo web trên GitHub chưa xảy ra khi pipeline chạy.** Tín hiệu: CI fail ở bước
kiểm consumer-lock. Phản ứng: thứ tự bắt buộc — người dùng đổi tên repo trên GitHub xong
mới chạy release đầu tiên; bước 5 chỉ sửa schema.

**205 file × test fixture nhúng brand.** Tín hiệu: `pnpm test` đỏ hàng loạt ở bước 2-7.
Phản ứng: đó là lý do effort là 6d chứ không phải 3d; sửa fixture là phần việc đã tính.
