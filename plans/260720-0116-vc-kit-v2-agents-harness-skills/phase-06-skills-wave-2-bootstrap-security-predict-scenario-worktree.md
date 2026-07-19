---
phase: 6
title: "Skills wave 2: bootstrap, security-scan, predict, scenario, worktree + smoke + changeset"
status: completed
priority: P2
effort: "7h"
dependencies: [4, 5]
---

# Phase 6: Skills wave 2 + đóng plan

## Overview

5 skill còn lại của roster 21 (dùng vc:skill-creator từ phase 5 — dogfood),
rồi smoke toàn kit + changeset.

## Requirements

| Skill | CK counterpart | Cốt lõi + điểm vượt tối thiểu (gợi ý) |
|---|---|---|
| vc:bootstrap | bootstrap | Khởi tạo project mới: research→stack→design→plan→implement; modes full/fast; + bắt buộc chốt stack qua AskUserQuestion trước khi scaffold (chống stack ngẫu hứng) |
| vc:security-scan | security-scan | Quét secrets/OWASP/deps bằng LLM + grep patterns, zero deps; + severity table + auto-route sang vc:fix cho findings confirmed |
| vc:predict | predict | 5 persona debate trước thay đổi rủi ro; + mỗi persona phải cite file thật từ scout (chống debate chay) |
| vc:scenario | scenario | Sinh edge cases đa chiều cho feature; + output map thẳng vào test-gate của vc:cook (điền được vào test file) |
| vc:worktree | worktree | Tạo/dọn git worktree cô lập; + health audit stale worktrees; tương thích vc:git |

Smoke cuối: install claude-code sandbox → **21 skills + 13 agents + 6 hooks +
3 rules** đủ; codex → hooks skip; agents land dạng TOML như adapt hiện có
(`model`/`memory` drop chủ đích — codex không có per-agent model tiering).
README: update roster + provider matrix + **mục Getting Started cho người mới**
(cài 1 lệnh → thử /vc:brainstorm → cook — yêu cầu "ai cũng dùng được").
Changeset minor.

## PARITY GATE

Report: `plans/reports/parity-260720-skills-wave2-vs-claudekit-report.md`.

## Related Code Files

- Create: `kit/skills/{bootstrap,security-scan,predict,scenario,worktree}/…`
- Modify: `packages/cli/src/install/install.test.ts` (ROSTER const 12→21, agents/hooks counts)
- Modify: `README.md`; Create: changeset

## Implementation Steps

1. Tests first: update ROSTER smoke expect 21 skills + 13 agents → đỏ.
2. Viết 5 skills qua vc:skill-creator flow; từng skill: draft → gate → parity table.
3. Smoke xanh + coverage ≥90% + README + changeset.
4. Sync-back toàn plan theo vc:pm rules.

## Success Criteria

- [x] Roster 21 skills + 13 agents pass smoke (sandbox verified, CI pending push)
- [x] Parity reports đủ cho cả 9 skills mới (wave1 + wave2 reports)
- [x] Changeset ghi roster mới; README khớp thực tế (Getting Started + roster + agent gate)
- [x] Toàn plan sync-back, 6 phases completed

## Risk Assessment

- bootstrap dày nhất → làm cuối cùng trong wave, cắt sang plan riêng nếu lố mà không chặn smoke (smoke chỉ đếm roster đã ship — điều chỉnh ROSTER nếu cắt, ghi rõ).
