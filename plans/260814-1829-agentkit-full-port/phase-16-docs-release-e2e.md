---
phase: 16
title: "Docs, release, e2e install"
status: pending
priority: P2
effort: "4d"
dependencies: [12, 13, 14, 15]
---

# Phase 16: Docs, release, e2e install

## Overview

Ba khoản nợ không có phase nào nhận: nội dung docs (không chỉ tên), quy trình phát hành cho
package đã đổi tên và version `1.0.0`, và một bộ test cài đặt đầu-cuối giữ cho ma trận
provider còn đúng sau khi phase 9-15 sửa đường install.

## Requirements

Functional:
- **Nội dung docs** — phase 2 chỉ đổi tên trong `docs/**`. Kit đi từ 26 → 103 skill,
  3 → 9-10 rules, 6 → 17 hook, thêm 2 artifact kind. Những tài liệu sau **sai nội dung**,
  không chỉ sai tên:
  - `docs/vc-skill-authoring-spec.md` — spec định dạng skill, nay phải mô tả cây file,
    `scripts/`, sub-skill lồng, artifact kind mới
  - `docs/provider-onboarding-guide.md` — ma trận provider đổi sau phase 8
  - `docs/release-and-publish-guide.md` — quy trình đổi sau rename + version 1.0.0
  - `README.md` — bảng lệnh, ma trận provider, cảnh báo state cũ không migrate
- **ADR mới**: `0007` ghi quyết định port đầy đủ artifact adapter dạng phái sinh (phase 15),
  `0008` ghi quyết định thay hết agent/skill/rules bằng bản nguồn.
- **Migration guide** cho chính người dùng: state cũ (`~/.vcskill`, `~/.cache/vcskill`,
  file đã cài) không được nhận diện — hướng dẫn dọn tay.
- **Changeset + release** cho `ariadnev@1.0.0`.
- **E2E install suite**: cài thật vào thư mục tạm cho mọi provider verified, kiểm file đúng
  chỗ, hash đúng, hook bind đúng thứ tự, script chạy được, rồi uninstall sạch.

Non-functional:
- E2E chạy trong CI, không phụ thuộc máy dev cụ thể.
- Docs không lặp lại thứ máy sinh được — trỏ vào `av contract --json` và ma trận sinh tự động.

## Architecture

E2E là lưới an toàn cho một vấn đề thật: bằng chứng provider ở phase 8 là ảnh chụp **một
lần**, chụp trước khi phase 9 sửa hook binding, phase 14 thêm statusline, phase 15 thêm
adapter artifact. Không có gì kiểm lại ma trận sau những thay đổi đó.

E2E chạy trên provider tree giả trong thư mục tạm — không cần cài provider thật, vì nó kiểm
**ariadnev ghi đúng thứ nó khai** chứ không kiểm provider đọc được (cái đó là việc của
phase 8, một lần, thủ công, có ngày).

## Related Code Files

- Modify: `docs/vc-skill-authoring-spec.md` → đổi tên file theo brand mới + viết lại nội dung
- Modify: `docs/provider-onboarding-guide.md`, `docs/release-and-publish-guide.md`
- Modify: `README.md`
- Create: `docs/decisions/0007-adapter-artifacts-derived.md`
- Create: `docs/decisions/0008-full-source-replacement.md`
- Create: `docs/migration-from-vcskill.md`
- Create: `packages/cli/src/install/e2e-install.test.ts` — suite đầu-cuối
- Create: `.changeset/*.md` — major cho `1.0.0`
- Modify: `.github/workflows/ci.yml` — chạy e2e

## Implementation Steps

1. Viết e2e suite trước: cài kit đầy đủ vào tmp cho từng provider verified; assert số file,
   hash khớp receipt, thứ tự hook binding, script executable; rồi uninstall và assert sạch.
2. Chạy e2e — nó sẽ phát hiện những gì phase 9-15 làm lệch so với phase 8. Sửa.
3. Viết lại nội dung 4 tài liệu; bỏ mọi số liệu chép tay, trỏ vào lệnh sinh được.
4. Viết ADR 0007, 0008 và migration guide.
5. Changeset major; chạy thử pipeline release tới bước tạo candidate (không publish).
6. Nối e2e vào CI.

## Success Criteria

- [ ] E2E cài + gỡ sạch cho mọi provider verified, chạy trong CI
- [ ] E2E kiểm được thứ tự hook binding, không chỉ sự tồn tại của file
- [ ] 4 tài liệu phản ánh đúng kit sau port; không còn số liệu chép tay lỗi thời
- [ ] ADR 0007, 0008 tồn tại
- [ ] Migration guide nêu rõ state cũ không được nhận diện và cách dọn
- [ ] Changeset major cho `1.0.0`; pipeline chạy tới candidate không lỗi
- [ ] `pnpm test` xanh

## Risk Assessment

**E2E phát hiện ma trận provider đã sai từ phase 8.** Tín hiệu: bước 2 đỏ. Phản ứng: đó
chính là mục đích — sửa `spec-verified` theo thực tế và cập nhật ADR 0006; không nới e2e.

**Docs lại lỗi thời ngay sau khi viết.** Tín hiệu: số liệu chép tay trong docs lệch với
`av validate`. Phản ứng: docs chỉ nêu con số khi trỏ được vào lệnh sinh ra nó; còn lại dùng
liên kết.
