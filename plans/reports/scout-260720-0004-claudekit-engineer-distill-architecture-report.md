# Scout Report: claudekit-engineer — architecture để chưng cất cho vcskill

Scouted: `/Users/vchun/Documents/claudekit-engineer` | 5 parallel Explore agents | 2026-07-20
Goal: hiểu cách CK làm skill + harness + distribution → distill vào bộ `vc` (vcskill).

## 1. Kiến trúc tổng thể (4 layers)

```
claudekit-engineer/
├── claude/                  # SOURCE of kit (sourceDir trong package.json)
│   ├── skills/    (~90)     # SKILL.md + references/ + scripts/ + assets/
│   ├── agents/    (13)      # subagent .md (frontmatter: name/tools/model/description)
│   ├── hooks/     (12+ managed) # Node.js .cjs + lib/ + __tests__/
│   ├── rules/               # workflow policy md (injected by hook)
│   ├── output-styles/       # coding-level tone (ELI5→God-mode, env-selected)
│   ├── schemas/             # ck-config.schema.json, skill-schema.json
│   ├── session-state/       # persisted progress
│   └── command-archive/     # legacy slash-commands (đã migrate → skills)
├── scripts/   (36)          # release/lint/CI tooling
├── portable-manifest.json   # provider path migrations (version-gated)
├── .releaserc.cjs           # semantic-release
└── docs/ plans/ guide/
```

Layer roles: **Skills** = workflow knowledge; **Agents** = execution personas; **Hooks** = runtime harness (context inject + guardrails); **Scripts/manifest** = distribution.

## 2. Skill anatomy (patterns đáng copy)

- **Progressive disclosure 3 tầng**: (1) frontmatter description <200 chars luôn load → trigger; (2) SKILL.md <300 dòng load khi activate; (3) `references/*.md` <300 dòng/file load on-demand qua marker `Load: references/xxx.md` đặt inline đúng chỗ cần.
- **Frontmatter**: `name: ck:slug` (namespace prefix), `description` "pushy" chứa trigger cụ thể, `user-invocable: true`, optional `allowed-tools`, `metadata`.
- **No duplication**: 1 thông tin sống ở 1 nơi (SKILL.md = core flow, references = detail).
- **Shared code**: `_shared/lib/` (vd plan-table-parser.cjs dùng chung 2+ skills, có test) + `common/` (api_key_helper.py, rotator) — import qua sys.path/require.
- **Scripts**: Python (venv `skills/.venv`) / Node, cross-platform, tests, `requirements.txt`, `.env.example`, exit 0/1, output structured không raw logs.
- **Env hierarchy**: process.env > skill `.env` > `skills/.env` > `.claude/.env` > `~/.claude/...`.
- **Delegation**: dùng ngôn ngữ **MUST** + cú pháp `Task(subagent_type=..., prompt=..., description=...)` tường minh; handoff giữa skills qua **plan.md path** (persistent), không qua task ephemeral.
- **skill-creator** (meta-skill) enforce checklist: name/description/300-line limits/tests/env docs; benchmark 80% accuracy + 20% security; iterate description bằng script.

## 3. Hooks/harness (nguồn của "## Session / ## Rules / ## Naming")

| Hook | Event | Vai trò |
|---|---|---|
| session-init | SessionStart | detect project/pm/framework/branch, load `.ck.json`, ghi ~20 env `CK_*`, resolve active plan, load session-state recovery |
| dev-rules-reminder | UserPromptSubmit | inject rules + paths + naming (build từ `lib/context-builder.cjs`, throttle theo scope key chống inject lặp) |
| subagent-init | SubagentStart | inject ~200 tokens context cho subagent (paths, rules, naming) |
| privacy-block | PreToolUse | block .env/secrets, JSON marker `@@PRIVACY_PROMPT@@` → AskUserQuestion → retry `APPROVED:` prefix |
| scout-block | PreToolUse | block node_modules/dist/.git qua `.ckignore` (gitignore-spec), allow build cmds |
| session-state | PostToolUse/Stop/SubagentStop | persist markdown state `~/.claude/session-states/{cwd-hash}/latest.md`, atomic write, 7-day TTL, 5 archives |
| simplify-gate | UserPromptSubmit | chặn ship/merge khi diff quá lớn (400 LOC/8 files defaults) |
| workflow-artifact-gate, plan-format-kanban, cook-after-plan-reminder, descriptive-name, usage-quota-cache-refresh | misc | soft gates + UX |

Design principles: **fail-open** (mọi hook exit 0 khi lỗi, log JSONL), env-var caching (session-init ghi 1 lần, hooks khác đọc), atomic writes, test bằng `node:test` native (hooks export pure functions, gate bởi `require.main`).

**Top-5 value/complexity cho kit tối giản**: session-init → privacy-block → dev-rules-reminder → scout-block → session-state. (Bỏ qua ban đầu: simplify-gate, artifact-gate, kanban.)

## 4. Agents & orchestration

- 13 agents; frontmatter `name/tools/description(+examples)/model(opus|haiku)/memory`. Model tiering: planner=opus, git-manager+project-manager=haiku, docs-manager=gemini.
- Status protocol: `✓ Step N: ...` markers + blocking gates (tests 100%, user approval).
- `command-archive/` = bằng chứng migration slash-commands → skills; pattern thay thế: SKILL.md + `user-invocable`.
- Plans: `plans/{date}-{issue}-{slug}/plan.md + phase-NN-*.md`, frontmatter status/priority/effort/branch/blockedBy.

## 5. Distribution (đối chiếu vcskill hiện tại)

- `package.json` khai `claudekit.sourceDir/runtimeDir`; **portable-manifest.json** = provider path migrations version-gated (`{provider, type, from, to, since}`) — *vcskill đã có ý tưởng này trong adapt engine + paths.ts*.
- install.sh 1463 dòng: 5 phase state-machine (system deps → node deps → python venv → env migration → verify), resumable qua `.install-state.json`, exit codes 0/1/2 (rustup model), distro abstraction (brew/apt/apk/pacman/dnf), venv fallback uv.
- Release: semantic-release trên main → `prepare-release-assets.cjs` (metadata.json + release-manifest.json SHA-256 checksums + git timestamps) → ZIP GitHub release asset + Discord notify. Beta channel riêng.
- CI quality gates (7 jobs): frontmatter contract validation, skill cross-ref lint, routing coverage (`check-skill-routing.js` — mọi discovery phải nằm trong SKILL.md frontmatter, không global routing file), description lint, content lint **diff-based severity** (file đổi = error, legacy = warning).

## 6. Catalog 84 skills — chọn gì để chưng cất

- 38% self-contained (không API trả phí); ~30 skills phụ thuộc `gh`; 12 paid APIs (Gemini, MiniMax, 5 payment providers...).
- Naming: `ck-` prefix (13) = framework-level workflow abstractions; không prefix (71) = domain skills.
- 5 archetypes: router/dispatcher (nhỏ, delegate), **reference library** (thuần docs — ROI cao nhất, maintenance thấp), script-first executable (phức tạp), MCP/CDP bridge, LLM-driven analysis (thuần reasoning — zero deps).

**High-ROI distill (9)**: ck-code-review, ck-predict, react-best-practices, backend-development, problem-solving, security-scan, ask, bootstrap, sequential-thinking.
**Medium (5)**: frontend-development, databases, test, context-engineering, preview.
**Skip (~60)**: toàn bộ content/media (paid API), cti-expert (114 files, quá chuyên), payment-integration, niche stubs.

## 7. Khuyến nghị cho vcskill (thứ tự làm)

1. **Chuẩn hóa skill spec** trong `kit/`: áp 3-tầng disclosure + limits (<300 dòng) + frontmatter contract; viết `vc:skill-creator` meta-skill từ checklist của họ.
2. **CI gates trước khi thêm skill hàng loạt**: port `check-skill-routing` + frontmatter validation + description lint (diff-based severity) — rẻ, chặn nợ sớm; hợp TDD hiện có.
3. **Harness tối thiểu 5 hooks** (mục 3), fail-open + `node:test`; vcskill installer đã atomic-write nên tái dùng util.
4. **Distill theo archetype**: ưu tiên LLM-driven analysis + reference libraries (zero deps, hợp adapt engine đa provider — không script để rewrite). Script-first skills để sau vì khó adapt cross-provider.
5. **Distribution**: vcskill đã có adapt engine + spec-verified matrix — bổ sung release-manifest checksums + install state-machine nếu cần installer nặng hơn npx.

## Unresolved Questions

1. Bộ `vc` nhắm bao nhiêu skills (ceiling)? 10-15 (lightweight) hay 30+?
2. Có làm harness hooks trong vcskill repo này, hay tách package riêng (`@vc/hooks`)?
3. Provider scope cho hooks: hooks là Claude-Code-specific — adapt engine có cần skip hooks cho providers khác?
4. Reference-library skills (react-best-practices ~51 files) — copy nguyên hay tinh gọn (license của ClaudeKit là commercial — cần xem quyền tái phân phối trước khi copy content)?
5. `frontend-design`/`document-skills` thiếu SKILL.md ở bản scan — deprecated?

## Nguồn chi tiết
- Catalog đầy đủ 84 skills (bảng tier): scratchpad `CATALOGEDIT-SCAN-REPORT.md` (session-local, ephemeral)
- Key files đã trace: `claude/skills/agent_skills_spec.md`, `claude/skills/skill-creator/`, `claude/hooks/lib/{context-builder,ck-config-utils,project-detector,session-state-manager}.cjs`, `scripts/{prepare-release-assets,generate-release-manifest}.cjs`, `scripts/check-skill-routing.js`, `portable-manifest.json`, `.releaserc.cjs`, `claude/skills/install.sh`
