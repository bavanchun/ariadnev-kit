---
phase: 2
title: "Adapt engine hooks artifact kind"
status: pending
priority: P1
effort: "4h"
dependencies: [1]
---

# Phase 2: Adapt engine hooks artifact kind

## Overview

Thêm artifact kind `hook` vào toàn pipeline: kit loader → spec-verified gate → resolver → installer. Chỉ claude-code verified; provider khác skip-and-log (cơ chế sẵn có). Settings.json merge idempotent + backup.

## Requirements

- Functional: `loadKit` phát hiện `kit/hooks/{name}/` (hook.cjs + hook.json manifest + `__tests__/`); installer copy hooks tới `~/.claude/hooks/vc/{name}.cjs` và merge event bindings vào `~/.claude/settings.json` mục `hooks` **sau khi user xác nhận y/n** (validation decision: prompt-before-merge; tái dùng pattern `cli/prompt-providers.ts`). Non-interactive/từ chối → copy files + in snippet hướng dẫn, không đụng settings.json.
<!-- Updated: Validation Session 1 - settings merge behind interactive prompt -->

- Non-functional: adapt engine giữ pure (no fs) — settings-merge logic là pure function nhận JSON in/out, fs chỉ ở install-execute; coverage ≥90%; merge idempotent (chạy 2 lần = 1 lần); mọi write atomic + backup last-3 (tái dùng `install/backup.ts`).

## Architecture

- `kit/hooks/{name}/hook.cjs` — hook thân; `hook.json` — manifest `{event, matcher?, description}` (data-driven, khớp triết lý engine).
- `kit-types.ts`: `KitHook {name, manifest, file}`; `ArtifactKind` += `"hook"` trong `spec-verified.ts`.
- `SPEC_VERIFIED`: claude-code `hook: true`; codex/cursor/antigravity/opencode/generic `hook: false` (skip-log) — hooks là Claude-Code event contract, không guess provider khác.
- `paths.ts`: `CLAUDE_HOOKS_DIR = ".claude/hooks/vc"` (single source).
- Settings merge: pure fn `mergeHookSettings(existingSettingsJson, hooks[]) → newJson` — thêm entries theo event, dedupe theo command path, không đụng entries không phải của vc. Học pattern managed-block đã verify trong repo (`install/agents-md.ts`: marker + preserve user content + pure).
- Prompt flow: thêm bước confirm trong `install-command.ts` trước khi apply merge op; test cả 3 nhánh (yes/no/non-interactive).

## Related Code Files

- Modify: `packages/cli/src/providers/spec-verified.ts` (ArtifactKind + cells)
- Modify: `packages/cli/src/adapt/paths.ts` (CLAUDE_HOOKS_DIR)
- Modify: `packages/cli/src/kit/kit-types.ts`, `packages/cli/src/kit/load-kit.ts`
- Modify: `packages/cli/src/providers/resolver.ts` (resolve hook target claude-code)
- Create: `packages/cli/src/install/hook-settings-merge.ts` (pure)
- Modify: `packages/cli/src/install/install-plan.ts`, `install-execute.ts`
- Tests: `resolver.test.ts`, `kit-fixtures.test.ts`, tạo `hook-settings-merge.test.ts`, `install.test.ts`

## Implementation Steps

1. **Tests first — lock hiện trạng**: chạy `pnpm test` xác nhận 85 xanh; thêm tests đỏ: (a) loadKit discover hooks fixture; (b) resolver trả path claude-code + skip cho codex; (c) mergeHookSettings: empty settings, existing user hooks giữ nguyên, idempotency (double-apply), dedupe; (d) install plan chứa hook items + skip-log provider khác.
2. Implement: types → spec-verified cells → paths const → load-kit discovery → resolver → merge fn → install plan/execute (atomic + backup settings.json).
3. Chạy full test + coverage report; bù test nếu <90% nhánh mới.
4. Update `README.md` provider matrix (hàng hooks: ✅ claude-code, ⏭ others).

## Success Criteria

- [ ] TDD evidence: tests đỏ trước, xanh sau
- [ ] Double-install không nhân đôi entries trong settings.json (test chứng minh)
- [ ] settings.json của user (entries ngoài vc) không bị mất — test với fixture settings có sẵn hooks lạ
- [ ] Provider ≠ claude: plan hiển thị skip + log line, exit 0
- [ ] Coverage adapt/install ≥90%

## Risk Assessment

- **Cao nhất**: ghi đè settings.json người dùng → mitigate: pure merge + fixture tests + atomic write + backup last-3 + test không-đụng-entries-lạ.
- Claude Code đổi hooks schema tương lai → manifest data-driven, đổi 1 chỗ trong merge fn.
- Rollback: uninstall chưa có trong scope v1 — ghi nhận; backup cho phép user tự khôi phục.
