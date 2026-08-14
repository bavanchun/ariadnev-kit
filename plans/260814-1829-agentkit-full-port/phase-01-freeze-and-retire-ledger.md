---
phase: 1
title: "Freeze, rollback ref, gỡ ledger + coverage"
status: completed
completed: 2026-08-14
priority: P1
effort: "2d"
dependencies: []
---

# Phase 1: Freeze, rollback ref, gỡ ledger + coverage

## Overview

Hai việc phải xong trước mọi thứ khác: tạo điểm rollback bất biến trước khi ghi đè 25 skill
distill, và gỡ hệ thống ledger/coverage — vì `decisions.test.ts` bắt `decisions.json` phản
chiếu **chính xác** inventory skill, nên bất kỳ skill nào port vào cũng làm suite đỏ ngay.

## Requirements

Functional:
- Tag + branch bất biến `pre-agentkit-port` trỏ vào `335399f`, đã push lên remote.
- Gỡ hoặc đổi vai trò hệ thống coverage với **đủ 11 consumer**, không phải 3.
- Bump `PROTOCOL_VERSION` vì `CAPABILITIES` mất một mục.
- `kit/decisions.json` chuyển sang `docs/` làm hồ sơ lịch sử (ghi lý do 466 claim từng bị
  loại — có giá trị tham khảo kể cả khi hết hiệu lực).
- Reconcile hai plan cũ: `260814-1615-kit-rebrand-strip-upstream` và
  `260814-1717-main-history-rewrite`.

Non-functional:
- `pnpm test` xanh khi phase kết thúc; `av validate` vẫn chạy được trên kit 26 skill.

## Architecture

Coverage không phải helper nội bộ — nó là token đóng băng trong contract envelope có drift
test canh. Gỡ nó là breaking change của một hợp đồng đã publish, nên `PROTOCOL_VERSION` phải
lên `"2"`.

`decisions.json` nằm dưới `kit/` nên đang được nhúng vào binary; chuyển sang `docs/` làm
đổi tập asset nhúng và sẽ làm đỏ drift test ở `embedded-kit.test.ts:91-99`. Đó là thay đổi
mong muốn, cập nhật test theo.

Hai plan cũ: kết quả của chúng đã nằm trên history (main 91 commit, 0 từ khoá upstream),
nhưng `260814-1717` mang tag `destructive, force-push` và **chưa chạy**. Đánh dấu nó
`completed` là sai sự thật và xoá mất tín hiệu cảnh báo. Phải quyết rõ: cancel hay giữ
pending kèm ghi chú "không được đụng vào ref rollback".

## Related Code Files

Consumer đầy đủ của hệ thống coverage (11):
- Modify: `packages/cli/src/cli/validate-command.ts` (`:11` import, `:21` kind, `:44-45`
  coverageLevel, `:156-166` findings loop)
- Modify: `packages/cli/src/cli/register-quality-commands.ts` (`:6`, `:25`)
- Delete: `packages/cli/src/cli/coverage-command.ts`, `coverage-command.test.ts`,
  `coverage-test-fixture.ts`
- Delete: `packages/cli/src/kit/claim-coverage.ts` + `.test.ts`,
  `claim-extract.ts` + `.test.ts`, `decisions.test.ts`
- Modify: `packages/cli/src/cli/validate-command.test.ts` (`:6-7`)
- Modify: `packages/cli/src/cli/contract-command.ts` (`:25` PROTOCOL_VERSION, `:36`
  CAPABILITIES, `:54` KNOWN_COMMANDS)
- Modify: `packages/cli/scripts/wave-rollup.mjs` (`:24` LEDGER_PATH)
- Modify: `packages/cli/src/kit/embedded-kit.test.ts` (`:91-99` drift test)
- Modify: `README.md` (`:86`)
- Move: `kit/decisions.json` → `docs/decisions-ledger-historical.json`

## Implementation Steps

1. `git tag pre-agentkit-port 335399f && git branch pre-agentkit-port 335399f`, push cả hai.
   Xác minh `git rev-parse pre-agentkit-port` trỏ đúng và remote đã nhận.
2. Đánh dấu `260814-1717-main-history-rewrite` là **cancelled** (quyết định 2026-08-14):
   mục tiêu của nó đã đạt bằng đường khác (main 91 commit, 0 từ khoá upstream), và giữ nó
   sống là giữ nguy cơ có người chạy force-push làm mất ref rollback vừa tạo ở bước 1. Ghi
   lý do cancel trong file plan đó. Với `260814-1615-kit-rebrand-strip-upstream`: đánh dấu
   completed — kết quả đã trên history và nó không mang thao tác destructive nào còn chờ.
3. Test đỏ trước: sửa `contract-command.test.ts` kỳ vọng `protocol_version: "2"` và không
   còn `coverage` trong `KNOWN_COMMANDS`/`CAPABILITIES`.
4. Gỡ coverage khỏi `validate-command.ts` (import, kind union, coverageLevel, findings loop).
5. Xoá 8 file coverage/claim/decisions test; cập nhật 3 file consumer còn lại.
6. Chuyển `decisions.json` sang `docs/`; cập nhật `wave-rollup.mjs` và drift test.
7. Bump `PROTOCOL_VERSION` → `"2"`; cập nhật README.
8. Bỏ `forked-from: ck:git@1.0.0` khỏi `kit/skills/git/SKILL.md:9` — kiểm
   `docs-bundle-skill-metadata.ts:8` xem field này có consumer nào khác không trước khi gỡ.

## Success Criteria

- [x] `git rev-parse pre-agentkit-port` == `335399f`, có trên remote, cả tag lẫn branch
- [x] `av validate` chạy được và không còn phát findings `coverage` (26 skills / 13 agents /
      6 hooks, all checks passed)
- [x] `av coverage` không còn trong `--help` và không còn trong `contract --json`
- [x] `contract --json` trả `protocol_version: "2"`
- [x] Không còn file nào import `claim-coverage.js` hay `claim-extract.js`
- [x] Drift test nhúng xanh sau khi `decisions.json` rời `kit/` (131 asset, giảm 1)
- [x] `260814-1717-main-history-rewrite` là `cancelled` kèm lý do; `260814-1615` là `completed`
- [x] `pnpm test` xanh — 715 vitest + 48 node:test, `pnpm lint` sạch

## Kết quả thực thi (2026-08-14)

Ba điều phát sinh ngoài kế hoạch, đã xử lý:

**`registry.ts` + `registry.test.ts` bị xoá thêm.** Plan liệt kê 8 file xoá nhưng bỏ sót
parser của `decisions.json`. Sau khi `claim-coverage`, `coverage-command` và `decisions.test`
biến mất, consumer duy nhất còn lại của `parseRegistry` là test của chính nó — dead code
đúng nghĩa. Xoá luôn. `wave-rollup.mjs` không dùng parser này (nó `JSON.parse` trực tiếp).

**Consumer thứ 12-14 nằm trong prose, không phải code.** `docs/vc-skill-authoring-spec.md`
(mục "Claims ledger"), `kit/skills/skill-creator/SKILL.md:64,70` và
`references/source-and-security-review.md:45-55` vẫn dạy tác giả ghi claim vào một ledger
vừa bị gỡ. Gate grep của plan chỉ soi import nên không bắt được. Đã viết lại cả ba: mục spec
thành "Claims ledger (retired)" trỏ vào bản lưu trữ, hai file skill chuyển sang ghi provenance
trong `metadata`. (`skill-creator` sẽ bị thay bằng bản nguồn ở phase 12; sửa tối thiểu.)

**Benchmark context bị đóng băng theo digest của corpus.** `evals/context/corpus-manifest.json`
gồm `kit/skills/git/SKILL.md`, nên bước 8 (gỡ `forked-from`) làm `context-query.test.ts` đỏ:
report `evals/reports/context-graph-benchmark.json` pin `corpusDigest` cũ. Chạy lại
`benchmark-context.mjs --write` để tái đóng băng; mọi gate vẫn `passed`, quyết định vẫn
`adopt-deterministic-artifact-graph`. **Cảnh báo cho phase 11/12:** mỗi lần thay nội dung
một trong 26 tài liệu của corpus sẽ lại làm test này đỏ — phải tái đóng băng, không được nới test.

Về `forked-from` (bước 8, rủi ro đã lường): `docs-bundle-skill-metadata.ts:8` dùng nó như
field chung có allowlist, `docs-bundle-projector-hostile.test.ts` có case riêng. Giữ field,
chỉ bỏ giá trị `ck:git@1.0.0` và cụm "(forked from ck:git)" trong description.

Ghi chú: tag và branch trùng tên `pre-agentkit-port` làm git báo `refname is ambiguous`.
Vô hại ở đây (cả hai trỏ cùng commit), nhưng khi tham chiếu nên dùng `refs/tags/` hoặc
`refs/heads/` cho rõ.

## Risk Assessment

**Gỡ coverage làm mất một lưới an toàn mà không có gì thay thế.** Tín hiệu: port sót nội
dung mà không ai phát hiện. Phản ứng đã chọn: `av audit` (phase 6) đối chiếu file đã cài
với receipt là lưới mới; nếu muốn thêm phép đo "port sót", dựng nó như đối chiếu kit với
snapshot nguồn — nhưng đó là việc riêng, không chặn phase này.

**`forked-from` có thể còn consumer.** Tín hiệu: bước 8 grep thấy
`docs-bundle-skill-metadata.ts` xử lý field này. Phản ứng: nếu là field chung của
docs-bundle thì giữ field, chỉ bỏ giá trị `ck:git` ở skill đó — không retire field toàn repo.
