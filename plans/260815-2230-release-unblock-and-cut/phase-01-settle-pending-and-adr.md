---
phase: 1
title: "Chốt việc đang treo + changeset + ADR"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Chốt việc đang treo + changeset + ADR

## Overview

Đưa working tree về sạch trước khi động vào release pipeline, gỡ hai changeset hỏng đang
làm `changeset version` lỗi, và ghi ra tư thế với upstream AgentKit thành một ADR để lần sau
không phải nghĩ lại.

## Requirements

- Functional: mọi thay đổi đang treo được commit; không còn changeset nào khai sai tên
  package; `docs/decisions/0011-*.md` tồn tại và ghi rõ tư thế fork-and-forget.
- Non-functional: brand-drift gate xanh sau commit; không commit đường dẫn tuyệt đối của máy
  hay nội dung của workspace đã archive; `CHANGELOG.md` mô tả đúng thứ 1.0.0 thật sự chứa.

## Architecture

Không có thay đổi kiến trúc. Đây là phase dọn nền: một commit gom các sửa slug repo, một
commit ADR. Tách hai commit vì chúng trả lời hai câu hỏi khác nhau — "repo tên gì" và "quan
hệ với upstream ra sao".

ADR 0011 ghi ba thứ và chỉ ba thứ:

1. **Tư thế:** kit chốt ở AgentKit 2.12.0; upstream từ đây không còn là nguồn.
2. **Vì sao:** dùng riêng cá nhân, một người bảo trì; chi phí giữ đường diff với upstream
   (giữ ranh giới ported/authored sạch mãi mãi, ghi và cập nhật upstream ref) lớn hơn giá
   trị của các cải tiến upstream chưa biết.
3. **Điều kiện đảo chiều:** nếu sau này thật sự cần một skill mới từ upstream, port thủ công
   *skill đó* như nội dung mới — không dựng lại quy trình re-sync. Ranh giới `metadata.origin:
   ported` và prefix `av-` vẫn giữ, nhưng từ giờ chúng là dữ liệu lịch sử, không phải cơ chế
   đồng bộ.

Không tạo `AGENTKIT_UPSTREAM_REF` hay bất kỳ hạ tầng sync nào — đó chính là thứ tư thế này
từ chối.

### Hai changeset đang treo

`.changeset/ariadnev-full-port.md` (major) và `.changeset/skill-environments-locked.md`
(minor) đều khai `"@ariadnev/cli"`. Package tên **`ariadnev`** — đổi ở commit rename, cả hai
changeset viết sau đó vẫn dùng tên cũ và chưa từng được validate. `changeset version` sẽ
lỗi: *"Found changeset … for package @ariadnev/cli which is not in the workspace"*.

Vì version đã là `1.0.0` và `CHANGELOG.md` đã có mục `1.0.0` (do một lần version thủ công
trước đó), sửa tên package rồi chạy `changeset version` sẽ bump tiếp lên **2.0.0** — không
phải thứ ta muốn. Nên: **xoá cả hai changeset, gộp nội dung của chúng vào mục `1.0.0` sẵn có.**

Kiểm chứng: mục `1.0.0` hiện có ba phần — Major (rename), Minor (CLI xịn, `35acc7d`), Patch
(docs bundle, `335399f`). Nội dung của **cả hai** changeset đang treo đều **chưa** có mặt.
Không gộp thì 1.0.0 phát hành mà changelog không nhắc gì tới 101 skill port lẫn skill env.

## Related Code Files

- Create: `docs/decisions/0011-upstream-is-a-one-time-fork.md`
- Modify: (đã sửa sẵn, chỉ cần commit) `README.md`, `SECURITY.md`,
  `packages/cli/package.json`, `docs/decisions/0002-distribution-standalone-binary.md`,
  `.gitignore`
- Modify: `packages/cli/CHANGELOG.md` — gộp nội dung hai changeset vào mục `1.0.0`
- Delete: `.changeset/ariadnev-full-port.md`, `.changeset/skill-environments-locked.md`

## Implementation Steps

1. `git status --porcelain` — xác nhận đúng 5 file modified, không có gì lạ. `vchun/` đã
   biến mất khỏi danh sách untracked.
2. Đọc lại diff của 5 file (`git diff`) trước khi stage — đặc biệt `packages/cli/package.json`
   để chắc chỉ 3 dòng URL đổi, không đụng `version` hay `scripts`.
3. Commit 1: `chore(repo): point metadata at the renamed repository`.
   Nội dung message nêu tại sao slug cũ sai (trỏ sang một repo khác trong cùng tài khoản),
   không nêu số phase hay nhãn plan.
4. Viết `docs/decisions/0011-upstream-is-a-one-time-fork.md` theo cấu trúc của ADR 0008
   (`0008-porting-upstream-content.md`) — đọc file đó trước để khớp giọng và bố cục.
5. Kiểm tra ADR mới không kích hoạt brand-drift: nó *phải* nhắc tên upstream để nói về
   upstream, nên cần marker `brand-drift-allow` inline nếu gate đỏ. Chạy
   `node packages/cli/scripts/check-brand-drift.mjs` để biết.
6. Commit 2: `docs(decisions): record the one-time fork posture toward upstream`.
7. Gộp nội dung hai changeset vào mục `1.0.0` của `packages/cli/CHANGELOG.md`: phần major
   của `ariadnev-full-port` vào mục Major, phần minor của `skill-environments-locked` vào
   mục Minor. Giữ nguyên văn phong đang có — mô tả thứ đã làm, không nhãn phase.
8. Xoá hai file changeset. **Chưa** đụng dòng Patch hứa ràng buộc web-consumer — phase 2 sửa
   nó cùng lúc với việc xoá, để changelog và code không bao giờ lệch nhau qua một commit.
9. `pnpm changeset status` (hoặc `pnpm changeset version --help` để chắc CLI chạy) — xác
   nhận không còn changeset nào lỗi. **Không** chạy `changeset version` thật ở phase này.
10. Commit 3: `chore(changeset): fold the pending entries into the 1.0.0 changelog`.
11. `pnpm test` toàn bộ — xác nhận baseline xanh trước khi phase 2 xoá thứ gì.

## Success Criteria

- [ ] `git status --porcelain` rỗng
- [ ] `docs/decisions/0011-upstream-is-a-one-time-fork.md` tồn tại, nêu đủ tư thế / lý do /
      điều kiện đảo chiều
- [ ] `ls .changeset/*.md` chỉ còn `README.md`; không còn changeset nào khai `@ariadnev/cli`
- [ ] Mục `1.0.0` trong `CHANGELOG.md` có nội dung của cả hai changeset đã xoá
- [ ] `node packages/cli/scripts/check-brand-drift.mjs` → clean
- [ ] `pnpm test` xanh (baseline cho phase 2 so sánh)
- [ ] `pnpm lint` xanh

## Risk Assessment

**Rủi ro: ADR nhắc tên upstream làm brand-drift đỏ.**
Tín hiệu: gate báo file mới vi phạm.
Phản ứng: thêm marker `brand-drift-allow: <lý do>` inline ngay dòng đó — đúng cơ chế repo đã
dùng ở `release-tag-grammar.mjs:18`. Không mở rộng ALLOWLIST theo prefix thư mục cho một file.

**Rủi ro: diff của `package.json` chứa thay đổi ngoài ý muốn.**
Tín hiệu: bước 2 thấy dòng lạ.
Phản ứng: revert file, sửa lại thủ công đúng 3 dòng URL.

**Giả định:** `pnpm test` vẫn xanh như lần chạy cuối (109 test kit đã chạy lại sau khi sửa
slug, xanh). Nếu bước 7 đỏ, dừng — nguyên nhân nằm ở việc sửa slug, không phải ở plan này,
và phải xử lý trước khi sang phase 2.
