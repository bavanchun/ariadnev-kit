---
phase: 3
title: "Kit schema tối thiểu + frontmatter thật"
status: pending
priority: P1
effort: "2d"
dependencies: [2]
---

# Phase 3: Kit schema tối thiểu

## Overview

Bản plan trước cho rằng phải đổi `Artifact` sang cây file mới copy được 103 skill. Sai:
`skillFiles()` đã duyệt cây sâu tuỳ ý với ignore list đầy đủ. Phase này chỉ làm phần thật
sự thiếu — thống nhất một walker, và mở whitelist frontmatter đúng theo nguồn thật.

Effort giảm từ 3d xuống 1d vì phần lớn công việc đã có sẵn.

## Requirements

Functional:
- **Thêm artifact kind `outputStyle`.** Nguồn có 6 file `output-styles/coding-level-{0..5}.md`
  mà runtime phát ra thư mục `output-styles/` của provider; skill `coding-level` vô dụng nếu
  thiếu. `ArtifactType` hiện chỉ có `skill|agent|command|rule`. Resolver phải biết đường dẫn
  `output-styles/` cho từng provider — nguồn cho thấy codex và cursor có, claude-code không.
  Ô mới trong ma trận `spec-verified` phải verify ở phase 8, không mặc định `true`.
- **Tạo `kit/commands/`.** `ArtifactType` đã có `"command"` nhưng thư mục không tồn tại.
  Nguồn có 1 slash command (`term-config.md`). Dựng thư mục + fixture để loader và installer
  có đường đi thật cho kind này.
- Một ignore list dùng chung giữa `load-kit.ts` và `artifact-content.ts`, không hai bản.
- Whitelist frontmatter mở rộng **chỉ** theo field grep được ở 103 `SKILL.md` nguồn.
- Sub-skill lồng nhau (`document-skills` → pdf/docx/pptx/xlsx) cài ra đúng cấu trúc.

Non-functional:
- **Không** thêm `files[]` hay `children[]` vào `Artifact`. Type đó có 20 module import;
  thêm field eager nghĩa là dựng entry cho ~1511 file mỗi lần gọi CLI.
- Whitelist vẫn phải bắt được typo. Không biến nó thành allow-everything.

## Architecture

`IGNORE_DIRS`/`IGNORE_FILES` đang sống ở `install-types.ts:47-58` và chỉ installer dùng.
Export chúng, cho `load-kit.ts` import — thay vì `load-kit` tự liệt kê lại, vì hai list
lệch nhau nghĩa là `av validate` xanh trên tập file mà installer không bao giờ ghi.

Sub-skill: kiểm trước xem `skillFiles()` đã cài đúng chưa. Cây lồng chỉ là thư mục con —
nhiều khả năng đã chạy. Chỉ thêm biểu diễn khi kiểm chứng thấy thiếu.

Frontmatter: `metadata` đã là escape hatch lồng cho field tuỳ ý (`git/SKILL.md:9` dùng nó).
Field nào không phải vocabulary skill thật thì đi qua đó, không nống whitelist.

## Related Code Files

- Modify: `packages/cli/src/install/install-types.ts` — export `IGNORE_DIRS`, `IGNORE_FILES`
- Modify: `packages/cli/src/kit/load-kit.ts` — import ignore list dùng chung
- Modify: `packages/cli/src/kit/skill-lint.ts` — `ALLOWED_FIELDS` theo grep nguồn
- Modify: `packages/cli/src/kit/kit-fixtures.test.ts` — fixture có cây sâu + sub-skill lồng
- Modify: `packages/cli/src/kit/reference-integrity.ts` — link tương đối trong thư mục sâu
- Modify: `packages/cli/src/kit/kit-types.ts` — `ArtifactType` thêm `"outputStyle"`
- Modify: `packages/cli/src/providers/resolver.ts` — đường dẫn `output-styles/` per provider
- Modify: `packages/cli/src/providers/spec-verified.ts` — ô `outputStyle` (mặc định `false`)
- Create: `kit/commands/` — thư mục + ít nhất một command

## Implementation Steps

1. Grep frontmatter thật của cả 103 `SKILL.md` nguồn, lập tập field chính xác. Đối chiếu
   với `ALLOWED_FIELDS` hiện có (`skill-lint.ts:21-31`) — `allowed-tools`,
   `disable-model-invocation`, `license` đã có rồi, đừng thêm lại.
2. Loại khỏi danh sách mọi field là header **plan file** (`title`, `status`, `priority`,
   `effort`, `phase`, `dependencies`, `branch`, `created`, `theme`) trừ khi grep chứng minh
   `SKILL.md` nguồn thật sự dùng.
3. Test đỏ: fixture skill có sub-skill lồng — `planInstall` phải sinh op cho cả cây con.
4. Chạy thử `skillFiles()` trên `ak-cti-expert` (177 file, 11 subdir) và
   `ak-document-skills` (131 file, nested) trực tiếp; ghi lại cái gì đã chạy, cái gì thiếu.
   **Chỉ implement phần thiếu thật.**
5. Export ignore list; sửa `load-kit.ts` dùng chung; test rằng hai bên trả cùng tập file.
6. `av validate` trên kit hiện tại — không đổi kết quả.

## Success Criteria

- [ ] `Artifact` không có field mới nào
- [ ] `load-kit.ts` và `artifact-content.ts` dùng chung một ignore list; test chứng minh
      hai bên trả cùng tập file cho một skill có `.venv`/`node_modules`
- [ ] Frontmatter thật của 103 skill nguồn lint sạch
- [ ] Không field nào trong whitelist mà grep nguồn không tìm thấy
- [ ] `document-skills` fixture cài ra đủ 4 sub-skill, mỗi cái có `SKILL.md` riêng
- [ ] `ArtifactType` có `outputStyle`; ô mới trong ma trận mặc định `false` chờ phase 8
- [ ] `kit/commands/` tồn tại và loader nạp được command
- [ ] `av validate` trên kit hiện tại vẫn 26 skills / 13 agents / 6 hooks, all passed
- [ ] `pnpm test` xanh

## Risk Assessment

**Bước 4 có thể phát hiện `skillFiles()` thiếu nhiều hơn dự đoán.** Tín hiệu: `cti-expert`
hoặc `document-skills` cài ra sai cấu trúc. Phản ứng: mở rộng `skillFiles()` tại chỗ —
vẫn rẻ hơn nhiều so với đổi `Artifact` và nuôi hai walker.

**Whitelist mở rộng làm typo lọt qua.** Tín hiệu: `SKILL.md` có key sai chính tả mà lint
xanh. Phản ứng: field nào không nằm trong tập grep được từ nguồn thì vẫn là lỗi cứng; đó
là lý do bước 1 phải grep thật thay vì chép danh sách từ bản plan cũ.
