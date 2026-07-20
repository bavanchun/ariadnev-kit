---
phase: 3
title: "Rewrite: problem-solving, journal, docs (RDD-guard), sequential-thinking"
status: completed
priority: P1
effort: "4h"
dependencies: [2]
---

# Phase 3: Rewrite problem-solving, journal, docs, sequential-thinking

## Overview

Nhân template exemplar ra 4 skill tư duy/ghi chép. Mỗi skill: cook-grade 7 mục
+ parity entry.

## Requirements

- **problem-solving**: 6 techniques tách ra `references/` (mỗi technique: khi
  nào dùng, steps, ví dụ); SKILL.md còn router (nhận stuck-pattern → chọn
  technique) + Output format (Stuck-pattern named + Technique output + Next
  action) + gate "đã unstuck thật chưa hay chỉ đổi cách mô tả". Chaining 2 chiều
  với brainstorm.
- **journal**: Output contract entry chuẩn; gate "có lesson thật, không phải
  changelog"; thêm mục friction-line (ghi 1 dòng khi confusion lặp ≥2 lần — nền
  cho v3b wire vào session-state).
- **docs**: thêm **RDD-guard**: docs chuẩn chỉ 5-6 file (overview-pdr,
  code-standards, codebase-summary, system-architecture, roadmap [, deploy]);
  gate cấm tạo doc/ADR mới khi codebase tự nói được; decision mode giữ nguyên;
  comment WHY not WHAT nhắc từ development-rules. Output format cho mỗi mode.
- **sequential-thinking**: workflow thật (decompose → hypothesis → verify từng
  bước → revise), Output format (thought trace + conclusion + confidence),
  gate "mỗi bước có evidence hay chỉ là khẳng định".

## Related Code Files

- Modify: `kit/skills/{problem-solving,journal,docs,sequential-thinking}/SKILL.md`
- Create: `kit/skills/problem-solving/references/*.md` (theo bố cục technique)
- Read: CK counterparts của 4 skill

## Implementation Steps

1. Mỗi skill: đọc CK counterpart → rewrite theo template → lint.
2. problem-solving tách references trước, router sau.
3. `pnpm test` xanh sau mỗi skill; parity entries.

## Success Criteria

- [ ] 4 skills đạt 7 mục cook-grade, ≤120 dòng SKILL.md
- [ ] problem-solving references tách xong, SKILL.md là router thật
- [ ] docs có RDD-guard rõ ràng (danh sách file chuẩn + gate cấm đẻ doc)
- [ ] 4 parity entries, mỗi cái ≥1 điểm vượt

## Risk Assessment

docs RDD-guard đụng hành vi docs-manager agent → sync câu chữ với
vc-docs-manager trong phase 5, không mâu thuẫn.
