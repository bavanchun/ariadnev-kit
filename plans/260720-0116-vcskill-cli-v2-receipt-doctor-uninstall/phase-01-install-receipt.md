---
phase: 1
title: "Install receipt — nền ownership cho doctor/uninstall/update"
status: pending
priority: P1
effort: "4h"
dependencies: []
---

# Phase 1: Install receipt

## Overview

Mỗi lần install ghi receipt liệt kê chính xác những gì vcskill sở hữu tại
target. Doctor/uninstall/update đều đọc receipt — không bao giờ đoán.

## Requirements

- Schema `.vcskill/receipt.json` (cạnh `.vcskill/backups/`, per scope root):
  ```json
  {
    "schemaVersion": 1,
    "vcskillVersion": "<pkg version>",
    "installs": {
      "<providerId>": {
        "timestamp": "...",
        "scope": "project|global",
        "files": ["<abs hoặc root-relative paths đã write>"],
        "agentsMdManaged": true|false,
        "hookBindings": [{"event": "...", "command": "..."}],
        "skipped": [{"kind": "...", "name": "...", "reason": "..."}]
      }
    }
  }
  ```
- Pure builder: `buildReceipt(prevReceiptJson, results, meta) → json` — merge
  per provider (install codex sau không xóa record claude-code), dedupe files.
- Ghi atomic sau `installKit` (kể cả khi settings merge bị từ chối — bindings
  ghi trạng thái `applied: false` để uninstall biết không cần un-merge).
- Dry-run KHÔNG ghi receipt.
- Paths lưu relative-to-root khi nằm trong root (portable khi user move máy).

## Related Code Files

- Create: `packages/cli/src/install/install-receipt.ts` (pure) + `install-receipt.test.ts`
- Modify: `packages/cli/src/install/install-execute.ts` (ghi receipt trong installKit)
- Modify: `packages/cli/src/install/install.test.ts` (assert receipt sau install)

## Implementation Steps

1. Tests first: buildReceipt (empty prev, merge 2 providers, dedupe, dry-run
   không ghi, declined-merge ghi applied:false) → đỏ.
2. Implement pure builder → wire vào installKit (atomic write, tái dùng util).
3. Full suite + coverage.

## Success Criteria

- [ ] TDD đỏ-trước-xanh-sau; receipt xuất hiện sau install thật, không sau dry-run
- [ ] Double-install cùng provider: receipt không phình (idempotent)
- [ ] Coverage ≥90%

## Risk Assessment

- Receipt lệch thực tế nếu user tự xóa file → chấp nhận: doctor (phase 2) chính là công cụ phát hiện lệch; uninstall dùng `force:false` rm từng path tồn tại.
