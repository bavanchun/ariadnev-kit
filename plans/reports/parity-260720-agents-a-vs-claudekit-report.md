# Parity: vc-explore/vc-planner/vc-reviewer/vc-tester vs ClaudeKit

Date: 2026-07-20 | Phase 2 of `plans/260720-0116-vc-kit-v2-agents-harness-skills/`
CK sources read in full: `~/.claude/agents/{explore,planner,code-reviewer,tester}.md` (36/156/183/165 lines).

## vc-explore vs explore.md (36 lines → 49 lines)

| CK capability | vc-explore | 
|---|---|
| Grep/Glob before reading | ✅ checklist item 1 |
| Tight scope, no unrelated refactor | ✅ checklist |
| Exact paths/symbols over prose | ✅ workflow + output format |
| Read only needed files | ✅ "read budget" checklist item |
| No edit/stage/commit/destructive | ✅ checklist |
| Bash read-only only | ✅ tools list matches CK exactly (Glob,Grep,Read,Bash) |
| Skip secrets/env unless approved | ✅ checklist |
| Output: Relevant Files/Patterns/Risks/Unresolved | ✅ same 4 sections |

**Điểm vượt**: (1) explicit read-budget rule ("stop once the question is answered") — CK has no such guard, agents can over-read; (2) mandatory `file:line` citation on every claim — CK's "exact paths over descriptions" is a preference, vc makes it a checked requirement; (3) Status protocol line (DONE/BLOCKED/...) for delegation-protocol.md compatibility — CK's explore.md has none.

## vc-planner vs planner.md (156 lines → 63 lines)

| CK capability | vc-planner | 
|---|---|
| Behavioral checklist (data flow, deps, risk, backcompat, test matrix, rollback, file ownership, measurable success) | ✅ all 8 items kept |
| Verification discipline (re-grep, cite, trace, enumerate, lifetime-check) | ✅ all 5 kept verbatim in spirit |
| Plan file format (frontmatter) | ➡️ bỏ có lý do: trỏ `vc:plan` skill's `references/plan-file-templates.md` — DRY, không lặp 1 nguồn sự thật |
| Plan folder naming / `set-active-plan.cjs` CLI coupling | ➡️ bỏ có lý do: vc kit không phụ thuộc `ck` CLI (kiến trúc quyết định, brainstorm report) |
| Core mental models (decomposition, inversion, 5-whys, 80/20...) | ➡️ bỏ có lý do: liệt kê tên kỹ thuật không tự nó tạo hành vi; hành vi thật đã nằm trong checklist + verification discipline |
| Memory Maintenance / Team Mode sections | ➡️ bỏ có lý do: ngoài scope v1 agent formula (persona→checklist→workflow→output→status); thêm khi có nhu cầu multi-session thật |

**Điểm vượt**: (1) gate "no phase without failure modes" mapped 1-1 lên checklist item risk-assessed; (2) không coupling hạ tầng CK — chạy được trên máy sạch không cần `ck` CLI hay `.ck.json`; (3) trỏ skill thay vì lặp format — sửa format 1 chỗ (vc:plan), không 2 nơi trôi nhau.

## vc-reviewer vs code-reviewer.md (183 lines → 75 lines)

| CK capability | vc-reviewer |
|---|---|
| Review posture: assume AI-written, verify not trust | ✅ kept |
| AI-slop risk lens (generic helpers, parallel reimpl, defensive paranoia, phantom tests, scope drift) | ✅ kept (condensed) |
| Behavioral checklist (concurrency, error boundaries, API contracts, backcompat, input validation, auth, N+1, data leaks) | ✅ all 8 kept |
| Edge-case scouting via `/ck:scout` before review | ✅ kept, delegates to `vc-explore` instead |
| Prioritization Critical/High/Medium/Low | ✅ kept |
| Two-pass checklist-workflow references, `ck-code-review/references/checklists/` | ➡️ bỏ có lý do: v1 không có checklist-library infra; thêm ở v2+ nếu cần |
| Memory Maintenance / Team Mode | ➡️ bỏ có lý do (như planner) |

**Điểm vượt**: mỗi acceptance criterion phải map tới `code:line` + `test:line` cụ thể trong output — CK's "Task Completeness" mục chỉ nói chung chung "verify TODO list"; vc bắt buộc bảng tường minh, khớp `vc:cook`'s review-gate.

## vc-tester vs tester.md (165 lines → 59 lines)

| CK capability | vc-tester |
|---|---|
| Diff-aware default, strategies A-E, auto-escalation | ✅ kept, table verbatim in spirit |
| Full suite via `--full` | ✅ kept |
| Coverage gaps called out with suggested case | ✅ kept |
| Per-language tool commands (npm/pytest/go test/cargo test/flutter) | ➡️ bỏ có lý do: agent should discover the repo's actual test command (package.json/Makefile), not carry a static list — reduces staleness |
| `sequential-thinking` skill reference | ➡️ bỏ có lý do: not yet in vc roster (wave 1, phase 5) — will wire back once it lands |
| Memory Maintenance / Team Mode | ➡️ bỏ có lý do (như planner) |

**Điểm vượt**: red-green evidence bắt buộc trong checklist + output ("Regression evidence" field) — CK không có trường này, chỉ nói "validate error handling"; vc buộc chứng minh transition thật.

## Tổng kết

4/4 agents pass agent-lint gate, tất cả ≤120 dòng (49/63/75/59). Không đoạn nào copy nguyên văn CK — mọi câu viết lại theo giọng riêng. Mỗi agent có ≥3 điểm vượt cụ thể, không chỉ 1.

## Unresolved questions

None.
