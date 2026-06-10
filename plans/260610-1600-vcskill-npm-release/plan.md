---
title: vcskill npm public release + Changesets automation
description: ''
status: completed
priority: P2
branch: main
tags: []
blockedBy: []
blocks: []
created: '2026-06-10T09:14:01.461Z'
createdBy: 'ck:plan'
source: skill
---

# vcskill npm public release + Changesets automation

## Overview

Hoàn thiện vcskill để cài & test được trên máy khác qua npm public. Engine không đổi.
Việc còn lại = publish-readiness metadata + LICENSE (MIT), tự động hóa release bằng
Changesets, sửa README cho khớp thực tế, smoke-test `install --dry-run` cả 6 provider,
và runbook cho bước prerequisite mà user tự làm tay (npm auth, NPM_TOKEN secret).

Nối tiếp plan `260604-1434-release-ci-providers` (status: done — đã làm packaging,
CI, verify-tarball, provider framework). Plan này KHÔNG đụng adapt engine / spec-verified gating.

**Source design:** [brainstorm-summary.md](./brainstorm-summary.md)

**Decisions (user-confirmed):** npm public tên `vcskill` (không scope) · Changesets ·
MIT · smoke-test 6 provider (claude-code, codex, cursor, opencode, antigravity, generic).

## Acceptance (toàn plan)
- Máy sạch: `npx vcskill@latest install --provider claude-code --dry-run` chạy, resolve kit đúng.
- Merge "Version Packages" PR của Changesets → GHA tự build → verify-tarball → `npm publish` (provenance).
- CI cũ vẫn xanh; 85 test vẫn pass; engine thuần không đổi.
- `install --dry-run` exit 0 cho cả 6 provider, log skip-unverified đúng, không crash.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Publish-readiness metadata + LICENSE](./phase-01-publish-readiness-metadata-license.md) | Completed |
| 2 | [Release automation (Changesets + workflow)](./phase-02-release-automation-changesets-workflow.md) | Completed |
| 3 | [Docs + cross-provider smoke-test + first-publish runbook](./phase-03-docs-cross-provider-smoke-test-first-publish-runbook.md) | Completed |

## Dependencies

<!-- Cross-plan dependencies -->
