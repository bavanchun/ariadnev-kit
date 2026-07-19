# Brainstorm: vc kit v2 — agents roster + CLI parity để thay thế dần ClaudeKit

Date: 2026-07-20 | Follow-up của brainstorm 260720-0014 (v1 đã ship: 12 skills + 5 hooks)
Inputs: 16 agents cài tại `~/.claude/agents/` (đọc kỹ 9 con chủ lực), `ck --help` (18 lệnh), 2 scout reports 260720-0004, usage history.

## Problem statement

vc kit v1 có skills + hooks nhưng **không có agents thật** (chỉ sample-reviewer placeholder) — trong khi các skill vc (cook/fix/scout) đang delegate sang agents; rules trong kit cũng là placeholder. CLI vcskill (4 lệnh) thiếu doctor/uninstall/update/backups so với ck CLI (18 lệnh). User muốn vc thay thế dần ClaudeKit, phong cách riêng nhưng ai cũng dùng được.

## Evidence — CK agents làm gì hay (đáng học + vượt)

1. **Persona + Behavioral Checklist**: mở đầu bằng danh tính cụ thể ("You are a Staff Engineer...") + checklist bắt buộc trước khi nộp — phần ép chất lượng mạnh nhất.
2. **Description chứa `<example>`+`<commentary>`** → auto-delegation chính xác.
3. **Model tiering**: opus (planner) / sonnet (debugger) / haiku (tester, git, pm, docs, explore).
4. **Verification discipline** (planner): re-grep đừng copy, cite file:line, trace đừng assume, enumerate callers.
5. **Anti-AI-slop posture** (code-reviewer): soi phantom tests, catch-and-swallow, praise-padding.
6. **Diff-aware mode** (tester): map changed files → tests, auto-escalate full suite.
7. **Agent ↔ Skill pairing**: agent = persona, skill = workflow knowledge; agent chỉ "activate X skill".

Điểm yếu CK để vượt: agent phình (docs-manager 227 dòng), description dài, coupling vào hạ tầng CK (`set-active-plan.cjs`, `.ck.json`), một số con lai tạp nhiều concern.

## Gaps hiện tại

| Mảng | Gap |
|---|---|
| Agents | 0 agent thật — gap lớn nhất |
| Rules | kit ship sample-rule; hook rules-inject không có gì thật để inject |
| Hooks | thiếu subagent-init (inject context cho subagent) |
| Skills | thiếu theo usage: journal 9×, bootstrap 10×; meta: skill-creator |
| Commands | CK đã bỏ commands→skills; nên xóa sample-cmd, không đầu tư artifact này |
| CLI | thiếu doctor, uninstall, backups restore, update (config dashboard/kanban → v3) |

## Rà soát catalog CK còn lại (user yêu cầu)

Lấy: security-scan, predict (zero-deps, top-ROI), scenario, worktree (user chốt lấy rộng).
Không lấy: review-pr/code-review standalone (usage 0, vc-reviewer agent gánh), watzup (session-state hook phủ một phần), retro/context-engineering (usage thấp), react-best-practices + frontend-design + ui-ux cụm UI (reference libraries đắt nhất, license risk — **v3 riêng**), media/payment/niche (bỏ hẳn).

## Quyết định (user-confirmed, 2026-07-20)

| # | Topic | Quyết định |
|---|---|---|
| 1 | Agent roster | **Full 13** (như CK, hoãn ui-ux-designer sang v3): vc-explore, vc-planner, vc-brainstormer, vc-reviewer, vc-simplifier, vc-tester, vc-debugger, vc-developer, vc-git-manager, vc-docs-manager, vc-project-manager, vc-researcher, vc-journal-writer |
| 2 | Naming | **Prefix `vc-`** — nhận diện thương hiệu, cài song song không đụng agents CK (đúng chiến lược thay thế dần); phần "hồn riêng" nằm ở persona/checklist bên trong |
| 3 | Skills v2 | **21 skills** = 12 hiện có + skill-creator, journal, bootstrap, sequential-thinking, docs-seeker, security-scan, predict, scenario, worktree |
| 4 | CLI | **doctor + uninstall + backups restore + update** — "chỉn chu đầy đủ"; nền tảng = install receipt |
| 5 | Triển khai | **Approach B, tạo cả 2 plans ngay**: plan agents+harness+skills riêng, plan CLI riêng |

## Approaches đã cân nhắc

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| A: 1 mega-plan 9 phases | 1 chỗ theo dõi | Trộn content-authoring với TS/TDD khác nhịp, khó ship giữa chừng | ❌ |
| **B: 2 plans độc lập** | File ownership tách bạch (kit/ vs packages/cli/), ship độc lập, cook song song được | 2 plan phải tự theo dõi | ✅ chọn |

## Công thức agent vc (chuẩn viết mới, vượt CK)

- ≤120 dòng/agent; frontmatter: `name: vc-*`, description có 2-3 `<example>`, `tools` allowlist tối thiểu, `model` tiering (opus: planner, brainstormer; sonnet: reviewer, debugger, developer; haiku: explore, tester, git, docs, pm, researcher, journal, simplifier).
- Thân: Persona 1 câu → Behavioral Checklist (5-8 items) → workflow gọn → Output template → Status protocol (DONE/BLOCKED...).
- Không coupling hạ tầng: không script path cứng, không `.ck.json`; đọc context từ subagent-init hook inject.
- Agent trỏ skill vc tương ứng ("activate vc:fix root-cause loop") — không lặp nội dung skill.

## CLI v2 kiến trúc mấu chốt: install receipt

`.vcskill/receipt.json` ghi mọi file đã cài + hook bindings đã merge (per provider, per scope, version). Có receipt → uninstall gỡ đúng những gì mình cài (ownership-aware như ck), doctor so receipt vs thực tế, update = re-install so version. Không receipt thì cả 3 lệnh đều phải đoán — mấu chốt phải làm trước.

## Risks

1. 13 agents viết mới = effort lớn nhất → phase theo batch 4-5 con, con đầu làm mẫu chuẩn.
2. Auto-delegation phụ thuộc description quality → CI gate lint agents (mở rộng skill-lint) + test mô tả có example block.
3. Uninstall đụng settings.json user → pure un-merge fn + TDD + backup (tái dùng pattern merge hiện có).
4. Naming vc- dài hơn khi gõ → chấp nhận, trade-off nhận diện đã user-confirmed.
5. bootstrap là skill dày nhất trong 9 skill mới → để cuối wave, cắt được nếu lố.

## Success metrics

- 13 agents pass CI gate mới, mỗi con ≤120 dòng, cài song song CK không conflict.
- 21 skills pass gate; skills hiện có trỏ delegation sang agents vc-.
- `vcskill doctor` chẩn đúng 3 trạng thái (healthy/degraded/not-installed); `uninstall` gỡ sạch theo receipt, settings un-merge sạch, backups còn nguyên.
- User thay được CK trong daily loop; `ck uninstall` là bước cuối do user quyết.

## Next steps

1. Plan 1: `plans/260720-0116-vc-kit-v2-agents-harness-skills/` (6 phases)
2. Plan 2: `plans/260720-0116-vcskill-cli-v2-receipt-doctor-uninstall/` (4 phases)
3. Cook plan 1 trước (gap agents đang chặn delegation), CLI cook song song hoặc sau.

## Unresolved questions

1. vc-developer có cần variant frontend/backend riêng không hay 1 con generalist? (đề xuất: 1 generalist, chia sau nếu thấy thiếu)
2. Rules trong kit ship những file nào? (đề xuất: development-rules.md + delegation-protocol.md — 2 file gọn, user tự thêm)
3. ui-ux-designer + cụm UI reference skills (v3): viết lại hay chờ nguồn mở tương đương?
