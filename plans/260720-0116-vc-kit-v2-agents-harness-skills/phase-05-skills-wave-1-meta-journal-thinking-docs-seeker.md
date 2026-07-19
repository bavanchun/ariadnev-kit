---
phase: 5
title: "Skills wave 1: skill-creator, journal, sequential-thinking, docs-seeker"
status: completed
priority: P2
effort: "5h"
dependencies: [1]
---

# Phase 5: Skills wave 1

## Overview

4 skill mỏng-vừa, viết mới theo `docs/vc-skill-authoring-spec.md`, pass gate v1.

## Requirements

| Skill | CK counterpart | Cốt lõi + điểm vượt tối thiểu (gợi ý) |
|---|---|---|
| vc:skill-creator | skill-creator | Meta-skill: checklist authoring + scaffold qua `vcskill add-skill` + tự chạy gate (`pnpm test` với lint) — CK không có gate máy, mình có: điểm vượt tự nhiên. Enforce parity-table khi port skill từ kit khác |
| vc:journal | journal | Ghi nhật ký kỹ thuật cuối session vào `docs/journal/` hoặc plans/reports; trigger conditions rõ; gọn hơn CK (bỏ phần emotional dài), + template 10 dòng chuẩn, + mục **friction/harness-delta** (từ repository-harness IMPROVEMENT_PROTOCOL: friction lặp ≥2 lần → đề xuất sửa rule/skill cụ thể) |
| vc:sequential-thinking | sequential-thinking | Reasoning có cấu trúc: steps, revision, verify hypothesis; zero deps; + quy tắc "mỗi step phải falsifiable" |
| vc:docs-seeker | docs-seeker | Tra docs mới qua context7/llms.txt/WebFetch; + bắt buộc ghi version/date checked (khớp vc:research) |

## PARITY GATE

Report: `plans/reports/parity-260720-skills-wave1-vs-claudekit-report.md`.

## Related Code Files

- Create: `kit/skills/{skill-creator,journal,sequential-thinking,docs-seeker}/SKILL.md` (+references nếu cần, ≤300 dòng/file)

## Implementation Steps

1. Đọc bản CK từng skill (`~/.claude/skills/...`), extract capability checklist.
2. Viết từng skill: draft → gate → parity table.
3. `pnpm test` + commit.

## Success Criteria

- [x] 4 skills pass gate (54/78/66/47 dòng); parity report đủ (parity-260720-skills-wave1-vs-claudekit-report.md); ≥2 điểm vượt/skill
- [x] vc:skill-creator dùng được ngay để viết wave 2 (dogfood) — checklist + gate sẵn sàng cho phase 6

## Risk Assessment

- skill-creator dễ phình → giữ SKILL.md là checklist + trỏ spec doc, không lặp spec.
