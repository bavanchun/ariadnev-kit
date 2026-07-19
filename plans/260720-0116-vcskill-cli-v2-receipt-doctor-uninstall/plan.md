---
title: "vcskill CLI v2: install receipt + doctor + uninstall + backups + update"
description: "Nâng CLI 4→8 lệnh ngang tầm ck CLI phần lõi: receipt-based ownership, health check, gỡ sạch, restore backup, self-update kit."
status: pending
priority: P1
branch: "main"
tags: [cli, receipt, doctor, uninstall, backups, tdd]
blockedBy: []
blocks: []
created: "2026-07-19T18:30:00.000Z"
createdBy: "ck:brainstorm handoff"
source: skill
---

# vcskill CLI v2: receipt, doctor, uninstall, backups, update

## Overview

ck CLI có 18 lệnh; vcskill có 4. User chốt "chỉn chu đầy đủ": thêm doctor,
uninstall, backups (list/restore), update. Kiến trúc mấu chốt: **install
receipt** — không có receipt thì cả doctor/uninstall/update đều phải đoán.
TDD toàn bộ, giữ chuẩn repo: pure logic tách fs, atomic writes, coverage ≥90%.

Context: `plans/reports/brainstorm-260720-0116-vc-kit-v2-agents-cli-parity-report.md`.
Bỏ chủ đích (v3+): config dashboard, plan kanban, watch/content/api của ck.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Install receipt](./phase-01-install-receipt.md) | Pending |
| 2 | [Doctor command](./phase-02-doctor-command.md) | Pending |
| 3 | [Uninstall + settings un-merge](./phase-03-uninstall-settings-unmerge.md) | Pending |
| 4 | [Backups restore + update + docs](./phase-04-backups-restore-update-docs.md) | Pending |

Tuần tự 1→2→3→4 (2-4 đều đọc receipt từ 1; 3 nặng nhất để giữa; 4 gom phần mỏng).

## Acceptance Criteria (whole plan)

- [ ] Mọi install ghi `.vcskill/receipt.json` (per scope root): files, bindings, version, provider, timestamp — atomic, schema versioned
- [ ] `vcskill doctor` chẩn đúng healthy / degraded (thiếu file, binding lệch, hook không chạy được) / not-installed; exit code 0/1/2
- [ ] `vcskill uninstall` gỡ đúng-những-gì-receipt-ghi, un-merge hook bindings khỏi settings.json (pure fn, không đụng entries lạ), backup trước khi gỡ
- [ ] `vcskill backups list|restore` khôi phục được settings.json/file bất kỳ từ backup last-3
- [ ] `vcskill update` so version receipt vs npm, re-install có backup, báo diff roster
- [ ] `pnpm test` xanh, coverage ≥90%; provider ngoài claude-code không bị lệnh mới làm hỏng (receipt vẫn ghi, uninstall vẫn gỡ đúng)
- [ ] README cập nhật bảng lệnh; changeset minor

## Dependencies

Cross-plan: độc lập với plan agents v2 (kit content). Lưu ý duy nhất: smoke
test của plan agents đếm roster — nếu 2 plan cook song song, merge
install.test.ts cẩn thận (2 vùng test khác nhau, ít đụng).
