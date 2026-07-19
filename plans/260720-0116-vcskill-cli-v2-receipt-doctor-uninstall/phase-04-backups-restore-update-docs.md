---
phase: 4
title: "backups list/restore + update + README/docs + changeset"
status: pending
priority: P2
effort: "4h"
dependencies: [2, 3]
---

# Phase 4: Backups restore + update + đóng plan

## Overview

Hai lệnh mỏng còn lại + hoàn thiện docs. Đóng plan bằng sync-back.

## Requirements

- `vcskill backups list [--global]`: liệt kê `.vcskill/backups/<timestamp>/`
  với số file + tuổi. `vcskill backups restore <timestamp> [--file <rel>]
  [--dry-run]`: copy ngược về vị trí gốc (backup layout hiện tại lưu theo
  kind — đọc backup.ts để map path gốc; nếu layout thiếu thông tin path gốc →
  mở rộng backupPath ghi kèm manifest nhỏ, backward-compatible với backups cũ:
  thiếu manifest thì chỉ list, không restore, báo rõ).
- Restore luôn backup-hiện-tại-trước-khi-đè (không mất trạng thái nào).
- `vcskill update [--provider ...] [--global]`: đọc receipt version, so
  `npm view vcskill version` (timeout + offline → báo không check được, exit
  0), nếu mới hơn: hướng dẫn `npx vcskill@latest install ...` hoặc (khi chạy
  từ bản mới) re-install thẳng với backup + in diff roster (skills/agents/hooks
  thêm/bớt so receipt cũ).
- README: bảng lệnh 8 lệnh; docs system-architecture cập nhật receipt flow
  (nếu doc tồn tại — hiện docs/ chưa có file này thì chỉ README). Changeset minor.

## Related Code Files

- Create: `packages/cli/src/cli/{backups-command.ts,update-command.ts}` + tests
- Modify: `packages/cli/src/install/backup.ts` (manifest cho restore) + test
- Modify: `packages/cli/src/index.ts`, `README.md`; Create: changeset

## Implementation Steps

1. Tests first: backup manifest round-trip, restore --file, restore toàn bộ,
   backups cũ không manifest → list-only; update offline → exit 0 → đỏ.
2. Implement → integration sandbox.
3. README + changeset + sync-back toàn plan (vc:pm rules).

## Success Criteria

- [ ] Restore round-trip có test; backups cũ không vỡ
- [ ] update hoạt động offline-safe (không network → không fail)
- [ ] README khớp; changeset; toàn plan completed + checkbox khớp

## Risk Assessment

- Backup layout cũ thiếu path gốc → manifest mới backward-compatible, hành vi degrade rõ ràng (list-only), không đoán path.
