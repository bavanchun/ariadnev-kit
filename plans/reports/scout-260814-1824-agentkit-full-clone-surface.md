# Scout Report — AgentKit 2.12.0 full-clone surface

Date: 2026-08-14 · Goal: clone toàn bộ AgentKit thành vcskill (private, personal use)
Source: `ak 2.12.0`, kit `engineer` v0.2.0 (licensed, active) · Target: `vcskill` 0.12.0

## 0. Khối lượng

| | AgentKit 2.12.0 | vcskill | Tỷ lệ |
|---|---|---|---|
| Skills | 103 (`ak-*`) | 26 | 4.0x |
| Markdown files | 842 | 94 | 9.0x |
| Dòng markdown | 162,172 | 7,551 | 21.5x |
| SKILL.md (dòng) | 20,954 / 107 file | 2,827 / 26 file | 7.4x |
| Skill có `scripts/` | 23 | 0 | — |
| Script files (py/sh/mjs/ts) | 154 | 0 | — |
| Agents | 16 | 13 | — |
| Rules | 8 | 3 | — |
| Hooks | 22 (+34 `_lib`, +4 notification) | 6 | 3.7x |
| CLI commands | 46 (9 nhóm, 35 subcommand) | 16 (phẳng) | 2.9x |
| Providers/adapters | 3 (claude-code, codex, cursor) | 7 khai báo, 2 verified đủ | — |

## 1. Skill layer

### 1.1 Cấu trúc file vượt mô hình hiện tại

vcskill `Artifact` = `SKILL.md` + `references/`. AgentKit dùng cây file tự do:

| Pattern | Ví dụ | vcskill hỗ trợ? |
|---|---|---|
| `references/` | 60+ skills | ✅ |
| `scripts/` per-skill | 23 skills, 154 file | ❌ (chỉ có `kit/scripts/` dùng chung) |
| `assets/` | ak-github, ak-journal, ak-use-mcp, ak-markdown-novel-viewer | ❌ |
| `data/` | ak-ai-artist, ak-design, ak-threejs, ak-stitch, ak-ui-ux-pro-max | ❌ |
| `templates/` | ak-copywriting, ak-preview, ak-tech-graph | ❌ |
| `rules/` | ak-react-best-practices (50 md), ak-remotion (30 md) | ❌ |
| `tests/`, `fixtures/` | ak-sequential-thinking, ak-markdown-novel-viewer, ak-goal-warmup, ak-tech-graph | ❌ |
| Sub-skill lồng nhau | ak-document-skills → ak-pdf, ak-docx, ak-pptx, ak-xlsx | ❌ |
| Subdir tuỳ ý (11 cái) | ak-cti-expert: workflows/, analysis/, techniques/, handbook/, engine/, vendor/… | ❌ |
| Font/binary assets | ak-ui-styling `canvas-fonts/` (84 file, 5.8MB) | ❌ |

**Kết luận:** `kit-types.ts` `Artifact` phải đổi từ "1 file + references" sang "cây file có manifest". Đây là thay đổi schema lớn nhất.

### 1.2 Skill lớn nhất

| Skill | Files | KB | Nội dung |
|---|---|---|---|
| ak-cti-expert | 177 | 1,944 | CTI/OSINT suite, 11 subdir, 7 Python + install.sh |
| ak-document-skills | 131 | 2,740 | Meta-skill lồng 4 sub-skill Office |
| ak-design | 163 | 928 | Brand/visual, 16 references, 6 Python |
| ak-ui-styling | 97 | 5,824 | shadcn + 84 file canvas-fonts |
| ak-react-best-practices | 51 | 264 | 50 md trong `rules/` |
| ak-tech-graph | 36 | 304 | agents/ fixtures/ templates/ |
| ak-remotion | 33 | 136 | 30 md `rules/` |
| ak-skill-creator | 30 | 156 | 23 md + 4 Python scaffolding |

Riêng cti-expert + document-skills (308 file) đã lớn hơn toàn bộ kit hiện tại (130 file).

### 1.3 Frontmatter vocabulary

AgentKit dùng ~26 key. vcskill hiện dùng 6.

| Key | AK adoption | vcskill |
|---|---|---|
| name, description | 100% | ✅ |
| category | ~95% | ❌ |
| keywords | ~95% | ❌ |
| user-invocable | ~95% | ✅ |
| metadata.{author,version} | ~95% | ✅ |
| argument-hint | ~90% | ✅ |
| when_to_use | 93% (nhóm A–H) | ❌ |
| license | ~45% | ❌ |
| attribution, title, upstream, status, priority, effort, tags, phase, dependencies, allowed-tools, theme, disable-model-invocation, created, branch, related, maturity, languages | sparse | ❌ |

`validate` của vcskill sẽ reject skill AgentKit nếu không mở rộng schema trước.

### 1.4 Phụ thuộc cứng vào binary `ak` — 7 skills

| Skill | Phụ thuộc |
|---|---|
| ak-ak | Toàn bộ skill là wrapper cho `ak` CLI + JSON envelope |
| ak-cook | `ak plan use/show` (mutating) |
| ak-bootstrap | `ak config prefs resolve --json` |
| ak-fix | `ak config prefs resolve --json` (journal auto-detect) |
| ak-journal | `ak` CLI + `~/.agentkit/config.yaml` |
| ak-plans-kanban | `AGENTKIT_CLI` env |
| ak-show-off | `~/.agentkit/show-off/preferences.json`, `AGENTKIT_HOME` |

Port nguyên si sẽ gãy 7 skill này trừ khi vcskill CLI implement các lệnh tương ứng (`vc plan use/show`, `vc config prefs resolve --json`).

### 1.5 Đồ thị cross-reference

~101 cạnh có hướng giữa 103 skill. Hub: `cook` (15 inbound), `plan` (8), `fix` (7+), `test` (7), `brainstorm` (5+).
27 skill hoàn toàn độc lập (0 cross-ref) — nhóm này port được ngay, không cần thứ tự.

### 1.6 Runtime Python

23 skill chạy Python, dùng chung venv `~/.claude/skills/.venv/bin/python3`.
AgentKit quản lý bằng nhóm lệnh `ak skill {install,verify,repair,upgrade,remove}` (per-skill runtime env, trạng thái ok|missing|corrupt|unknown).
vcskill **không có khái niệm này** — cần xây mới hoàn toàn nếu muốn skill có script chạy được.

## 2. Agent / rules / hooks layer

### 2.1 Agents — AK 16 vs vcskill 13

Map được: `fullstack-developer`→`vc-developer`, `code-reviewer`→`vc-reviewer`, `code-simplifier`→`vc-simplifier`, còn lại 1-1.
**Thiếu 3:** `advisor` (156 LOC, model fable, interview-driven), `kongming` (82 LOC, fable, advisory-only), `ui-ux-designer` (247 LOC, Figma-capable).

### 2.2 Rules — AK 8 vs vcskill 3

Thiếu 5–6: `primary-workflow`, `skill-workflow-routing`, `skill-domain-routing`, `documentation-management`, `process-management`, `review-audit-self-decision`.
Ghi chú: 3 file có ref `ak:` (skill-workflow-routing, development-rules, orchestration-protocol) → cần rewrite khi port.

### 2.3 Hooks — gap code lớn nhất

AK: 22 hook + 34 module `_lib` + 4 notification provider. vcskill: 6 hook.

| Nhóm | Hook AK | vcskill có? |
|---|---|---|
| Session | session-init, subagent-init, session-state, precompact-capture, team-context-inject | một phần |
| Privacy/Security | privacy-block, scout-block, secret-output-guardrail | privacy-block, scout-block |
| Quality gate | descriptive-name, dev-rules-reminder, simplify-gate, typeburn-protect-main | ❌ |
| Plan/workflow | plan-format-kanban, cook-after-plan-reminder | ❌ |
| Usage/statusline | usage-limits-refresh, usage-quota-cache-refresh, 8 module statusline-* | ❌ |
| Notification | discord.cjs, slack.cjs, telegram.cjs, notify.cjs, sender.cjs | ❌ |
| Herdr | herdr-agent-state.sh | ❌ |

`_lib` 34 module gồm: ck-config-utils, hook-logger, project-detector, git-info-cache, session-state-manager/renderer, bounded-json-file, private-json-store, immutable-revision-journal, project-handoff-store, transcript-parser, usage-limits-cache, pr-body-contract, monthly-cost-cache, 8 module statusline, ak-prefs-client (cần binary ak)…

### 2.4 Env vars cần thay tên

`AGENTKIT_HOME`, `AGENTKIT_CLAUDE_HOME`, `AGENTKIT_LANGUAGE`, `AGENTKIT_BIN`, `AGENTKIT_HOOK_DEBUG`, `AGENTKIT_CLI`, `CK_CLAUDE_SETTINGS_DIR` → cần map sang `VCSKILL_*` (vcskill đã có tiền lệ `VCSKILL_TELEMETRY_DISABLED`).

## 3. Adapter / install engine

`~/.agentkit/adapters/` — 3 provider, 43 file.

| Artifact | Vai trò | vcskill tương đương |
|---|---|---|
| `install-manifest.json` v1 | kit + kit_version + file inventory kèm SHA256 + skill_selection (mode/selected/total) | receipt (một phần, không có selection model) |
| `native-skill-paths.json` (118K) | map đường dẫn cài từng file | `resolver.ts` (tính runtime, không materialize) |
| `native-skill-hashes.json` (218K) | SHA256 integrity toàn bộ | ❌ → chặn `audit` drift |
| `native-hook-expectations.json` | hook event graph + matcher per provider | `hook.json` per hook (đơn giản hơn) |
| `cursor-ownership.json` (337K) / `codex-ownership.json` (10K) | registry artifact adapter sở hữu | receipt (một phần) |
| `ck-config.schema.json` (19K) | JSON Schema config người dùng | ❌ |
| `output-styles/coding-level-{0..5}.md` | 6 biến thể prompt style (codex+cursor có, claude-code không) | ❌ |
| `codex-emit-*.log` | log quyết định adapt: `dropped\|narrowed\|ok` + lý do | ❌ |

**Matcher translation:** claude-code hỗ trợ đủ (Write, Edit, Read, Bash, Agent, Task…); codex/cursor bị narrow còn Write/Edit/Bash. Mỗi quyết định drop/narrow được log kèm lý do. vcskill hiện mô hình hoá bằng boolean `isVerified(provider, artifact)` — thô hơn, chưa có per-matcher.

**Install root:** claude-code `~/.claude/`, codex `~/.agents/`, cursor `~/.cursor/`.
Lưu ý: cursor thiếu 1 skill (101 vs 102) — hyperframes không cài được cho cursor.

**ck-config.schema.json** phủ: codingLevel(-1..5), privacyBlock, docs.maxLoc, plan.{naming,dateFormat,issuePrefix,resolutionOrder,validation}, paths.{docs,plans}, locale.{thinking,response}, trust.{passphrase,enabled}, project.{type,packageManager,framework}, skills.*, assertions[], statusline, watch.* (GitHub daemon), content.*.

## 4. CLI surface

AK 46 lệnh / 9 nhóm subcommand / 35 subcommand. vcskill 16 lệnh phẳng.

**JSON envelope trùng khái niệm:** AK `{schema_version, kind, data}` NDJSON-safe; vcskill đã có `contract --json` → port thẳng được.

**Exit codes AK:** 0 ok, 1 runtime/drift, 2 bad flags, 3 cancel, 4 unmet dependency (`run`), 5 not found (`run`), 6 drift without --force (`init`).

**Global flags AK:** `-q/--quiet`, `-V/--verbose`, `--json` (implies --no-interactive), `--no-interactive`, `-y/--yes`.

### Gap ranking

**Tier 1 — cần cho parity thực sự**
1. `ak audit [kit] / audit scripts` — drift detection vs SHA256 manifest (vcskill không có)
2. `ak skill {install,verify,repair,upgrade,remove}` — per-skill runtime env (bắt buộc cho 23 skill Python)
3. `ak run <kit>/<skill>` — chạy skill trực tiếp qua adapter target; vcskill `run` là graph workflow, **mô hình khác hẳn**
4. `ak mcp {add,link,list,remove,show,verify}` — MCP config management
5. `ak kit {install-path,refresh,repair-install-mode,validate}` — kit ops còn thiếu

**Tier 2**
6. `ak skills {search,show,graph}` + `ak agents/commands {install,list,remove,search,show}` — catalog CLI
7. `ak backups {create,verify,prune}` — vcskill mới có list/restore
8. `ak projects` — global project registry (`~/.agentkit/projects.json`)
9. `ak plan` / `ak journal` — plan/journal CLI
10. `ak versions` — version inventory
11. `ak config` + dashboard — config UI cho ck-config schema

**Tier 3 — có thể bỏ**
`gui`, `api`, `watch`, `content`, `content-search`, `sessions`, `activity`, `analytics`, `data`, `diagnostics`, `feedback`, `changelog`, `recover`, `migrate`, `login/logout/whoami/licenses`, `codex-agent-runtime`

## 5. Việc phải làm để "clone y chang"

Theo thứ tự phụ thuộc:

1. **Mở rộng schema kit** — `Artifact` → cây file; hỗ trợ `scripts/`, `assets/`, `data/`, `templates/`, `rules/`, `tests/`, sub-skill lồng nhau, subdir tuỳ ý. Mở rộng frontmatter whitelist (+`category`, `keywords`, `when_to_use`, `license`, `allowed-tools`, `disable-model-invocation`).
2. **Per-skill runtime env manager** — tương đương `ak skill`; venv Python dùng chung + trạng thái ok/missing/corrupt.
3. **Integrity layer** — sinh + kiểm `native-skill-hashes` tương đương; mở khoá `vc audit`.
4. **Hook engine** — port 22 hook + 34 `_lib` module; đổi `AGENTKIT_*` → `VCSKILL_*`; bỏ/thay `ak-prefs-client`.
5. **User config schema** — tương đương `ck-config.schema.json`.
6. **Matcher translation per provider** — nâng `spec-verified.ts` từ boolean lên per-matcher + log drop/narrow.
7. **Port nội dung** — 78 skill còn lại + 3 agent + 5 rules. Bắt đầu từ 27 skill zero-cross-ref.
8. **CLI mở rộng** — Tier 1 trước, subcommand tree.
9. **Rewrite 7 skill phụ thuộc `ak` binary** — hoặc implement `vc plan`/`vc config prefs resolve --json`.

## 6. Câu hỏi chưa giải quyết

1. "Clone y chang" = copy nguyên văn nội dung (đổi `ak:`→`vc:`), hay tiếp tục distill/nén như 26 skill đầu? Hai hướng khác nhau ~21x khối lượng và khác hẳn về công sức.
2. Có clone cả skill nặng asset không — `ak-ui-styling` (5.8MB fonts), `ak-cti-expert` (177 file), `ak-document-skills` (nested sub-skills)? Ba cái này ép phải đổi schema nhiều nhất.
3. Có cần chạy được script Python không, hay chỉ giữ markdown? Nếu chỉ markdown thì bỏ được toàn bộ hạng mục 2 và 3.
4. Giữ 3 provider như AK (claude-code/codex/cursor) hay giữ 7 provider vcskill đang khai báo?
5. `decisions.json` ledger có áp cho skill copy nguyên văn không, hay chỉ áp cho skill distill?
6. Notification (discord/slack/telegram) và statusline có trong phạm vi không?
