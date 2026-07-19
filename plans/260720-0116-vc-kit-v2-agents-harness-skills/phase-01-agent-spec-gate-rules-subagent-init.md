---
phase: 1
title: "Agent spec + CI gate + rules thật + subagent-init hook"
status: pending
priority: P1
effort: "4h"
dependencies: []
---

# Phase 1: Agent spec + CI gate + rules + subagent-init

## Overview

Dựng chuẩn TRƯỚC khi viết 13 agents (như phase 1 của v1 đã làm cho skills):
agent authoring spec + lint gate tự động; thay placeholders bằng rules thật;
hook subagent-init để agents nhận context.

## Requirements

- Agent lint chạy trong `loadKit` (DRY với skill-lint pattern): name bắt buộc
  prefix `vc-` + khớp file stem; description 50-1200 chars chứa ≥1 cặp
  `<example>`/`<commentary>`; `tools` là allowlist string/array hợp lệ;
  `model` ∈ {opus, sonnet, haiku} optional; body ≤120 dòng; có heading
  "Behavioral Checklist".
- Spec doc: thêm mục "Agent authoring" vào `docs/vc-skill-authoring-spec.md`
  (KHÔNG tạo doc mới — 1 nguồn chuẩn authoring).
- Rules thật trong `kit/rules/` (3 files, mỗi file ≤80 dòng, tiếng Anh, tự viết):
  1. `development-rules.md` — YAGNI/KISS/DRY, TDD, no-secrets, conventional commits.
  2. `delegation-protocol.md` — khi nào spawn agent nào, context tối thiểu,
     status protocol DONE/BLOCKED/NEEDS_CONTEXT.
  3. `intake-and-context.md` — chưng cất repository-harness: (a) authority
     gate: read-only requests (answer/explain/review/plan/status) không được
     mutate; chỉ change/build/fix mới ghi; (b) risk-flag checklist → lane
     tiny/normal/high-risk (0-1 / 2-3 / 4+ flags hoặc hard gate: auth,
     data-loss, external providers); (c) context budget theo lane (~2K/5K/10K)
     + bounded retrieval "stop when the answer is supported".
- Xóa placeholders: `kit/rules/sample-rule.md`, `kit/commands/sample-cmd.md`,
  `kit/agents/sample-reviewer.md` (gỡ phụ thuộc test trước — install.test.ts
  đang expect sample-reviewer.toml, agents-md test expect "Never commit
  secrets." giữ được vì development-rules sẽ chứa câu tương đương — verify).
- Hook `subagent-init` (SubagentStart nếu Claude Code hỗ trợ event này —
  verify tên event trước khi viết; fallback: mở rộng rules-inject matcher):
  inject ~200 tokens (paths plans/docs/reports, naming pattern, rules digest).
  TDD như 5 hooks v1: fail-open, node:test, <200 LOC.
- Enrich hook `session-state` (trace theo repository-harness TRACE_SPEC):
  thêm vào latest.md danh sách files-changed (đọc `.git` status nhẹ, không
  child_process nếu được — chấp nhận child_process git status vì Stop hook
  không chạy mỗi prompt) + outcome line. TDD bổ sung, giữ fail-open.

## Related Code Files

- Modify: `packages/cli/src/kit/load-kit.ts`, tạo `packages/cli/src/kit/agent-lint.ts`
- Modify: `packages/cli/src/kit/kit-fixtures.test.ts` (negative fixtures agents)
- Modify: `packages/cli/src/install/install.test.ts`, `adapt` tests (bỏ phụ thuộc sample-reviewer → fixture tổng hợp)
- Create: `kit/rules/development-rules.md`, `kit/rules/delegation-protocol.md`
- Create: `kit/hooks/subagent-init/{hook.cjs,hook.json,__tests__/}`
- Delete: 3 sample placeholders
- Modify: `docs/vc-skill-authoring-spec.md` (mục Agent authoring)

## Implementation Steps

1. Tests first: agent-lint negative fixtures (thiếu vc- prefix, không example,
   quá 120 dòng, model lạ) → đỏ → implement → xanh.
2. Verify SubagentStart event trong docs Claude Code hiện hành; viết
   subagent-init TDD (stdin fixture → stdout context; malformed → exit 0).
3. Viết 2 rules files; chạy install smoke xác nhận rules-inject inject nội dung thật.
4. Gỡ phụ thuộc test khỏi samples → xóa samples → suite xanh.
5. Cập nhật spec doc + `pnpm test` full.

## Success Criteria

- [ ] Agent lint đỏ-trước-xanh-sau, chạy trong pnpm test
- [ ] subagent-init fail-open verified, đúng event đã verify với docs
- [ ] Kit không còn placeholder nào; 3 rules thật inject được qua rules-inject
- [ ] session-state trace có files-changed + outcome, TDD, vẫn fail-open
- [ ] Coverage ≥90%

## Risk Assessment

- SubagentStart có thể không tồn tại đúng tên → verify docs trước, fallback ghi rõ trong hook.json description.
- Xóa sample-reviewer gãy adapt/install tests → gỡ phụ thuộc trước (bước 4), pattern đã làm ở v1 phase 6.
