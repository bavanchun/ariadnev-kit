---
phase: 5
title: "Core loop skills B: ask scout fix pm"
status: pending
priority: P2
effort: "6h"
dependencies: [4]
---

# Phase 5: Core loop skills B: ask, scout, fix, pm

## Overview

Viết 4 skills còn lại của core loop (usage 69/56/29/28): `vc:ask`, `vc:scout`, `vc:fix`, `vc:pm`. Phase 4 đã tạo mẫu chuẩn — phase này nhân bản pattern, nhanh hơn.

## Requirements

- Functional:
  - **vc:ask**: Q&A kỹ thuật/kiến trúc, honest trade-offs, KHÔNG sửa code; size S (CK bản gốc 1 file — giữ tinh thần đó).
  - **vc:scout**: quét codebase song song bằng Explore subagents, chia vùng không overlap, report format chuẩn (Relevant Files + Unresolved Questions); bỏ chế độ external Gemini/OpenCode của CK (YAGNI — user không dùng).
  - **vc:fix**: NHÚNG debug root-cause vào `references/root-cause.md` (quyết định brainstorm #4): reproduce → hypothesis → prove → fix → verify; routing nhẹ theo loại lỗi (type/lint/test/CI/runtime); prove-before-fix bắt buộc.
  - **vc:pm**: track plans trong `plans/*/plan.md`, sync checkbox ↔ frontmatter status (sync-back guard toàn plan — không chỉ phase active), status report ra `plans/reports/`; tương thích format vc:plan (phase 4).
- Non-functional: pass CI gate; zero deps; mỗi SKILL.md ≤300 dòng.

## Architecture

- vc:fix và vc:pm liên kết chặt với vc:plan format — đọc lại phase 4 output trước khi viết để khớp frontmatter/checkbox conventions (1 nguồn sự thật: spec doc phase 1, bổ sung mục plan-format nếu thiếu).
- vc:scout prompt template cho Explore agents: scope dirs + report format + Status line — chưng cất từ chính session scout đã chạy tốt hôm nay.

## Related Code Files

- Create: `kit/skills/ask/SKILL.md`
- Create: `kit/skills/scout/SKILL.md` (+`references/agent-prompt-template.md`)
- Create: `kit/skills/fix/` (+`references/root-cause.md`)
- Create: `kit/skills/pm/` (+`references/sync-back.md`)
- Create: changeset minor "vc kit core loop B"

## Implementation Steps

1. Gate xanh trên kit sau phase 4 (baseline).
2. Viết theo thứ tự usage: ask → scout → fix → pm; mỗi skill draft → gate → chỉnh.
3. Cross-check vc:pm sync-back với plan thật (dùng chính plan này làm fixture thử tay).
4. `pnpm test` + changeset.

## Success Criteria

- [ ] 4 skills pass CI gate
- [ ] vc:fix có quy tắc prove-before-fix tường minh (không cho fix mù)
- [ ] vc:pm sync-back test tay trên plan này: đổi 1 checkbox → status/progress cập nhật đúng
- [ ] Không copy nguyên văn CK

## Risk Assessment

- vc:pm sync-back logic phức tạp nếu viết thành lời — giữ mức quy tắc + checklist cho LLM thực thi, KHÔNG viết script parse (YAGNI v1; script hóa để v2 nếu lỗi lặp).
- 8 skills tổng sau 2 phase dễ trôi tone/format → dùng vc:git (phase 4) làm reference mẫu, spot-check chéo cuối phase.
