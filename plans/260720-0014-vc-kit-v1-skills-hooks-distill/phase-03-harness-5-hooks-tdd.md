---
phase: 3
title: "Harness 5 hooks TDD"
status: completed
priority: P1
effort: "6h"
dependencies: [2]
---

# Phase 3: Harness 5 hooks TDD

## Overview

Viết 5 hooks trong `kit/hooks/` — học pattern CK nhưng gọn hơn, chất lượng cao hơn: pure functions export riêng, `node:test` viết trước, fail-open tuyệt đối, atomic writes.

## Requirements

- Functional (mỗi hook 1 dir `kit/hooks/{name}/` gồm `hook.cjs`, `hook.json`, `lib/*.cjs` nếu cần, `__tests__/*.test.cjs`):
  1. `session-init` (SessionStart): detect project type/pm/framework/git branch, ghi env `VC_*` (~8 vars, KHÔNG làm team/quota/coding-level như CK), output context ngắn.
  2. `rules-inject` (UserPromptSubmit): inject rules từ `.claude/rules/*.md` + naming pattern + plan context; throttle theo scope-key chống inject lặp.
  3. `privacy-block` (PreToolUse Read/Edit/Write/Bash): chặn `.env*`/credentials/keys (allow `.env.example|sample|template`); JSON marker `@@VC_PRIVACY@@` → AskUserQuestion flow; retry prefix `APPROVED:`.
  4. `scout-block` (PreToolUse Bash/Glob/Grep/Read): chặn node_modules/dist/.git/build qua `.vcignore` (gitignore-spec, hỗ trợ negation); allow build commands (npm|pnpm|go|cargo|make...).
  5. `session-state` (Stop/SubagentStop): persist markdown state `~/.claude/session-states/{cwd-hash}/latest.md`, atomic temp+rename, TTL 7 ngày, giữ 5 archives.
- Non-functional: mọi hook exit 0 khi lỗi nội bộ (fail-open), lỗi log JSONL `~/.claude/logs/vc-hooks.jsonl`; zero npm deps ngoài Node builtin, NGOẠI LỆ scout-block dùng dep `ignore` (validation decision — gitignore-spec đầy đủ, đã proven ở CK; bundle/vendor khi install để hook chạy không cần node_modules); mỗi file <200 LOC (tách lib).
<!-- Updated: Validation Session 1 - scout-block dùng dep ignore -->


## Architecture

- Shared lib: `kit/hooks/_lib/{fail-open.cjs, atomic-write.cjs, jsonl-log.cjs, project-detect.cjs}` — dùng chung, có test riêng. loadKit bỏ qua `_lib` khi discover (prefix `_`).
- Pattern mỗi hook: `main()` gated `require.main === module`; logic thuần export cho test; stdin JSON parse với try/catch → fail-open.
- Thứ tự build theo value: session-init → rules-inject → privacy-block → scout-block → session-state.

## Related Code Files

- Create: `kit/hooks/_lib/*.cjs` + `__tests__/`
- Create: `kit/hooks/{session-init,rules-inject,privacy-block,scout-block,session-state}/{hook.cjs,hook.json,__tests__/}`
- Modify: `packages/cli/src/kit/load-kit.ts` (skip `_lib` dirs) — nếu chưa xử lý ở phase 2
- Modify: root `package.json` scripts: `test:hooks` = `node --test kit/hooks/**/__tests__/*.test.cjs`, gộp vào `pnpm test`

## Implementation Steps

1. **Tests first per hook**: viết `__tests__` mô tả contract (input stdin JSON → stdout/exit code) + edge cases (malformed JSON → exit 0, missing env, path traversal trong privacy-block) → đỏ.
2. Implement `_lib` trước (atomic-write, fail-open wrapper, jsonl-log) với test.
3. Implement từng hook theo thứ tự, xanh dần.
4. Test fail-open bắt buộc mỗi hook: throw giữa chừng → vẫn exit 0 + log JSONL.
5. Manual smoke: cài vào `~/.claude` máy thật (qua `vcskill install` từ phase 2), mở session Claude Code mới, xác nhận context inject + block hoạt động.

## Success Criteria

- [x] 5 hooks + _lib đều có test đỏ-trước-xanh-sau, chạy trong `pnpm test`
- [x] Fail-open verified bằng test cho từng hook (malformed input, fs error)
- [x] privacy-block không thể bypass bằng path tricks (../, symlink, quotes) — test cases cụ thể
- [ ] Manual smoke trên máy thật pass — DEFERRED: sandbox smoke pass; live ~/.claude install chờ user (đụng settings ClaudeKit đang dùng)
- [x] Mỗi file <200 LOC (max 105)

## Risk Assessment

- session-state phức tạp nhất (concurrency, TTL, archive) → làm cuối, có thể cắt sang phase 6 nếu lố effort mà không chặn phase 4-5.
- Dep `ignore` phải chạy được từ `~/.claude/hooks/vc/` không có node_modules → vendor/bundle file vào lib khi install (ignore là single-file, MIT — vendor hợp lệ); test import path sau install.
- Hooks chạy mỗi prompt → perf: đo thời gian chạy <100ms/hook trong test.
