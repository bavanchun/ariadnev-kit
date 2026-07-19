# Brainstorm Report: Bộ `vc` v1 — roster skills + harness hooks chưng cất từ ClaudeKit

Date: 2026-07-20 | Session: brainstorm sau scout claudekit-engineer
Inputs: `scout-260720-0004-claudekit-engineer-distill-architecture-report.md`, `scout-260720-0004-claudekit-engineer-skills-catalog-tiers-report.md`, vividkit.dev/vi/guides/flowchart, usage history 5,117 dòng `~/.claude/history.jsonl`

## Problem statement

ClaudeKit (93 skills) quá lớn so với nhu cầu thực tế; ~60 skills user chưa từng chạm. Cần bộ `vc` gọn, mang khí chất riêng, cài đa provider qua vcskill CLI. Hooks harness của CK đáng học nhưng phải làm lại chất lượng cao hơn (test-first).

## Evidence

### Usage thực tế (top, đã gộp alias)
brainstorm 209 | cook 125 | git+vchun-git 111 | plan 69 | ask 69 | scout 56 | fix 29 | project-management 28 | term-config 25 | problem-solving 20 | ui-ux-pro-max 19 | frontend-design 16 | research 15 | obsidian-note 14 | bootstrap 10 | journal 9 | test 6 | docs 3 | **0 lần**: debug, code-review, ship, vibe, watzup, review-pr, predict.

Caveat: test/code-review/debug được cook/fix gọi nội bộ → usage 0 ≠ vô giá trị.

### vividkit flowchart core
cook+git+test+debug→fix daily; plan/brainstorm khi cần precision — khớp ~90% usage user. vibe/ship họ đẩy mạnh nhưng user không dùng → bỏ.

## Quyết định (user-confirmed, 2026-07-20)

| # | Quyết định | Chọn |
|---|---|---|
| 1 | Scope v1 | **12-14 skills** (chốt 13) |
| 2 | Cách chưng cất | **Viết lại từ đầu** — học pattern (3-tầng disclosure, checklist, workflow), tự viết nội dung. An toàn license (CK là kit thương mại, không rõ quyền tái phân phối trên npm public) |
| 3 | Hooks v1 | **5 hooks đầy đủ minimal** |
| 4 | test/review/debug | **Nhúng vào cook/fix** (trong references/, không tách skill) |
| 5 | Tên git skill | **vchun-git → vc:git** (nhất quán namespace) |

## Roster 13 skills v1

**Core loop (8)**: vc:brainstorm, vc:plan, vc:cook (nhúng test+review logic ở references/), vc:fix (nhúng debug root-cause), vc:git (từ vchun-git), vc:scout, vc:ask, vc:pm
**Support (3)**: vc:problem-solving, vc:research, vc:docs
**Personal (2)**: vc:term-config, vc:obsidian-second-brain-note (đã có trong kit)

**Defer v2**: ui-ux-pro-max, frontend-design (usage khá nhưng giá trị = khối reference content lớn, viết lại đắt nhất). **Skip hẳn**: media/3D/payment/marketing, cti-expert, vibe/ship/watzup/review-pr, reference libraries lớn (license + rewrite cost).

## Harness 5 hooks (`kit/hooks/`, artifact kind mới)

| Hook | Event | Nội dung (gọn hơn CK) |
|---|---|---|
| session-init | SessionStart | detect project/pm/branch, ghi env `VC_*`; bỏ team/quota/coding-level của CK |
| rules-inject | UserPromptSubmit | inject rules + naming + plan context, throttle scope-key |
| privacy-block | PreToolUse | chặn .env/secrets, marker JSON → AskUserQuestion approve flow |
| scout-block | PreToolUse | chặn node_modules/dist/.git qua `.vcignore` (gitignore-spec) |
| session-state | Stop/SubagentStop | persist markdown state, atomic write, TTL 7d, max archives |

Quality bar: fail-open (exit 0 khi lỗi, log JSONL), pure functions export để test, `node:test` viết TRƯỚC (TDD chuẩn repo), atomic writes. Provider gating: hooks chỉ verify cell `(claude, hook)` trong `spec-verified.ts` — provider khác skip-and-log (cơ chế sẵn có của installer).

## Approaches đã cân nhắc

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| 30+ skills copy-modify | Nhanh, đầy đủ | License risk, maintain nặng, 60% không dùng | ❌ |
| 8 core-only | Gọn nhất | Mất support skills đang dùng thật (problem-solving 20×) | ❌ |
| **13 skills viết lại + 5 hooks** | Đúng usage, an toàn license, khí chất riêng | Công viết lại lớn (~vài giờ/skill) | ✅ chọn |

## Risks

1. Viết lại 11 skills = effort lớn nhất; mitigate: build theo usage order, mỗi skill 1 phase.
2. Artifact `hooks` mới đụng adapt engine (pure, ≥90% coverage) — cần TDD trước khi wire installer.
3. Đổi vchun-git → vc:git breaking thói quen gõ; mitigate: alias hoặc note trong CHANGELOG.
4. Quality bar "thật tốt" cho hooks: đo bằng test coverage + fail-open behavior, không đo bằng cảm giác.

## Success metrics

- 13 skills pass CI gate (frontmatter/description lint, <300 dòng SKILL.md)
- 5 hooks: 100% pure-function coverage, fail-open verified bằng test
- `npx vcskill install` cài được kit mới trên máy sạch, provider ≠ claude skip hooks đúng cách
- User thay được ClaudeKit bằng bộ vc trong daily workflow (core loop 8 skills)

## Next steps

1. `/ck:plan` từ report này — đề xuất phases: (1) skill spec + CI gate, (2) hooks TDD + adapt engine hooks kind, (3) core loop skills theo usage order, (4) support skills + migrate personal skills sang chuẩn mới
2. Xem xét `vc:skill-creator` nội bộ (checklist từ CK skill-creator) làm công cụ đợt 1

## Unresolved questions

1. Hooks config file: dùng `.vc.json` riêng hay mở rộng `portable-manifest.json` hiện có?
2. `vc:git` giữ Pair-Extraordinaire co-author flow của vchun-git hay generic hóa khi public npm?
3. ui-ux-pro-max v2: viết lại hay chờ nguồn mở tương đương?
