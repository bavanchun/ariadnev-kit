---
phase: 3
title: "vcskill uninstall — gỡ theo receipt + un-merge settings"
status: completed
priority: P1
effort: "5h"
dependencies: [1]
---

# Phase 3: Uninstall + settings un-merge

## Overview

`vcskill uninstall [--provider id] [--global] [--dry-run]` gỡ đúng những gì
receipt ghi. Rủi ro cao nhất toàn plan (đụng settings.json + rm files) — TDD
dày nhất, mọi nhánh phá hoại phải có test.

## Requirements

- Chỉ gỡ paths có trong receipt VÀ đang tồn tại; không bao giờ rm ngoài
  allowedRoots (tái dùng assertWithinRoots). Dọn dir rỗng sau khi gỡ (chỉ dirs
  mà mọi file con đều do mình gỡ).
- Pure `unmergeHookSettings(existingJson, bindings) → json`: gỡ đúng entries
  có command khớp binding; giữ nguyên mọi entry khác; event array rỗng thì xóa
  key; idempotent; throw trên JSON hỏng (như merge). Chỉ chạy khi binding
  `applied: true`.
- AGENTS.md providers: gỡ managed block `<!-- vcskill:start/end -->` (pure fn
  ngược của mergeAgentsBlock), giữ nguyên nội dung user.
- Backup TRƯỚC khi gỡ (settings.json + AGENTS.md + không backup từng skill
  file — quá nhiều; ghi danh sách đã gỡ ra stdout + summary).
- Receipt sau uninstall: xóa record provider đó; provider cuối cùng → xóa
  receipt + hỏi có xóa `.vcskill/backups` không (mặc định giữ).
- `--dry-run` in kế hoạch gỡ, không đụng gì. Non-interactive mặc định yes cho
  file gỡ (đã được receipt xác thực) nhưng KHÔNG tự xóa backups.

## Related Code Files

- Create: `packages/cli/src/uninstall/{uninstall-plan.ts,uninstall-execute.ts}` + tests
- Modify: `packages/cli/src/install/hook-settings-merge.ts` (+unmergeHookSettings) + test
- Modify: `packages/cli/src/install/agents-md.ts` (+removeAgentsBlock) + test
- Create: `packages/cli/src/cli/uninstall-command.ts`; Modify: `index.ts`

## Implementation Steps

1. Tests first: unmerge pure (gỡ đúng, giữ entries lạ, idempotent, applied:false
   không đụng), removeAgentsBlock, uninstall-plan từ receipt fixture → đỏ.
2. Implement pure fns → plan/execute → command.
3. Integration sandbox: install (confirmed merge) → uninstall → assert settings
   về nguyên trạng fixture ban đầu, files sạch, backup tồn tại.
4. Full suite + coverage.

## Success Criteria

- [x] Round-trip install→uninstall trả settings.json (deep-equal) + AGENTS.md (string-exact) về đúng nội dung user ban đầu — test + live CLI run xác nhận
- [x] Không rm path nào ngoài receipt/roots (assertWithinRoots test path-traversal, dùng chung với install)
- [x] Dry-run không side effect (test xác nhận); backup luôn tạo trước khi gỡ thật (backupPath trước unmerge settings/AGENTS.md)

## Risk Assessment

- **Cao nhất**: rm nhầm file user → mitigations: receipt-only + within-roots + dry-run + backup + liệt kê stdout. Không có glob rm, chỉ path từng cái.
- Receipt cũ schema đổi → schemaVersion check, từ chối uninstall với schema lạ (bảo thủ).
