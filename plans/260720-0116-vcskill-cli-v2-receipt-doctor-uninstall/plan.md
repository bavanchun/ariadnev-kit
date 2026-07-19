---
title: "vcskill CLI v2: install receipt + doctor + uninstall + backups + update"
description: "Nâng CLI 4→8 lệnh ngang tầm ck CLI phần lõi: receipt-based ownership, health check, gỡ sạch, restore backup, self-update kit."
status: completed
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

## PARITY-OR-BETTER GATE (bắt buộc — như plan agents v2)

Yêu cầu gốc từ user: lõi phải bằng hoặc CAO HƠN ck. Với mỗi lệnh mới:
1. Chạy `ck <cmd> --help` + thử hành vi thật của lệnh ck tương ứng
   (doctor/uninstall/backups/update), liệt kê capability của họ.
2. Mỗi capability: phủ, hoặc bỏ-có-lý-do 1 dòng (khác kiến trúc, YAGNI).
3. Điểm vượt định sẵn phải chứng minh bằng test: **receipt-based chính xác hơn
   heuristic-scan của ck** (doctor không false-positive trên file user tự tạo;
   uninstall không đụng file ngoài receipt — ck uninstall "ownership-aware"
   là mốc phải vượt).
4. Bảng đối chiếu lưu `plans/reports/parity-260720-cli-vs-ck-report.md`,
   hoàn thiện dần qua 4 phases.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Install receipt](./phase-01-install-receipt.md) | ✅ Completed |
| 2 | [Doctor command](./phase-02-doctor-command.md) | ✅ Completed |
| 3 | [Uninstall + settings un-merge](./phase-03-uninstall-settings-unmerge.md) | ✅ Completed |
| 4 | [Backups restore + update + docs](./phase-04-backups-restore-update-docs.md) | ✅ Completed |

Tuần tự 1→2→3→4 (2-4 đều đọc receipt từ 1; 3 nặng nhất để giữa; 4 gom phần mỏng).

## Acceptance Criteria (whole plan)

- [x] Mọi install ghi `.vcskill/receipt.json` (per scope root): files (sha256), bindings, version, provider, timestamp — atomic, schema versioned
- [x] `vcskill doctor` chẩn đúng healthy / degraded (thiếu file, binding lệch, hook không chạy được) / not-installed; exit code 0/1/2 — sandbox + live CLI verified cả 3 trạng thái
- [x] `vcskill uninstall` gỡ đúng-những-gì-receipt-ghi, un-merge hook bindings khỏi settings.json (pure fn, không đụng entries lạ), backup trước khi gỡ — round-trip byte-exact (test + live CLI)
- [x] `vcskill backups list|restore` khôi phục được settings.json/file bất kỳ từ backup last-3 — live CLI: AGENTS.md tampered→restored exact
- [x] `vcskill update` so version receipt vs npm — offline-safe, auto-reinstall bỏ có lý do (scope cut ghi rõ trong parity report, không phải thiếu sót)
- [x] `pnpm test` xanh (218 vitest + 46 node:test), coverage adapt-engine không đổi (99.28%); provider ngoài claude-code không bị lệnh mới làm hỏng
- [x] Parity report `parity-260720-cli-vs-ck-report.md` đủ 4 lệnh: mọi capability ck phủ hoặc bỏ-có-lý-do; điểm vượt receipt-based có test chứng minh
- [x] README cập nhật bảng lệnh (8 lệnh); changeset minor

## Dependencies

Cross-plan: độc lập với plan agents v2 (kit content). Lưu ý duy nhất: smoke
test của plan agents đếm roster — nếu 2 plan cook song song, merge
install.test.ts cẩn thận (2 vùng test khác nhau, ít đụng).
