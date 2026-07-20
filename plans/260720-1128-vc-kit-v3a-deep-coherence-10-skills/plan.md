---
title: "vc kit v3a: deep coherence — 10 skills cook-grade + kit-wide wiring"
description: "Rewrite sâu 10 skills vệ tinh lên chuẩn cook-grade, unify proof vocab + risk lanes toàn kit, sync skill↔agent, chaining 2 chiều. Parity-or-better vs CK từng skill."
status: completed
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
| 1 | [Cook-grade template + exemplar: ask](./phase-01-template-exemplar-rewrites-ask.md) | ✅ Completed |
| 2 | [Exemplar: research + canonical risk-lane source](./phase-02-research-shared-risk-lane-ref.md) | ✅ Completed |
| 3 | [Rewrite: problem-solving, journal, docs (RDD-guard), sequential-thinking](./phase-03-rewrite-problem-solving-journal-docs-sequential-thinking.md) | ✅ Completed |
| 4 | [Rewrite: security-scan, docs-seeker, obsidian, git (refs 10→7)](./phase-04-rewrite-security-scan-docs-seeker-obsidian-git-consolidation.md) | ✅ Completed |
| 5 | [Kit-wide wiring: proof vocab + chaining + skill↔agent sync + stop conditions](./phase-05-kit-wide-wiring-proof-vocab-chaining-skill-agent-sync-stop-c.md) | ✅ Completed |
| 6 | [Parity report + README + changeset + smoke](./phase-06-parity-report-readme-changeset-smoke.md) | ✅ Completed |

Tuần tự 1→6. Phase 1-2 là exemplar: chốt format trước khi nhân ra 3-4 (chống
drift giọng văn giữa 10 skills). Phase 5 chạm nhiều file nhỏ. Phase 6 đóng gate.

## Acceptance Criteria (whole plan)

- [x] 10/10 skills đạt cook-grade standard (7 mục), SKILL.md ≤300 (spec limit; 120 là limit của *agent*) — thực tế tất cả ≤128
- [x] Canonical risk-lane source (`intake-and-context` rule, globally injected) referenced từ 8 skills — vượt ≥5 (deviation: không tạo file `_shared/` mới, xem parity report §Deviations)
- [x] Proof vocab trong 7 skills đụng verification (ask, docs-seeker, problem-solving, research, scenario, security-scan, sequential-thinking)
- [x] review-gate.md ↔ vc-reviewer (đã link sẵn), test-gate ↔ vc-tester strategies (thêm pointer), plan template ↔ vc-developer (Stop Conditions), docs ↔ vc-docs-manager — không mâu thuẫn (bảng trong parity report)
- [x] git references 10→7 (không phải ~4 — chỉ gộp cái gộp được, xoá orphan mâu thuẫn), hành vi giữ nguyên
- [x] Phase template của vc:plan có section Stop Conditions
- [x] Parity report đủ 10 skills + kit-wide wiring + deviations, mỗi skill ≥1-2 điểm vượt CK
- [x] `pnpm test` xanh (218 tests, kit-fixtures lint gate); dry-run install lands 76 files, refs mới OK

## Dependencies

Độc lập code CLI. Plan v3b (anti-bloat + vcskill validate + hooks README +
friction) tạo sau khi plan này hoàn tất (quyết định D4).
