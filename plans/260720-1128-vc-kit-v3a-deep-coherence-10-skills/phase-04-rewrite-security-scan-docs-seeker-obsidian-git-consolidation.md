---
phase: 4
title: "Rewrite: security-scan, docs-seeker, obsidian; git references 10→4"
status: pending
priority: P1
effort: "4h"
dependencies: [2]
---

# Phase 4: Rewrite security-scan, docs-seeker, obsidian + git consolidation

## Overview

4 skill còn lại của đợt rewrite. git là ca đặc biệt: SKILL.md đã ổn nhưng 10
references trùng lặp — consolidate, giữ nguyên hành vi.

## Requirements

- **security-scan**: workflow (scope → secret patterns → vuln patterns → triage
  theo severity), Output format (findings table: severity/file:line/pattern/fix),
  Quality gates (mọi finding có file:line thật — không finding "chung chung";
  false-positive check trước khi report; proof-vocab: fix đề xuất ghi rõ cần
  test layer nào). 2 references hiện có giữ, wire chặt vào workflow.
- **docs-seeker**: workflow (xác định lib+version → context7/web → cite),
  Output format (answer + version + source links), gate "đúng version project
  đang dùng, không lấy docs bản khác". Proof/risk wiring: N/A + lý do.
- **obsidian-second-brain-note**: giữ 6 references domain; SKILL.md thêm Output
  contract (note format) + gate (đúng vault convention). Nhẹ nhất trong đợt.
- **git**: consolidate references 10→~4: `workflow-base.md` (commit format,
  staging rules, safety) + `workflow-pr.md` (pr + prc gộp) + `workflow-sync.md`
  (push/pull/merge/rebase) + giữ file đặc thù còn lại nếu không gộp tự nhiên.
  SKILL.md cập nhật link. HÀNH VI GIỮ NGUYÊN — đối chiếu nội dung trước/sau
  từng workflow (không mất rule nào).

## Related Code Files

- Modify: `kit/skills/{security-scan,docs-seeker,obsidian-second-brain-note,git}/SKILL.md`
- Modify/Delete/Create: `kit/skills/git/references/*` (10→~4)
- Read: CK counterparts (security-scan, docs-seeker; obsidian là personal — parity N/A ghi rõ)

## Implementation Steps

1. git consolidation trước (diff nội dung từng rule cũ→mới, checklist không-mất-rule).
2. Rewrite 3 skill còn lại theo template.
3. `pnpm test` xanh; parity entries (obsidian đánh dấu personal/N-A).

## Success Criteria

- [ ] git refs còn ~4 file, checklist không-mất-rule pass, SKILL.md link đúng
- [ ] security-scan, docs-seeker, obsidian đạt 7 mục cook-grade
- [ ] Parity entries xong (obsidian N/A có lý do)

## Risk Assessment

Gộp git refs làm mất rule ngầm → bắt buộc checklist đối chiếu từng dòng rule
cũ→vị trí mới trước khi xoá file cũ.
