---
title: "vc kit v3a: deep coherence — 10 skills cook-grade + kit-wide wiring"
description: "Rewrite sâu 10 skills vệ tinh lên chuẩn cook-grade, unify proof vocab + risk lanes toàn kit, sync skill↔agent, chaining 2 chiều. Parity-or-better vs CK từng skill."
status: pending
priority: P1
branch: "main"
tags: [kit, skills, quality, parity, coherence]
blockedBy: []
blocks: []
created: "2026-07-20T04:46:11.687Z"
createdBy: "ck:plan"
source: skill
---

# vc kit v3a: deep coherence — 10 skills cook-grade + kit-wide wiring

## Overview

Audit (research-260720-1128-repository-harness-deep-dive-vcskill-audit-rdd-report.md)
lộ: lõi cook/fix/plan/pm xịn nhưng 10 skills vệ tinh thiếu quality gates/output
contract; proof vocab + risk lanes chỉ sống trong cook/fix; skill↔agent lệch
concept. User chốt (brainstorm-260720-1128-vc-kit-v3-deep-quality-anti-bloat-report.md):
D1 giữ slug (không rename), D2 rewrite sâu CẢ 10, D4 plan này trước, Plan B (v3b
anti-bloat + hạ tầng) tạo sau khi plan này xong.

## PARITY-OR-BETTER GATE (bắt buộc — directive gốc của user)

Mỗi skill rewrite: đọc CK counterpart thật (~/.claude/skills/<name>/), bảng
capability kept ✅ / dropped-có-lý-do ➡️, ≥1-2 điểm vượt cụ thể kiểm chứng được.
Gom vào `plans/reports/parity-260720-skills-v3a-vs-claudekit-report.md` (phase 6 đóng).

## Cook-grade standard (chuẩn cho mọi rewrite — chi tiết hoá ở phase 1)

1. Frontmatter đúng spec + description có trigger cụ thể
2. Workflow steps thật (numbered, có rẽ nhánh điều kiện), không generic advice
3. `## Output format` — contract cụ thể verify được
4. `## Quality gates` — self-check trước khi trả kết quả
5. Proof-vocab / risk-lane wiring khi skill đụng code-change hoặc verification
6. References tách khi ruột dày (>1 chủ đề độc lập); SKILL.md ≤120 dòng
7. Chaining: "Typically follows / precedes / related" + depends-on

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Cook-grade template + exemplar: ask](./phase-01-template-exemplar-rewrites-ask.md) | Pending |
| 2 | [Exemplar: research + shared risk-lane quick-check ref](./phase-02-research-shared-risk-lane-ref.md) | Pending |
| 3 | [Rewrite: problem-solving, journal, docs (RDD-guard), sequential-thinking](./phase-03-rewrite-problem-solving-journal-docs-sequential-thinking.md) | Pending |
| 4 | [Rewrite: security-scan, docs-seeker, obsidian, git (refs 10→4)](./phase-04-rewrite-security-scan-docs-seeker-obsidian-git-consolidation.md) | Pending |
| 5 | [Kit-wide wiring: proof vocab + chaining + skill↔agent sync + stop conditions](./phase-05-kit-wide-wiring-proof-vocab-chaining-skill-agent-sync-stop-c.md) | Pending |
| 6 | [Parity report + README + changeset + smoke](./phase-06-parity-report-readme-changeset-smoke.md) | Pending |

Tuần tự 1→6. Phase 1-2 là exemplar: chốt format trước khi nhân ra 3-4 (chống
drift giọng văn giữa 10 skills). Phase 5 chạm nhiều file nhỏ. Phase 6 đóng gate.

## Acceptance Criteria (whole plan)

- [ ] 10/10 skills đạt cook-grade standard (7 mục), SKILL.md ≤120 dòng mỗi cái
- [ ] Shared reference risk-lane quick-check tồn tại, link từ ≥5 skills (brainstorm, predict, plan, scenario, problem-solving)
- [ ] Proof vocab trong output contract của mọi skill đụng verification (research, security-scan, scenario, predict, brainstorm)
- [ ] review-gate.md ↔ vc-reviewer, cook ↔ vc-tester strategies, plan template ↔ vc-developer ownership: cùng 1 ngôn ngữ, không mâu thuẫn
- [ ] git references 10→~4, hành vi giữ nguyên (đọc lại từng workflow xác nhận)
- [ ] Phase template của vc:plan có section Stop conditions
- [ ] Parity report đủ 10 skills, mỗi skill ≥1-2 điểm vượt CK cụ thể
- [ ] `pnpm test` xanh (kit-fixtures lint gate + install smoke); không skill nào vỡ frontmatter

## Dependencies

Độc lập code CLI. Plan v3b (anti-bloat + vcskill validate + hooks README +
friction) tạo sau khi plan này hoàn tất (quyết định D4).
