---
phase: 4
title: "Preflight đường release"
status: pending
priority: P1
effort: "3h"
dependencies: [3]
---

# Phase 4: Preflight đường release

## Overview

Sửa mọi thứ chặn đường release mà **không liên quan** tới cổng web-consumer, trên máy, trước
khi push. Bốn blocker này chưa bao giờ lộ ra vì pipeline chưa từng chạy quá step đầu tiên;
phát hiện chúng bằng cách push từng lần một là cách đắt nhất.

## Requirements

- Functional: `changeset version` không lỗi; trigger release nổ đúng cho commit sắp push;
  `finalize-release.yml` schedule được; tổng byte của 5 asset dưới trần candidate.
- Non-functional: mỗi thay đổi trigger phải có test — bất biến mới có tác dụng vĩnh viễn cho
  mọi release sau này, không chỉ cho lần này.

## Architecture

### Đổi bất biến trigger (quyết định B, 2026-08-15)

`release.yml:59-69` hiện đặt `release=true` khi version ở `$SHA` khác version ở `$SHA~1`.
Bất biến đó là **"version vừa đổi"**. Nó hỏng ở đây vì version `1.0.0` đã nằm trong
`package.json` từ 19 commit trước — không commit nào sắp push làm nó "đổi".

Bất biến mới: **"version hiện tại chưa được tag"**.

```
release=true  ⟺  tag ariadnev@$CUR không tồn tại
```

Đọc được vì workflow checkout với `fetch-depth: 0`, tức có đủ tag. Bất biến này chặt hơn
cái cũ ở một điểm quan trọng: nó **tự chặn cắt trùng**. Với bất biến cũ, hai commit liên
tiếp cùng đổi version sẽ cắt hai lần; với bất biến mới, tag tồn tại là đủ để dừng.

Changesets vẫn dùng bình thường cho các release sau: `changeset version` bump version, commit
đó có version chưa được tag → trigger nổ. Hai cơ chế cùng tồn tại tự nhiên.

### Ba sửa còn lại

| Blocker | Bằng chứng | Sửa |
|---|---|---|
| `immutable-releases` tắt | API trả `{"enabled": false, "enforced_by_owner": false}`; `finalize-release.yml:78` hard-fail nếu thiếu | Bật trong repo settings. Không phải sửa code |
| `environment: core-release-production` | Repo private gói Free, `total_count: 0` environment; các tính năng anh em trả 403 "Upgrade to GitHub Pro" | Xoá dòng `environment:` (`finalize-release.yml:24`). Một người bảo trì — protection không bảo vệ khỏi ai |
| Trần 512MB cho candidate | `release-candidate-publish.yml:85`, `finalize-release.yml:83`. Trần binary lẻ là 120MB (`build-binaries.mjs:94`), 5 cái có thể hợp pháp mà tổng 600MB | Build đủ 5 target trên máy, cộng byte thật. Nâng trần **một cách có ý thức** nếu vượt — chưa ai từng chạy bản build 5 target |

### Runbook dispatch finalize

`finalize-release.yml` là `workflow_dispatch` với 8 input bắt buộc, và assert
`DISPATCH_REF === refs/tags/<tag>` (dòng 76). Nghĩa là phải dispatch **từ ref của tag**, và
phải moi `release_id` + bộ `candidate_*` ra từ output của run publish. Không viết sẵn runbook
thì phase 5 sẽ ngồi dịch ngược giữa lúc đang release.

## Related Code Files

- Modify: `.github/workflows/release.yml` — đổi detect step sang bất biến tag-absence
- Modify: `.github/workflows/finalize-release.yml` — xoá dòng `environment:`
- Modify: `.github/workflows/release-candidate-publish.yml`, `.github/workflows/finalize-release.yml`
  — chỉ khi bước đo kích thước cho thấy cần nâng trần
- Create/Modify: test cho detect step trong `packages/cli/scripts/release-workflow.test.mjs`
- Create: `docs/release-and-publish-guide.md` — bổ sung mục runbook dispatch finalize
  (file đã tồn tại; thêm mục, không tạo file mới)

## Implementation Steps

1. **Viết test cho bất biến trigger trước.** Ba trường hợp: version chưa có tag → `true`;
   version đã có tag → `false`; version rỗng/không đọc được → `false` (không được fail-open).
   `release-workflow.test.mjs` đã có sẵn hạ tầng test workflow — đọc nó trước để khớp cách làm.
2. Đổi detect step trong `release.yml`. Giữ nguyên các output khác (`version`, `source_sha`,
   `generated_at`, `source_date_epoch`, `candidate_artifact_name`) — chỉ dòng `release=` đổi.
3. Xoá dòng `environment: core-release-production` khỏi `finalize-release.yml`.
4. Bật immutable releases trong settings repo. Xác nhận bằng
   `gh api repos/bavanchun/ariadnev-kit/immutable-releases` → `enabled: true`.
5. **Build đủ 5 target trên máy** bằng `build-binaries.mjs` (dùng luôn kết quả này cho phase
   3 bước 5 nếu chưa chạy). Cộng byte của toàn bộ asset trong `dist/release/`, so với
   536870912. Ghi con số thật vào phase này.
6. Nếu vượt trần: nâng ở cả bốn vị trí, và ghi lý do bằng con số đo được — không nâng khống.
   Nếu không vượt: ghi con số để lần sau biết còn bao nhiêu dư địa.
7. **Viết runbook dispatch finalize** vào `docs/release-and-publish-guide.md`: lấy
   `release_id` ở đâu, lấy bộ `candidate_*` ở đâu, và lệnh `gh workflow run` kèm
   `--ref ariadnev@1.0.0`.
8. `pnpm test`, `pnpm lint`, brand-drift.
9. Commit: `fix(release): unblock the release trigger and the finalize dispatch`.

## Đo được (2026-08-16, bản build 5 target đầu tiên)

| Asset | Byte |
|---|---:|
| `ariadnev-darwin-arm64` | 86,711,522 |
| `ariadnev-darwin-x64` | 92,258,384 |
| `ariadnev-linux-arm64` | 116,762,768 |
| `ariadnev-linux-x64` | 117,680,256 |
| `ariadnev-windows-x64.exe` | 121,568,256 |
| docs bundle + manifest + schema + checksums | 41,305 |
| **Tổng** | **535,022,491** |

Trần candidate là **536,870,912**. Dư **1,848,421 byte — 0.34%**.

**Không nâng trần.** Chưa vượt, nên nâng bây giờ là nâng khống. Nhưng ghi rõ ở đây
vì dư địa coi như đã hết: thêm vài file kit là bước publish đỏ. Trần mỗi binary
(125,829,120) cũng chỉ còn dư 3.4% ở bản Windows — bản chạm trần trước.

Khi nó gãy, phản ứng đúng là chuyển asset nặng sang sidecar tải lười, không phải
nâng số. `build-binaries.mjs` đã ghi sẵn thông điệp đó ở chỗ kiểm trần binary.

## Success Criteria

- [ ] Test chứng minh detect step trả `true` khi version chưa có tag, `false` khi đã có,
      `false` khi không đọc được version
- [ ] `gh api repos/bavanchun/ariadnev-kit/immutable-releases` → `enabled: true`
- [ ] `finalize-release.yml` không còn dòng `environment:`
- [ ] Tổng byte của `dist/release/` đo được và ghi vào phase này; nếu vượt 536870912 thì
      trần đã nâng ở đủ **4** vị trí kèm lý do
- [ ] `docs/release-and-publish-guide.md` có runbook dispatch finalize đủ để làm theo mà
      không phải đọc lại YAML
- [ ] `pnpm test` xanh, `pnpm lint` xanh, brand-drift clean

## Risk Assessment

**Rủi ro: bất biến trigger mới fail-open.**
Tín hiệu: version rỗng (git show lỗi) mà vẫn ra `release=true`.
Phản ứng: đây là lý do bước 1 có case thứ ba. Bất biến cũ đã đúng ở điểm này (`[ -n "$CUR" ]`);
bất biến mới phải giữ nguyên tính chất đó.

**Rủi ro: giả định "gói Free chặn job có environment" sai.**
Tín hiệu: không có — xoá dòng đó an toàn bất kể giả định đúng hay sai.
Phản ứng: không cần phản ứng. Đây là lý do chọn xoá thay vì đi xác minh: kết quả giống nhau
ở cả hai nhánh, mà rẻ hơn.

**Rủi ro: nâng trần 512MB che một vấn đề thật (binary phình).**
Tín hiệu: tổng vượt trần *nhiều*, không phải sát ngưỡng.
Phản ứng: kit 23MB → ~31MB base64 mỗi binary, cộng Bun runtime. Nếu mỗi binary vượt xa
ước lượng đó, vấn đề là kích thước binary chứ không phải trần — lúc đó `build-binaries.mjs:94`
đã có sẵn thông điệp đúng: chuyển asset nặng sang sidecar, đừng nâng số.

**Rủi ro: bật immutable releases khoá mất đường sửa release lỗi.**
Tín hiệu: phase 5 cần cắt lại nhưng không xoá được release cũ.
Phản ứng: đó chính là ý nghĩa của immutable. Bật **trước** khi release đầu tiên tồn tại, nên
không có gì để mất. Nếu phase 5 cần cắt lại, xoá tag + draft trước khi retry —
`release-candidate-publish.yml:128` chặn bằng check "remote state conflict".
