---
phase: 6
title: "Parity report + README + changeset + smoke"
status: completed
priority: P2
effort: "2h"
dependencies: [5]
---

# Phase 6: Đóng plan — parity report, README, changeset, smoke

## Overview

Đóng parity-or-better gate cho cả 10 skills, cập nhật docs công khai, changeset,
xác nhận install smoke.

## Requirements

- `plans/reports/parity-260720-skills-v3a-vs-claudekit-report.md` hoàn chỉnh:
  10 skills × (bảng kept/dropped-lý-do + điểm vượt có evidence file:line);
  obsidian ghi personal/N-A; thêm mục kit-wide wiring (4 cặp skill↔agent sync).
- README: "What's in the kit" phản ánh v3a (cook-grade toàn kit, shared refs);
  không đổi số lượng skill (21 giữ nguyên).
- Changeset minor: rewrite 10 skills + wiring.
- `pnpm test` full: kit-fixtures lint, install smoke (refs mới được copy đúng —
  kiểm tra git refs sau consolidation không 404 trong install).
- Sandbox install 1 provider (claude-code) xác nhận shared refs + git refs mới
  land đúng chỗ.

## Related Code Files

- Create: parity report, `.changeset/vc-kit-v3a-deep-coherence.md`
- Modify: `README.md`
- Read: toàn bộ output phases 1-5

## Implementation Steps

1. Gom parity entries các phase → report hoàn chỉnh.
2. README + changeset.
3. `pnpm test` + sandbox install smoke; sửa roster assertions nếu lệch.
4. Whole-plan sync-back: tick acceptance criteria với evidence.

## Success Criteria

- [ ] Parity report đủ 10 skills, mỗi skill ≥1-2 điểm vượt (obsidian N/A có lý do)
- [ ] README khớp thực tế; changeset minor tồn tại
- [ ] `pnpm test` xanh + sandbox install xác nhận refs mới land đúng
- [ ] plan.md + 6 phase files sync-back đầy đủ, checkbox có evidence

## Risk Assessment

Install smoke lệch do refs đổi tên → cập nhật assertions trong install.test.ts
cùng commit với thay đổi refs (bài học các đợt trước).
