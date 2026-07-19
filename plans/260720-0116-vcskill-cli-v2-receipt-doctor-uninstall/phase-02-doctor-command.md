---
phase: 2
title: "vcskill doctor — health check cài đặt"
status: pending
priority: P1
effort: "4h"
dependencies: [1]
---

# Phase 2: Doctor command

## Overview

`vcskill doctor [--provider id] [--global]` so receipt vs thực tế, báo bảng
tình trạng + exit code cho scripting. Tham khảo `ck doctor` nhưng receipt-based
(ck quét heuristic — mình chính xác hơn: điểm vượt).

## Requirements

- Checks per provider trong receipt:
  1. Files: mọi path trong receipt tồn tại (missing → degraded, liệt kê).
  2. Hook bindings (claude-code): mỗi binding `applied:true` có mặt trong
     settings.json hiện tại (user xóa tay → degraded + gợi ý snippet).
  3. Hooks chạy được: spawn `node <hook> ` với stdin `{}` → exit 0 (fail-open
     đúng chuẩn); lỗi spawn → degraded.
  4. Version: receipt vcskillVersion vs package hiện chạy → gợi ý `vcskill update`.
  5. Kit nguồn: `loadKit` pass (gate lint) — báo lỗi kit như một check.
- Không receipt → "not installed (no receipt)" + gợi ý install; vẫn scan
  nhanh path mặc định để phát hiện cài đặt pre-receipt (report-only).
- Output: bảng per provider + tổng kết; exit 0 healthy / 1 degraded / 2 not-installed-hoặc-lỗi.
- Pure core: `diagnose(receipt, fsView, settingsJson) → findings[]` — fs/spawn
  tách adapter mỏng để test không cần cài thật (spawn check mock được).

## Related Code Files

- Create: `packages/cli/src/cli/doctor-command.ts` + `packages/cli/src/doctor/diagnose.ts` (pure) + tests
- Modify: `packages/cli/src/index.ts` (register lệnh)
- Modify: `packages/cli/src/cli/cli-commands.test.ts` (integration qua sandbox install)

## Implementation Steps

1. Tests first: diagnose pure (receipt đủ/thiếu file/binding lệch/no receipt) → đỏ.
2. Implement diagnose → command wiring → integration test sandbox: install rồi
   xóa 1 file → doctor exit 1 nêu đúng file.
3. Full suite + coverage.

## Success Criteria

- [ ] 3 trạng thái + exit codes đúng, có test từng nhánh
- [ ] Degraded liệt kê chính xác từng finding (path/binding cụ thể)
- [ ] Hook-executability check hoạt động trong sandbox

## Risk Assessment

- Spawn hook trên CI Windows path quoting → dùng process.execPath + array args (không shell), như hook tests hiện có.
