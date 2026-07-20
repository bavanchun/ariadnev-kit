# Brainstorm: vc kit v3 — deep quality + anti-bloat

Date: 2026-07-20 11:28 | Status: consensus reached
Inputs: research-260720-1128-repository-harness-deep-dive-vcskill-audit-rdd-report.md
(4 Explore agents: harness governance / harness CLI+CI / harness story-evidence / vcskill audit)
+ bài RDD (Goon Nguyen, post-mortem AgentKit/ClaudeKit launch fail).

## Problem statement

Audit lộ ra: lõi vc kit (cook/fix/plan/pm + 13 agents + CLI) đạt chuẩn cao, nhưng
10 skills vệ tinh mỏng (không quality gates, không output contract, proof vocab +
risk lanes chỉ sống trong cook/fix), references phân bố lệch, skill↔agent lệch
concept, hooks black-box, CLI thiếu validate. Đồng thời repo đang tích plans/reports
— đúng bệnh 135-plans làm ClaudeKit fail launch (RDD post-mortem).

User directive gốc (giữ nguyên hiệu lực): lõi từng skill tối thiểu BẰNG hoặc CAO
HƠN ClaudeKit — parity-or-better gate bắt buộc cho mọi rewrite.

## Decisions (user đã chốt 2026-07-20)

| # | Câu hỏi | Quyết định | Lý do |
|---|---------|-----------|-------|
| D1 | Naming: 14/21 slug trùng CK | **A — giữ slug, prefix `vc:` là đủ** | 0 chi phí, không vỡ thói quen; khác biệt nằm ở chất lượng ruột, không phải tên. KHÔNG rename — mọi cross-ref giữ nguyên. |
| D2 | Độ sâu Wave 1 | **Rewrite sâu cả 10 skills lên cook-grade** | "Chất lượng nhất" là mục tiêu số 1; chấp nhận chi phí gấp rưỡi tiered. |
| D3 | Plan hygiene | **Xoá thẳng plans/reports đã done; git là archive** | Distill quyết định lâu dài vào docs/ (vc:docs decision mode) trước khi xoá. Không nuôi `_archive/`. |
| D4 | Đóng gói | **2 plans tuần tự** | Plan A coherence trước, Plan B anti-bloat + hạ tầng sau. |

## Scope

### Plan A — vc kit v3a: deep coherence (10 skills cook-grade)

1. **Rewrite 10 skills** thiếu gates/contract: ask, research, problem-solving,
   journal, docs, docs-seeker, security-scan, sequential-thinking,
   obsidian-second-brain-note, git. Chuẩn cook-grade mỗi skill:
   - Workflow steps thật (không generic advice)
   - "## Output format" (contract cụ thể) + "## Quality gates" (self-check trước khi trả)
   - Tách references khi ruột dày: problem-solving 6 techniques → references/;
     git 10 refs → gộp ~4 (base + variants); docs thêm RDD-guard (giữ 5-6 file
     docs chuẩn, cấm đẻ ADR/spec khi codebase tự nói được, comment WHY)
   - Parity-or-better: đối chiếu CK counterpart từng skill, bảng kept/dropped-lý-do,
     ≥1-2 điểm vượt cụ thể → parity report
2. **Unify proof vocabulary + risk lanes toàn kit**: tạo shared reference
   risk-lane quick-check; link từ brainstorm, predict, plan, scenario,
   problem-solving; mỗi skill nói rõ proof layer nào áp dụng cho output của nó.
3. **Skill↔agent sync**: review-gate.md ↔ vc-reviewer checklist thống nhất;
   cook nhắc vc-tester Strategy A-E; plan phase template nhắc vc-developer
   file-ownership; delegation prompt template shared reference.
4. **Workflow chaining 2 chiều**: problem-solving↔brainstorm, predict↔scenario,
   + "depends on" note ở mỗi skill.
5. **Stop conditions** section vào phase template của vc:plan (gate breach →
   hỏi user, không silent skip).

### Plan B — vc kit v3b: anti-bloat + hạ tầng

1. **vc:pm disposition step** (bài học RDD + harness disposition policy):
   đóng plan = (a) distill quyết định lâu dài vào docs/ qua vc:docs decision
   mode, (b) xoá plan dir + reports liên quan, (c) ghi 1 dòng disposition vào
   commit message. Codify "checkbox completed phải cite evidence" vào plan template.
2. **Áp dụng ngay lên repo này** (live demo): dọn plans/ hiện tại — plans done
   (v1, v2 agents, v2 CLI) distill → xoá.
3. **`vcskill validate`**: lệnh mới, lint kit không cần install (frontmatter,
   agent-lint, refs-tồn-tại check — bắt đúng loại lỗi audit tìm bằng tay),
   exit code CI-able, TDD, wire vào GitHub Actions CI.
4. **Hooks README + 5-dòng header** mỗi hook.cjs.
5. **Friction line**: journal skill + session-state hook ghi 1 dòng khi lặp
   confusion 2+ lần (bản siêu nhẹ của harness friction, KHÔNG state machine).

### Out of scope (reject có lý do — xem research report §4)

SQLite durable layer, epoch fence, orchestration contract, story 4-file bundle,
sha256 evidence-lock cho markdown, maturity ladder, context scoring, proposal
state machine, rename skills (D1), doctor --fix (defer), trace recording (defer).

## Evaluated approaches (tóm tắt debate)

- Naming B (rename theme riêng) vs A: B nhận diện mạnh nhưng user chốt A —
  chất lượng ruột là điểm khác biệt, tên là bao bì. Ghi nhận: nếu sau này publish
  công khai và cần identity, rename là 1 plan riêng, làm càng sớm càng rẻ.
- Wave 1 tiered vs deep-all: user chốt deep-all 10 skills, ưu tiên đồng đều
  tuyệt đối hơn tiết kiệm.
- Hygiene archive-cycle vs delete-now: chốt delete-now; lập luận git-là-archive
  thắng "nỗi sợ không dám xoá" (RDD).

## Success metrics

- 21/21 skills có Output format + Quality gates + proof-vocab/risk-lane wiring
  (grep-able, `vcskill validate` check được về sau).
- Parity report v3a: 10 skills × bảng đối chiếu CK + điểm vượt.
- plans/ sau Plan B chỉ còn plans đang active; quyết định cũ nằm trong docs/.
- `vcskill validate` chạy trong CI, exit ≠0 khi kit vỡ contract.
- `pnpm test` xanh toàn bộ; roster/install smoke không đổi hành vi.

## Risks

- Rewrite 10 skills cùng lúc → drift giọng văn/format: mitigation = viết 1 skill
  mẫu chuẩn trước (ask hoặc research), duyệt format, rồi nhân ra.
- Xoá plans done: rủi ro mất context chưa distill → gate bắt buộc distill trước
  xoá, và xoá qua git (revert được).
- Gộp git references: rủi ro gãy flow prc/pr → giữ nguyên hành vi, chỉ gộp file,
  test bằng đọc lại từng workflow.

## Next steps

1. `/vc:plan` (hoặc ck-plan) tạo Plan A từ report này → cook.
2. Plan B tạo sau khi A xong (hoặc tạo luôn cả 2, cook tuần tự — như v2).

## Unresolved questions

None — 4 quyết định đã chốt.
