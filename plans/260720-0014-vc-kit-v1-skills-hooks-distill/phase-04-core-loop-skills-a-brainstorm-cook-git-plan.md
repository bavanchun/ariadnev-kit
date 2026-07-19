---
phase: 4
title: "Core loop skills A: brainstorm cook git plan"
status: completed
priority: P1
effort: "8h"
dependencies: [1]
---

# Phase 4: Core loop skills A: brainstorm, cook, git, plan

## Overview

Viết lại từ đầu 4 skills usage cao nhất (209/125/111/69 lần dùng): `vc:brainstorm`, `vc:cook`, `vc:git` (rename từ vchun-git), `vc:plan`. Học workflow pattern CK, nội dung tự viết theo khí chất riêng — gọn hơn, tiếng Việt-friendly, không phụ thuộc `ck` CLI.

## Requirements

- Functional: mỗi skill là `kit/skills/{name}/SKILL.md` (+ `references/` khi cần), pass CI gate phase 1, tuân `docs/vc-skill-authoring-spec.md`. **Nội dung tiếng Anh** (validation decision — áp dụng phases 4-6; user vẫn tương tác tiếng Việt khi dùng).
<!-- Updated: Validation Session 1 - skill content in English -->

- **vc:brainstorm**: scout-first gate, discovery bằng AskUserQuestion, present-before-ask, 2-3 approaches + trade-offs, report ra `plans/reports/`, handoff sang vc:plan. KHÔNG có --html/--wiki (YAGNI).
- **vc:cook**: pipeline implement từ plan-path hoặc mô tả; NHÚNG test + code-review logic vào `references/test-gate.md` + `references/review-gate.md` (quyết định brainstorm #4); TDD-first mặc định (chuẩn repo user); commit qua vc:git.
- **vc:git**: từ vchun-git hiện có — rename `vc:git`, giữ conventional commits + co-author flow + prc pipeline; refactor đạt spec (description trigger, ≤300 dòng).
- **vc:plan**: tạo `plans/{date}-{slug}/plan.md + phase-*.md` bằng file thuần (KHÔNG phụ thuộc `ck` CLI — độc lập kit), frontmatter chuẩn (status/priority/effort/blockedBy), checkbox sync-back guard.
- Non-functional: không dependencies ngoài; mọi path cross-platform; nội dung không copy nguyên văn CK (license).

## Architecture

- Cấu trúc chung mỗi SKILL.md: frontmatter → When to Use → Workflow (mermaid nếu >4 bước) → Load-directives tới references → Output format → Quality gates.
- Cross-skill handoff qua đường dẫn file (report/plan path), không qua state ẩn — đúng pattern CK đã verify.
- `vc:cook` là skill dày nhất: dùng `metadata.maxLines: 400` override (phase 1) nếu cần, ưu tiên đẩy chi tiết vào references.

## Related Code Files

- Create: `kit/skills/brainstorm/`, `kit/skills/cook/` (+2 references), `kit/skills/plan/` (+1-2 references)
- Rename: `kit/skills/vchun-git/` → `kit/skills/git/` (frontmatter `vc:git`)
- Create: changeset minor "vc kit core loop A" ghi rõ breaking rename vchun-git→git

## Implementation Steps

1. **Gate first**: xác nhận CI gate phase 1 xanh trên kit hiện tại (đây là "failing test" môi trường — skill mới nào vi phạm sẽ đỏ ngay).
2. Viết `vc:git` trước (rename + refactor — có sẵn nội dung, nhanh, làm mẫu chuẩn spec cho 3 skill sau).
3. Viết `vc:brainstorm` → `vc:cook` → `vc:plan` (thứ tự usage), mỗi skill: draft SKILL.md → tách references → chạy gate → chỉnh.
4. Self-review chéo: dùng chính checklist trong spec doc, đối chiếu từng skill.
5. `pnpm test` xanh + changeset.

## Success Criteria

- [ ] 4 skills pass CI gate (size/frontmatter/description)
- [ ] vc:cook references chứa test-gate + review-gate rõ ràng (thay thế skill test/code-review riêng)
- [ ] vc:plan tạo được plan scaffold không cần `ck` CLI (thử tay 1 lần)
- [ ] Không đoạn văn nào copy nguyên văn từ CK (spot-check)
- [ ] Changeset ghi breaking rename

## Risk Assessment

- Viết skill quality cao tốn thời gian hơn ước tính → chấp nhận cắt scope references (làm mỏng, dày thêm sau), KHÔNG cắt gate compliance.
- vc:plan không dùng `ck` CLI nghĩa là mất kanban/status CLI của CK → chủ đích (độc lập kit); ghi rõ trade-off trong SKILL.md.
