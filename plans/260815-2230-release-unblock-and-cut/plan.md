---
title: Gỡ blocker release và cắt ariadnev@1.0.0
status: pending
priority: P1
effort: medium
branch: main
tags: [release, provenance, cleanup, adr]
created: 2026-08-15
blockedBy: []
blocks: []
---

# Gỡ blocker release và cắt `ariadnev@1.0.0`

## Outcome

`release.yml` chạy được end-to-end và repo cắt ra release **`ariadnev@1.0.0`** đầu tiên
dưới tên mới — release đầu tiên trong lịch sử repo có docs bundle và attestation kèm theo.

Cổng web-consumer bị gỡ khỏi đường release, thay bằng một smoke test thật sự chạy được.
Tư thế với upstream được ghi thành ADR. Các thay đổi đang treo trong working tree được
commit.

## Bối cảnh

Plan `260814-1829-agentkit-full-port` đã `completed` cả 16 phase: kit 1454 file, engine
23.7k LOC, 1099 vitest + 109 node:test xanh. Nhưng **chưa release được lần nào** dưới tên
mới, vì `release-candidate-build.yml` chết ở step đầu tiên: nó yêu cầu
`.github/release/web-consumer-lock.json`, file này chưa từng tồn tại, và repo
`bavanchun/ariadnev-web` không có entry point verify nào để sinh ra report mà lock cần.

### Bằng chứng dẫn tới quyết định xoá (2026-08-15)

1. **Nhánh "verified" của cổng chưa từng chạy.** 11 release đã có (`vcskill@0.2.0` →
   `0.11.0`) — kiểm asset từng cái: chỉ có `checksums.txt` + 5 binary. Không release nào
   kèm `release-artifact-attestation.json`. Toàn bộ máy móc attestation + consumer chưa
   sinh ra một artifact công bố nào.
2. **Cổng verify một hợp đồng chưa tồn tại.** Không phải "chưa cấu hình" — phía consumer
   không có script nào ghi report ra `invocation.reportPath`. Xây nó (phương án B) là
   *phát minh ra hợp đồng consumer để thoả mãn cổng vốn sinh ra để bảo vệ hợp đồng đó*.
3. **Giá phải trả đo được: 16 file.** `consumer` nằm trong `required` cấp cao nhất của
   attestation schema với 11 field con bắt buộc; `build-binaries.mjs:45` throw cứng nên
   **build local cũng không chạy được**; lock plumbing xuyên vào docs bundle generator.
4. **Trái với triết lý của chính repo.** `spec-verified.ts`: ô chưa verify thì *skip + log*.
   Fail-closed chỉ đúng khi phép kiểm **có thể pass**. Một phép kiểm không bao giờ pass
   được không phải fail-closed — đó là sự cố thường trực khoác áo nghiêm ngặt.

Phương án "làm có điều kiện" bị loại vì nó giữ lại một nhánh code chưa từng chạy để canh
gác đường release, chỉ test được bằng fixture, và tạo attestation hai hình dạng — trong
khi giá trị duy nhất của schema đó là "field chắc chắn có mặt".

Nguồn counsel: `kongming`, phiên 2026-08-15 (mọi claim load-bearing đã verify độc lập).

## Constraints

- **Xoá trong một commit atomic.** Schema, workflow và script assert lẫn nhau; xoá lắt nhắt
  để lại pipeline hỏng theo kiểu mới.
- **Bump `schemaVersion`** của `release-artifact-attestation.schema.json` từ 1 lên 2. Không
  có bump thì "cổng chưa từng tồn tại" đọc y hệt "cổng bị âm thầm bỏ".
- **Không xoá lố.** `--previous-source-tree/-tag/-sha` của `build-binaries.mjs` không thuộc
  cổng consumer — giữ nguyên. `resolve-previous-stable.mjs` cũng vậy.
- Giữ tính xác định của docs bundle: `finalConsumerLock` chỉ được dùng trong
  `validateIdentity()`, **không đi vào nội dung manifest** — nên xoá xong manifest phải
  byte-identical với trước.
- `pnpm test` xanh sau mỗi phase. Brand-drift gate xanh.
- Không commit secret, dotenv, token, khoá riêng, hay đường dẫn tuyệt đối của máy.

## Non-goals

- Không xây entry point verify ở `ariadnev-web`. Nếu sau này repo đó thật sự tiêu thụ
  release asset, dựng lại cổng **từ hợp đồng thật của nó**, không phải từ thiết kế suy đoán
  hiện tại.
- Không đụng `resolve-previous-stable.mjs`, `release-tag-grammar.mjs`, hay cơ chế
  predecessor — chúng độc lập với cổng consumer.
- Không đổi tên repo lần nữa. `bavanchun/ariadnev-kit` là tên chốt.
- Không publish công khai. Repo vẫn private, dùng riêng cá nhân.

## Acceptance criteria

1. `grep -rn "web-consumer\|finalConsumerLock\|final-consumer-lock" packages .github` trả về
   rỗng (trừ ledger/ADR/plan ghi lại quyết định).
2. `release-artifact-attestation.schema.json` có `schemaVersion` const `2`, không còn
   `consumer` ở `required` lẫn `properties`.
3. `pnpm test` xanh; `pnpm lint` xanh; brand-drift clean; `av validate --check` 0 error.
4. `node packages/cli/scripts/build-binaries.mjs` chạy được **không cần** cờ consumer nào.
5. Docs bundle manifest sinh ra sau khi xoá **byte-identical** với bản sinh trước khi xoá
   (cùng input) — chứng minh việc xoá không đổi output.
6. Smoke test chạy từng binary đã build và kiểm exit code + output; nó **fail** khi cố tình
   đưa binary hỏng.
7. Tag `archive/web-consumer-gate` tồn tại, trỏ đúng commit trước khi xoá, **và đã push**.
8. `docs/decisions/0011-*.md` ghi tư thế fork-and-forget với upstream.
9. `pnpm changeset version` không còn lỗi tên package (hoặc không còn changeset nào treo).
10. Mục `1.0.0` trong `CHANGELOG.md` mô tả đúng thứ thật sự phát hành — có nội dung của cả
    hai changeset đang treo, và không còn hứa ràng buộc web-consumer.
11. GitHub có release **`ariadnev@1.0.0`**, kèm 5 binary + `checksums.txt` + docs bundle +
    manifest + schema, và attestation `schemaVersion: 2`.

## Phases

| # | Phase | Ưu tiên | Phụ thuộc | Effort | Trạng thái |
|---|---|---|---|---|---|
| 1 | Chốt việc đang treo + changeset + ADR | P1 | — | 3h | **completed** |
| 2 | Xoá cổng web-consumer (atomic) | P1 | 1 | 4h | **completed** |
| 3 | Smoke test binary thay cho cổng | P1 | 2 | 2h | **completed** |
| 4 | Preflight đường release | P1 | 3 | 3h | **completed** |
| 5 | Cắt `ariadnev@1.0.0` | P1 | 4 | 2h | **in-progress** — cắt lại sau khi finalize lộ 3 lỗi có sẵn |

Chạy tuần tự 1→5. Không phase nào song song được: phase 2 xoá thứ phase 3 thay thế, phase 4
sửa mọi thứ chặn đường trước khi push, phase 5 là phép thử cuối cùng cho cả bốn phase trước.

**Phase 4 sinh ra từ review 2026-08-15.** Bản plan đầu chỉ có 4 phase và giả định push xong
là pipeline chạy. Sai: `release.yml` chạy `changeset version` ở job đầu tiên trên **mọi**
push, và ba thứ độc lập với cổng consumer đang chặn nó. Phát hiện chúng bằng cách push từng
lần một là cách đắt nhất.

## Blocker độc lập với cổng consumer (phát hiện 2026-08-15, đã tự kiểm chứng)

Bốn thứ dưới đây chặn đường release và **không liên quan gì** tới cổng web-consumer. Chúng
chưa bao giờ lộ ra vì pipeline chưa từng chạy quá step đầu tiên. Phase 4 xử lý cả bốn.

1. **`changeset version` lỗi ngay hôm nay.** Cả hai changeset đang treo khai
   `"@ariadnev/cli"`, nhưng package tên `ariadnev` (đổi ở commit rename; changeset viết sau
   vẫn dùng tên cũ và chưa từng được validate). `release.yml:48-54` chạy
   `pnpm run version-packages` ở job **đầu tiên** trên **mọi** push — nên chỉ cần push
   phase 1 là CI đỏ.
2. **Trigger sẽ ra `release=false`.** `release.yml:59-69` chỉ đặt `release=true` khi version
   trong `packages/cli/package.json` khác nhau giữa `$SHA` và `$SHA~1`. Version đã là
   `1.0.0` từ nhiều commit trước, nên push xong pipeline không build gì.
3. **`immutable-releases` đang tắt.** `finalize-release.yml:78` hard-fail nếu API không trả
   `enabled: true`. Kiểm thực tế: `{"enabled": false, "enforced_by_owner": false}`.
4. **`finalize-release.yml` không nối vào `release.yml`.** Nó là `workflow_dispatch` thuần
   với 8 input bắt buộc, chạy từ ref của tag (`DISPATCH_REF` phải là `refs/tags/<tag>`).
   Không có mũi tên tự động nào. Job đó còn khai `environment: core-release-production`
   trong khi repo private gói Free không có environment nào (`total_count: 0`).

Ngoài ra, mục `1.0.0` trong `packages/cli/CHANGELOG.md` (phần Patch) đang **hứa** đúng cái
phase 2 xoá: *"Bind release candidates to the exact web-consumer contract"*. Không sửa thì
1.0.0 phát hành kèm changelog mô tả một tính năng không tồn tại.

## Rủi ro đã biết

| Rủi ro | Tín hiệu nhận biết | Phản ứng đã chọn |
|---|---|---|
| Khái niệm consumer hoá ra load-bearing | Tự tay kiểm "web app còn chạy với release này không" trước khi tag, hoặc một release làm hỏng `ariadnev-web` và chỉ phát hiện lúc dùng | Dựng lại cổng, nhưng từ entry point thật của repo web. Điều kiện hồi sinh ghi trong ledger ở phase 2 |
| Smoke test quá hẹp | Smoke pass nhưng binary hỏng trên máy thứ hai | Mở rộng phạm vi smoke trước, không vội quay lại cổng đầy đủ |
| Xoá lố sang phần predecessor | `build-binaries.mjs` throw "requires the immediate previous stable source" | Phase 2 bước 1 chạy `resolve-previous-stable.mjs --version 1.0.0` lấy baseline; phải vẫn trả `vcskill@0.12.0` sau khi xoá |
| Docs bundle đổi output ngoài ý muốn | Manifest digest lệch so với baseline | Phase 2 bước 2 chụp baseline manifest **trước** khi xoá; so lại ở bước cuối |
| Tổng 5 binary vượt trần 512MB của candidate | `release-candidate-publish.yml:85` / `finalize-release.yml:83` từ chối | Phase 4 build đủ 5 target **trên máy** và cộng byte trước khi push. Nâng trần một cách có ý thức nếu cần — chưa ai từng chạy bản build 5 target |
| `release.yml` hỏng ở chỗ khác chưa lộ | Phase 5 đỏ ở step không thuộc cổng consumer | Không patch vội — đọc log, xác định nguyên nhân, sửa đúng chỗ. Nhưng lưu ý: cắt lại sau khi tag đã tạo cần xoá tag + draft thủ công, vì `release-candidate-publish.yml:128` chặn bằng check "remote state conflict" |
| Push lên `main` lần đầu | **20 commit** chưa push (`git log origin/main..main`), tính từ commit rename | Phase 5 bước 1 liệt kê đúng số đó và xin đồng ý. Đây là đẩy toàn bộ lịch sử port ra remote, không phải vài commit lặt vặt |
| Đổi bất biến trigger có tác dụng vĩnh viễn | Sau này một release bị cắt hai lần vì tag chưa tạo kịp | Phase 4 đổi sang "version hiện tại chưa có tag" — bất biến này tự chặn cắt trùng, chặt hơn cái cũ. Nhưng phải kiểm bằng test |

## Quyết định của người dùng (2026-08-15)

| Câu hỏi | Chốt |
|---|---|
| Cổng web-consumer | **Xoá hẳn** (phương án C) |
| Tư thế upstream | **Fork-and-forget** |
| Có cắt 1.0.0 trong plan này không | **Có** |
| Đường tới 1.0.0 khi version đã nằm sẵn trong `package.json` | **Đổi trigger sang "version hiện tại chưa có tag"**, giữ version 1.0.0 (thay vì lùi về 0.12.0 rồi chạy lại Version-PR flow) |
| `environment: core-release-production` ở finalize | **Xoá dòng đó** — một người bảo trì, repo private; environment protection không bảo vệ khỏi ai |

Quyết định đầu là đảo chiều một quyết định trước đó ("làm có điều kiện"), người dùng đã ký
lại sau khi xem blast radius đo được và counsel. Hai quyết định cuối chốt ngày 2026-08-15
sau khi review phát hiện các blocker độc lập với cổng.

## Việc đã làm trước khi plan này bắt đầu (2026-08-15)

- `vchun/` (22 file, workspace chief-of-staff không liên quan sản phẩm) đã archive ra
  `/Users/vchun/Codes/My-projects/vchun-workspace-archive-2026-08-15.tar.gz` rồi xoá khỏi repo.
- Repo đổi tên `bavanchun/vcskill` → **`bavanchun/ariadnev-kit`**; remote local đã trỏ lại.
- 8 dòng slug sai (trỏ `bavanchun/ariadnev` — repo khác) đã sửa ở `README.md`, `SECURITY.md`,
  `packages/cli/package.json`, `docs/decisions/0002`.
- `.claude/agent-memory/` thêm vào `.gitignore`.

Những thay đổi này **chưa commit** — phase 1 lo việc đó.

## Review

### Phiên 2026-08-15 — `kongming`, go/no-go trên bản plan đầu

**Kết quả: NO-GO.** Phase 1-3 đứng vững; phase 4 (cũ) không thể thành công ở trạng thái repo
hiện tại. Bốn blocker độc lập với cổng consumer đã được chứng minh bằng thực nghiệm (xem mục
riêng ở trên), cộng ba đính chính vào chính lời của tôi:

| Tôi đã nói | Thực tế |
|---|---|
| "2 commit chưa push" | **20** (`git log origin/main..main`), tính từ commit rename |
| Sơ đồ `release.yml → finalize-release.yml` | Sai — finalize là `workflow_dispatch` thuần, phải kích hoạt tay với 8 input |
| Phase 2: "grep `schemaVersion === 1` rồi bump" | Grep đó **cũng trúng schema envelope** (`finalize-release.yml:91`) vốn phải giữ nguyên 1. Chỉ hai chỗ `attestation.schemaVersion` được đổi: `release-candidate-publish.yml:106`, `finalize-release.yml:103` |

Ngoài ra một acceptance criterion không kiểm được như đã viết: `build-binaries.mjs --help` —
script không có handler `--help`, nó throw vì thiếu `--source-sha` bất kể. Đã thay bằng
grep + một lần chạy thật.

Phản hồi: thêm phase 4 (preflight), sửa phase 2 và 3 theo góp ý, viết lại phase 5.
Các mục được giữ vì rẻ và có tải trọng thật: tag lưu trữ, mục ledger, baseline manifest,
test tiêm lỗi cho smoke script, và bước tải binary về máy sạch để kiểm.
