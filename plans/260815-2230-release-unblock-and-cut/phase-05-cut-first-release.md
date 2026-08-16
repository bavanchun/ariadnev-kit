---
phase: 5
title: "Cắt ariadnev@1.0.0"
status: completed
priority: P1
effort: "2h"
dependencies: [4]
---

# Phase 5: Cắt `ariadnev@1.0.0`

## Overview

Chạy đường release end-to-end lần đầu tiên. Đây vừa là mục tiêu, vừa là phép kiểm nghiệm thu
thật sự cho bốn phase trước: pipeline xanh từ đầu tới cuối là bằng chứng duy nhất chứng minh
việc xoá cổng đúng.

## Requirements

- Functional: GitHub có release `ariadnev@1.0.0` với đủ 9 asset, attestation
  `schemaVersion: 2`.
- Non-functional: không bỏ qua bất kỳ cổng nào để pipeline xanh. Đỏ ở đâu thì đọc log, tìm
  nguyên nhân, sửa đúng chỗ.

## Architecture

Chuỗi phát hành **không** tự động hết. Đây là hình dạng thật:

```
push main
   └─ release.yml
        ├─ version-pr          (changesets; detect trigger theo tag-absence)
        ├─ candidate-build     build 5 binary + docs bundle + smoke + attestation
        └─ candidate-publish   kiểm attestation, upload asset, GIỮ release ở DRAFT
                                    │
                        ⟵ dừng ở đây, không tự đi tiếp ⟶
                                    │
   người vận hành dispatch tay:
   gh workflow run finalize-release.yml --ref ariadnev@1.0.0 -f release_id=… -f tag=… (8 input)
        └─ finalize-release    kiểm lại từ nguồn, publish release
```

Bản plan đầu vẽ mũi tên tự động từ `release.yml` sang `finalize-release.yml` — sai.
`finalize-release.yml` là `workflow_dispatch` thuần, assert `DISPATCH_REF === refs/tags/<tag>`
(dòng 76), nên phải chạy **từ ref của tag** với đủ 8 input moi ra từ run publish. Runbook đã
viết ở phase 4 bước 7.

Hai điều đã xác minh trước, để phase này không chết vì thứ ngoài phạm vi:

- **Predecessor giải được:** `resolve-previous-stable.mjs --version 1.0.0` →
  `vcskill@0.12.0` @ `335399f`. Tag mang tên cũ và `release-tag-grammar.mjs` chấp nhận đúng
  điều đó — đây chính là lý do nó tồn tại. Remote có tag này, và workflow checkout với
  `fetch-depth: 0` nên CI sẽ ra cùng kết quả.
- **Tag sinh ra mang tên mới:** `CURRENT_RELEASE_TAG` chỉ nhận `ariadnev@…`, nên release
  này là cái đầu tiên dưới tên mới. Ranh giới đọc-ngược / ghi-xuôi đã đúng.

## Related Code Files

- Modify: không sửa code hay workflow ở phase này. Nếu phải sửa, đó là dấu hiệu phase 2, 3
  hoặc 4 còn sót — sửa ở phase đó, không vá ở đây.

## Implementation Steps

1. **Xác nhận push với người dùng.** Liệt kê chính xác các commit sẽ push:
   `git log origin/main..main --oneline`. Hiện là **20 commit**, tính từ commit rename — tức
   là đẩy toàn bộ lịch sử port ra remote, không phải vài commit lặt vặt. Ràng buộc
   "local only, no push" có từ đầu plan port, nên đây là hành động phải hỏi, không tự quyết.
2. Chạy `pnpm test`, `pnpm lint`, và validate bằng **binary vừa build** hoặc entrypoint của
   workspace — không dùng `av` trên PATH, vì đó có thể là bản cài cũ, tức là đang validate
   bằng code cũ.
3. Push `main`. **Không** chạy `changeset version` — version đã là 1.0.0 và các changeset đã
   được gộp ở phase 1; trigger giờ dựa trên tag-absence.
4. **Theo dõi `release.yml`.** Kỳ vọng: `version-pr` xanh và ra `release=true`,
   `candidate-build` xanh, `candidate-publish` xanh và để lại một release **draft**.
5. Nếu đỏ: phân loại trước khi sửa.
   - Đỏ ở step *từng* thuộc cổng consumer → phase 2 sót; sửa ở phase 2, không vá ở đây.
   - Đỏ ở smoke test → phase 3 sót hoặc binary thật sự hỏng; phân biệt bằng cách chạy binary
     tay trên máy.
   - Đỏ ở trigger / kích thước / dispatch → phase 4 sót.
   - Đỏ ở nơi khác → lỗi tồn tại từ trước, chưa bao giờ lộ vì pipeline chưa từng chạy tới
     đó. Xử lý như bug bình thường: chứng minh nguyên nhân trước khi đổi hành vi.
6. **Kiểm draft trước khi finalize.** Xác nhận 9 asset có mặt, và attestation trong candidate
   mang `schemaVersion: 2` không còn khối `consumer`.
7. **Dispatch finalize** theo runbook phase 4: `--ref ariadnev@1.0.0` cộng 8 input lấy từ run
   publish. Theo dõi tới xanh.
8. Tải một binary **từ release đã publish** về, chạy `--version` và `list` trên máy sạch —
   kiểm thứ người dùng thật sự nhận được, không chỉ thứ CI dựng ra.
9. `git push origin archive/web-consumer-gate` — nếu không push, acceptance criterion về tag
   lưu trữ chỉ tồn tại trên máy này.
10. Cập nhật trạng thái plan; ghi journal.

## Lần finalize đầu tiên: ba lỗi có sẵn (2026-08-16)

Dispatch đầu tiên đỏ sau 5 giây, **trước** mọi thao tác ghi. Đúng nhánh "đỏ ở nơi khác" của
bước 5: cả ba đều là lỗi tồn tại từ trước, chưa bao giờ lộ vì `finalize-release.yml` chưa từng
chạy lần nào. Không cái nào liên quan cổng web-consumer.

**1. `GET /immutable-releases` trả 403 cho `GITHUB_TOKEN`** (`finalize-release.yml:85`).

Đo bằng nhánh thăm dò: job với `contents:write` + `actions:read` → 403
`Resource not accessible by integration`; job với **mọi** quyền read cấp được cho
`GITHUB_TOKEN` → 403 y hệt. Endpoint cần scope administration mà workflow token không thể có.
Máy vận hành đọc được chỉ vì token OAuth mang scope `repo`.

Xoá dòng 85. Bảo đảm không mất: dòng 133 **đã** assert `after.immutable === true` trên object
release (endpoint 200). Đó là kiểm *kết quả* thay vì kiểm *cài đặt* — chặt hơn. Phép kiểm cài
đặt chuyển sang phía dispatch trong runbook, nơi token vận hành đọc được, nên vẫn còn tính chất
"fail trước khi ghi".

**2. `GET /releases/tags/{tag}` trả 404 cho draft** (`finalize-release.yml:127`).

Bản chất endpoint, không phải quyền: release ở trạng thái draft thì không giải được theo tag.
Finalize gọi nó qua `api()` (hard-fail) *trước* PATCH, nên kể cả sau khi sửa lỗi 1 thì lần
dispatch sau vẫn đỏ. Chuyển phép giải-theo-tag sang **sau** PATCH, chỗ nó vừa gọi được vừa có
nghĩa. Bù lại phần mất ở preflight bằng `String(release.id) === releaseId`.

**3. Publisher giải held draft theo tag** (`release-candidate-publish.yml:126`).

Cùng gốc với lỗi 2, hậu quả khác: nhánh `EXACT-NOOP` **không bao giờ đạt được trên production**
— chạy lại cùng SHA không nhận ra draft của chính nó, mà báo "remote state conflict"; và một
draft sót *không có tag* lọt qua cổng xung đột rồi bị đè bằng tag mới. Repo đang có 6 draft sót
(`vcskill@0.6.0`–`0.11.0`), nên không phải giả định. Giải theo listing thay vì theo tag.

### Vì sao test không bắt được

`release-stateful-gh-mock.mjs` trả release cho `/releases/tags/` **bất kể `draft`**, và có
handler cho `/immutable-releases`. Mock dễ dãi hơn thực tế đúng ở hai chỗ production đỏ. Sửa
mock trước, xem test đỏ đúng chỗ, rồi mới sửa workflow — sau đó thêm test cho cổng immutability
hậu-PATCH, ca duy nhất không nằm được trong vòng "fail với zero PATCH" vì nó bắt sau khi PATCH
đã xảy ra.

### Hệ quả: phải cắt lại

`finalize-release.yml` assert `github.workflow_sha === source_sha`, tức file workflow bị ghim
vào commit của tag. Không sửa được nó mà không xoá tag + draft và cắt lại từ commit mới. Đây là
đường retry đã ghi trong runbook, và chỉ dùng được khi release còn là draft — đúng lý do phase 5
dừng trước finalize.

## Success Criteria

- [x] Release `ariadnev@1.0.0` đã publish trên `bavanchun/ariadnev-kit` — id `371194315`,
      `draft: false`, `immutable: true`, `latest`, tại `6bde116`
- [x] Đủ 9 asset: 5 binary, `checksums.txt`, `docs-bundle.tar.gz`,
      `docs-bundle.manifest.json`, `docs-bundle-manifest-v1.schema.json`
- [x] Attestation trong candidate mang `schemaVersion: 2`, không có khối `consumer` —
      xác minh trong dry-run trên draft thật
- [x] `release.yml` xanh tới hết `candidate-publish`; `finalize-release` dispatch tay và xanh
- [x] Binary **tải từ release** chạy được `--version` (`1.0.0`) và `list` (105 skill,
      16 agent, 10 rule); sha256 khớp `checksums.txt`
- [x] Tag `ariadnev@1.0.0` và `archive/web-consumer-gate` đều có mặt trên remote

`immutable: true` là lần đầu tiên tính chất đó được quan sát trong repo này — bốn release cũ
(`vcskill@0.2.0`–`0.5.0`) đều `false` vì có trước khi bật cài đặt. Nghĩa là cổng hậu-PATCH thay
cho dòng 85 không chỉ đúng trên lý thuyết mà đã bắn thật và cho kết quả đúng.

## Risk Assessment

**Rủi ro: pipeline đỏ ở chỗ không liên quan cổng consumer.**
Tín hiệu: step đỏ nằm ngoài danh sách đã sửa ở phase 2, 3, 4.
Phản ứng: nhiều khả năng là lỗi có sẵn chưa bao giờ lộ. Xử lý như bug: chứng minh nguyên
nhân trước khi sửa.

**Rủi ro: cắt lại sau khi tag đã tạo.**
Tín hiệu: cần retry ở một SHA mới trong khi tag `ariadnev@1.0.0` đã tồn tại.
Phản ứng: **phải xoá tag + draft thủ công trước khi retry** —
`release-candidate-publish.yml:128` chặn bằng check "remote state conflict". "Release có thể
cắt lại" chỉ đúng sau bước dọn tay này, không phải tự động.

**Rủi ro: push `main` đảo một ràng buộc đang có hiệu lực.**
Tín hiệu: ràng buộc "local only, no push" từ đầu plan port; 20 commit sẽ ra khỏi máy.
Phản ứng: bước 1 hỏi tường minh và liệt kê đúng danh sách.

**Rủi ro: validate bằng binary cũ trên PATH.**
Tín hiệu: `av validate --check` xanh nhưng CI đỏ ở validate.
Phản ứng: bước 2 chỉ định rõ dùng binary vừa build hoặc entrypoint workspace.

**Giả định:** không có branch protection nào chặn push thẳng `main`. Nếu sai, phát hiện ngay
ở bước 3 và không gây thiệt hại — chỉ mất một vòng.
