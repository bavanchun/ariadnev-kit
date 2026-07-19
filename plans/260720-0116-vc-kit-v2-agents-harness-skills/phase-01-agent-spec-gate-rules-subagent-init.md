---
phase: 1
title: "Agent spec + CI gate + rules thật + subagent-init hook"
status: completed
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
     + bounded retrieval "stop when the answer is supported"; (d) harness
     delta: mỗi change có thể sinh output thứ 2 — cải thiện rules/skill/doc
     khi gặp friction lặp (ghi qua vc:journal, không sửa ngẫu hứng giữa task).
- Xóa placeholders: `kit/rules/sample-rule.md`, `kit/commands/sample-cmd.md`,
  `kit/agents/sample-reviewer.md` (gỡ phụ thuộc test trước — install.test.ts
  đang expect sample-reviewer.toml, agents-md test expect "Never commit
  secrets." giữ được vì development-rules sẽ chứa câu tương đương — verify).
- Hook `subagent-init` (event `SubagentStart` — VERIFIED tồn tại: CK đang bind
  nó tại `~/.claude/settings.json:454`): inject ~200 tokens (paths
  plans/docs/reports, naming pattern, rules digest). TDD như 5 hooks v1:
  fail-open, node:test, <200 LOC.
- Ghi chú adapt chủ đích: agent frontmatter `model`/`memory` chỉ có nghĩa với
  claude-code; `agent-to-toml` (codex) drop 2 field này — hành vi đúng, ghi
  vào docs/vc-skill-authoring-spec.md mục Agent authoring để không ai tưởng bug.
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
3. Viết 3 rules files; chạy install smoke xác nhận rules-inject inject nội dung thật.
4. Gỡ phụ thuộc test khỏi samples → xóa samples → suite xanh.
5. Cập nhật spec doc + `pnpm test` full.

## Success Criteria

- [x] Agent lint đỏ-trước-xanh-sau (agent-lint.test.ts + kit-fixtures.test.ts), chạy trong pnpm test
- [x] subagent-init fail-open verified (node:test), event SubagentStart xác nhận qua CK settings.json:454 + sandbox smoke thật
- [x] Kit không còn placeholder nào (sample-rule/sample-cmd/sample-reviewer xóa); 3 rules thật inject được qua rules-inject (AGENTS.md merge test)
- [x] session-state trace có files-changed + outcome (gitFilesChanged, TDD), vẫn fail-open
- [x] Coverage ≥90% (99.28%, 139 vitest + 46 node:test)

## Risk Assessment

- ~~SubagentStart có thể không tồn tại~~ RESOLVED: verified tồn tại (CK bind tại settings.json:454). Vẫn re-check docs chính thức khi viết hook.json.
- Xóa sample-reviewer gãy adapt/install tests → gỡ phụ thuộc trước (bước 4), pattern đã làm ở v1 phase 6.
