---
phase: 2
title: "Xoá cổng web-consumer (atomic)"
status: pending
priority: P1
effort: "4h"
dependencies: [1]
---

# Phase 2: Xoá cổng web-consumer (atomic)

## Overview

Gỡ toàn bộ ràng buộc web-consumer khỏi đường release trong **một commit**, bump
`schemaVersion` của attestation để bản cũ và bản mới không thể lẫn nhau, và lưu lại thiết kế
đã xoá bằng một tag cùng một mục trong ledger quyết định.

## Requirements

- Functional: `build-binaries.mjs` chạy được không cần cờ consumer; ba workflow release
  không còn bước, cờ, hay assertion nào về consumer; attestation schema không còn khối
  `consumer`.
- Non-functional: docs bundle manifest sinh ra sau khi xoá byte-identical với baseline;
  toàn bộ test xanh; thiết kế đã xoá còn truy hồi được.

## Architecture

Cổng consumer chạm 16 file, chia làm bốn lớp phụ thuộc lẫn nhau. Xoá lắt nhắt để lại
pipeline hỏng theo kiểu mới, nên phải làm gọn một lần:

```
Workflow  ─ release-candidate-build.yml   (4 step + 2 cờ + 1 arg)
          ─ release-candidate-publish.yml (2 assertion)
          ─ finalize-release.yml          (2 assertion + 1 sourceFiles entry)
             │
Schema    ─ release-artifact-attestation.schema.json  (consumer trong required + properties)
          ─ web-consumer-lock.schema.json              (xoá cả file)
             │
Script    ─ build-binaries.mjs            (throw + 2 cờ truyền xuống)
          ─ create-release-attestation.mjs (khối consumer)
          ─ verify-web-consumer-lock.mjs   (184 dòng, xoá cả file)
          ─ web-consumer-lock-files.mjs    (82 dòng, xoá cả file)
          ─ generate-docs-bundle.ts        (2 cờ CLI)
             │
Engine    ─ docs-bundle-types.ts          (FinalConsumerLockInput + field)
          ─ docs-bundle-generator.ts      (validateIdentity, dòng 38-42)
```

**Điểm mấu chốt về docs bundle:** `finalConsumerLock` **chỉ** xuất hiện trong
`validateIdentity()` (`docs-bundle-generator.ts:38-42`) — nó không đi vào nội dung manifest.
Nên xoá xong, manifest phải byte-identical. Đó là phép kiểm mạnh nhất cho việc "xoá không
đổi output", và là lý do bước 2 chụp baseline trước.

**Vì sao bump `schemaVersion` 1 → 2:** không release nào đã công bố mang attestation, nên
không có chuỗi nào bị đứt. Nhưng nếu sau này có công cụ đọc artifact cũ lẫn mới, chỉ có bump
mới phân biệt được "cổng chưa từng tồn tại" với "cổng bị âm thầm bỏ".

**Cẩn thận: có hai schema khác nhau đều mang `schemaVersion: 1`.** Chỉ đổi *attestation*:

| Vị trí | Schema | Hành động |
|---|---|---|
| `release-candidate-publish.yml:106` | `attestation.schemaVersion` | 1 → **2** |
| `finalize-release.yml:103` | `attestation.schemaVersion` | 1 → **2** |
| `finalize-release.yml:91` | `envelope.schemaVersion` (candidate envelope) | **giữ nguyên 1** |
| `release-candidate-publish.yml` (envelope) | `envelope.schemaVersion` | **giữ nguyên 1** |

Grep phải bám chuỗi `attestation.schemaVersion`, không phải `schemaVersion === 1` trần.

**Không xoá lố:** `--previous-source-tree/-tag/-sha` của `build-binaries.mjs` và
`resolve-previous-stable.mjs` **không** thuộc cổng consumer. Chúng phục vụ việc chiếu bản
stable trước vào docs bundle, độc lập hoàn toàn. Giữ nguyên.

## Related Code Files

- Modify: `.github/workflows/release-candidate-build.yml` — xoá step "Resolve exact web lock
  metadata", "Checkout web consumer exact commit", "Preflight exact web lock", "Execute final
  consumer"; xoá `--final-consumer-lock` + `--final-consumer-lock-digest` khỏi lời gọi
  build-binaries; sửa lời gọi `create-release-attestation.mjs` bỏ arg
  `final-consumer-result.json` và arg lock
- Modify: `.github/workflows/release-candidate-publish.yml` — xoá 2 dòng assertion consumer
  (~110-111); đổi `schemaVersion === 1` → `=== 2`
- Modify: `.github/workflows/finalize-release.yml` — xoá 2 dòng assertion consumer (~107-108);
  bỏ entry `attestation.consumer.lockPath` khỏi mảng `sourceFiles` (~109); đổi
  `schemaVersion === 1` → `=== 2`
- Modify: `.github/release/release-artifact-attestation.schema.json` — bỏ `consumer` khỏi
  `required` và `properties`; `schemaVersion` const 1 → 2
- Modify: `packages/cli/scripts/build-binaries.mjs` — xoá `finalConsumerLock`,
  `finalConsumerLockDigest`, throw ở dòng 45, check SHA-256 ở dòng 56, 2 cờ truyền xuống
  generate-docs-bundle (dòng 71-72)
- Modify: `packages/cli/scripts/create-release-attestation.mjs` — xoá tham số
  `consumerResultPath` và `lockPath`, xoá khối `consumer` khỏi payload
- Modify: `packages/cli/scripts/generate-docs-bundle.ts` — xoá 2 cờ CLI consumer
- Modify: `packages/cli/src/release/docs-bundle-types.ts` — xoá `FinalConsumerLockInput` và
  field `finalConsumerLock`
- Modify: `packages/cli/src/release/docs-bundle-generator.ts` — xoá dòng 38, 40-42 trong
  `validateIdentity()`
- Modify: `packages/cli/scripts/release-privileged-fixtures.mjs` — gỡ fixture consumer
- Modify: `packages/cli/scripts/build-binaries.test.mjs`,
  `packages/cli/scripts/release-json-schemas.test.mjs`,
  `packages/cli/scripts/release-workflow.test.mjs`,
  `packages/cli/src/release/docs-bundle-generator.test.ts` — gỡ mọi assertion consumer
- Delete: `packages/cli/scripts/verify-web-consumer-lock.mjs`
- Delete: `packages/cli/scripts/web-consumer-lock-files.mjs`
- Delete: `.github/release/web-consumer-lock.schema.json`
- Delete: `packages/cli/src/release/web-consumer-lock-verifier.test.ts`
- Modify: `package.json` (root) — xoá script `docs-bundle:verify-web-lock`
- Modify: `packages/cli/package.json` — xoá script `verify:web-consumer-lock`
- Create: mục trong ledger quyết định ghi việc xoá và điều kiện hồi sinh

## Implementation Steps

1. **Baseline predecessor.** `node packages/cli/scripts/resolve-previous-stable.mjs
   --version 1.0.0` → ghi lại kết quả (hiện là `vcskill@0.12.0` @ `335399f`). Sau khi xoá
   phải vẫn ra đúng vậy — bằng chứng không xoá lố sang phần predecessor.
2. **Baseline manifest.** Sinh docs bundle chế độ provisional vào thư mục tạm và lưu digest
   của manifest. Chế độ `final` hiện *không* chạy được (dòng 38 throw khi thiếu lock), nên
   provisional là baseline khả dĩ duy nhất trước khi xoá.

   Provisional-trước so provisional-sau là **đủ** để chứng minh việc xoá không đổi output:
   `finalConsumerLock` chỉ được đọc trong `validateIdentity()` — hàm trả `void`, chỉ throw.
   Phần dựng payload (`normalizedPayloadFiles`) và dựng manifest (`manifestFromPayload`) dùng
   chung cho cả hai mode; ba field duy nhất khác nhau theo mode là `mode`, `publishable`,
   `releaseTag`, không cái nào chạm tới lock.

   Sau khi xoá, chạy thêm hai phép kiểm:
   - **Final chạy được lần đầu.** Cần cây nguồn của bản stable trước, materialize bằng
     `git worktree add <scratch> vcskill@0.12.0`, rồi truyền `--previous-source-tree
     <scratch> --previous-source-tag vcskill@0.12.0 --previous-source-sha 335399f…`.
     Không có bước này thì tiêu chí "final chạy được" không thực thi được.
   - **Delta đúng như dự đoán.** Diff manifest final-sau với provisional-sau (cùng
     `--previous-source-*` để tập file payload khớp nhau); khác biệt phải **đúng bằng** ba
     field `mode`, `publishable`, `releaseTag`. Nhiều hơn thế là dấu hiệu xoá nhầm chỗ.
   - **Tính xác định.** Chạy final hai lần, digest phải giống hệt.
3. **Tag lưu trữ.** `git tag archive/web-consumer-gate HEAD` — trỏ commit *trước* khi xoá.
   Thiết kế còn nguyên trong git, đọc lại được bất cứ lúc nào.
4. **Xoá theo thứ tự trong ra ngoài** để mỗi bước lỗi biên dịch chỉ ra chỗ tiếp theo:
   engine (`docs-bundle-types.ts`, `docs-bundle-generator.ts`) → script
   (`generate-docs-bundle.ts`, `build-binaries.mjs`, `create-release-attestation.mjs`) →
   xoá file trọn vẹn → schema → workflow → test + fixture → script trong `package.json`.
5. **Bump schemaVersion** trong schema, `create-release-attestation.mjs`, và **đúng hai**
   assertion `attestation.schemaVersion` trong workflow (publish:106, finalize:103). Grep
   bám chuỗi `attestation.schemaVersion`, **không** grep `schemaVersion === 1` trần — chuỗi
   trần cũng trúng schema candidate envelope, thứ phải giữ nguyên 1.
5b. **Sửa CHANGELOG.** Mục `1.0.0` phần Patch đang hứa *"Bind release candidates to the
   exact web-consumer contract"* — đúng cái commit này xoá. Sửa trong **cùng commit**, để
   changelog và code không bao giờ lệch nhau qua một commit nào.
6. **Quét sót.** `grep -rn "web-consumer\|finalConsumerLock\|final-consumer-lock\|consumerResult"
   packages .github package.json` → chỉ còn hit trong ledger/ADR/plan.
7. **Kiểm chứng.** `pnpm test`; `pnpm lint`; `node packages/cli/scripts/check-brand-drift.mjs`;
   chạy lại bước 1 và 2 so với baseline.
8. **Ledger.** Ghi mục quyết định: cổng làm gì, vì sao xoá (nhánh verified chưa từng chạy;
   hợp đồng consumer không tồn tại; một người bảo trì), và **điều kiện hồi sinh**: khi
   `ariadnev-web` có hợp đồng tiêu thụ thật, dựng lại cổng *từ hợp đồng đó*, không phải từ
   thiết kế 11-digest hiện tại — thiết kế này viết ra khi chưa có consumer thật, nên dựng
   lại nguyên xi nhiều khả năng vẫn sai.
9. **Một commit atomic:** `refactor(release): remove the web-consumer gate from the release path`.

## Success Criteria

- [ ] `grep -rn "web-consumer\|finalConsumerLock\|final-consumer-lock" packages .github package.json`
      chỉ còn hit trong tài liệu quyết định
- [ ] `release-artifact-attestation.schema.json`: `schemaVersion` const `2`, không còn
      `consumer` ở `required` lẫn `properties`
- [ ] `finalize-release.yml:91` vẫn là `envelope.schemaVersion === 1` (không bị bump lây)
- [ ] `build-binaries.mjs` chạy trọn một lần trên máy **không** truyền cờ consumer nào
      (script không có handler `--help`; nó throw vì thiếu `--source-sha` bất kể, nên `--help`
      không phải phép kiểm)
- [ ] Docs bundle provisional manifest digest **khớp baseline bước 2**
- [ ] Docs bundle chế độ `final` chạy được lần đầu tiên, với worktree predecessor
- [ ] Diff final-sau vs provisional-sau khác **đúng ba** field `mode`/`publishable`/`releaseTag`
- [ ] Chạy final hai lần ra digest giống hệt
- [ ] Mục `1.0.0` trong CHANGELOG không còn hứa ràng buộc web-consumer
- [ ] `resolve-previous-stable.mjs --version 1.0.0` vẫn trả `vcskill@0.12.0` @ `335399f`
- [ ] `pnpm test` xanh, `pnpm lint` xanh, brand-drift clean
- [ ] `git tag -l archive/web-consumer-gate` có kết quả
- [ ] Toàn bộ nằm trong **một** commit

## Risk Assessment

**Rủi ro: xoá lố sang cơ chế predecessor.**
Tín hiệu: `build-binaries.mjs` throw "requires the immediate previous stable source", hoặc
bước 1 sau khi xoá ra kết quả khác baseline.
Phản ứng: khôi phục phần predecessor từ `archive/web-consumer-gate`. Hai cơ chế trông giống
nhau (đều là digest + tag) nhưng độc lập.

**Rủi ro: docs bundle đổi output.**
Tín hiệu: manifest digest lệch baseline.
Phản ứng: dừng, diff manifest. Nếu `finalConsumerLock` hoá ra *có* đi vào payload (trái với
đọc hiện tại), thiết kế lại bước xoá cho phần đó thay vì chấp nhận output đổi.

**Rủi ro: sót assertion `schemaVersion === 1` ở một workflow.**
Tín hiệu: phase 5 đỏ ở step publish hoặc finalize với "attestation schema drift".
Phản ứng: bước 5 grep bắt buộc, không dựa vào trí nhớ.

**Rủi ro: test fixture còn dựng attestation có `consumer`, làm schema mới reject.**
Tín hiệu: `release-json-schemas.test.mjs` đỏ.
Phản ứng: sửa fixture, không nới schema. Fixture phải phản chiếu hình dạng thật.

**Giả định load-bearing:** không release đã công bố nào mang attestation (đã kiểm 11 release
`vcskill@0.2.0`→`0.11.0`, chỉ có checksums + 5 binary). Nếu tìm thấy một cái có, dừng và
thêm carve-out theo `schemaVersion` thay vì đổi kế hoạch giữa chừng.
