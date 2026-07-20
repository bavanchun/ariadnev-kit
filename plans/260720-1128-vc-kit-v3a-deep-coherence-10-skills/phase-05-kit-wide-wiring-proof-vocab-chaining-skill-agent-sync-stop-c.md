---
phase: 5
title: "Kit-wide wiring: proof vocab + chaining + skill↔agent sync + stop conditions"
status: pending
priority: P1
effort: "4h"
dependencies: [3, 4]
---

# Phase 5: Kit-wide wiring

## Overview

Nối các skill/agent thành 1 hệ: proof vocab + risk lanes lan ra ngoài cook/fix,
skill↔agent nói cùng ngôn ngữ, chaining 2 chiều, stop conditions vào plan template.

## Requirements

1. **Risk-lane links**: brainstorm, predict, plan, scenario, problem-solving
   link shared risk-lane ref (phase 2); predict/scenario định nghĩa "risky/major"
   bằng lane thay vì cảm tính.
2. **Proof-vocab wiring**: scenario + predict output nói rõ edge case/persona
   finding map vào proof layer nào; brainstorm design section yêu cầu nêu proof
   expectation; pm sync-back đã có — kiểm tra nhất quán.
3. **Skill↔agent sync** (1 ngôn ngữ, không mâu thuẫn):
   - cook/references/review-gate.md ↔ vc-reviewer checklist: thống nhất mục,
     review-gate trỏ agent làm nguồn chi tiết
   - cook test-gate ↔ vc-tester Strategy A-E: cook nhắc chọn strategy
   - plan phase template ↔ vc-developer file-ownership protocol
   - docs RDD-guard (phase 3) ↔ vc-docs-manager
4. **Delegation prompt template**: shared ref (cùng chỗ risk-lane ref) chuẩn hoá
   prompt spawn agent (task, files-to-read, may-modify, acceptance, constraints,
   report path, status protocol) — rút từ delegation-protocol.md rule, các skill
   delegate (cook, scout, plan) trỏ vào.
5. **Chaining 2 chiều**: problem-solving↔brainstorm, predict↔scenario,
   research↔brainstorm, journal←mọi skill kết thúc; mỗi skill "Workflow position"
   ngắn (follows/precedes/related).
6. **Stop conditions**: phase template trong vc:plan SKILL (hoặc references) thêm
   section `## Stop conditions` — gate breach/weak proof → dừng hỏi user, không
   silent skip. Đồng bộ với cook HARD-GATE hiện có.

## Related Code Files

- Modify: `kit/skills/{brainstorm,predict,plan,scenario,problem-solving,cook,scout,pm}/SKILL.md` + references liên quan
- Modify: `kit/agents/{vc-reviewer,vc-tester,vc-developer,vc-docs-manager}.md` (chỉ khi cần sync câu chữ — agent-lint giữ ≤120 dòng)
- Create: delegation prompt template shared ref

## Implementation Steps

1. Sync skill↔agent trước (đọc cặp file, chốt ngôn ngữ chung, sửa cả 2 phía).
2. Wire risk-lane + proof-vocab links (mỗi skill 1-3 dòng, không phình).
3. Delegation template + chaining notes.
4. Stop conditions vào plan template. `pnpm test` xanh.

## Success Criteria

- [ ] Grep "risk-lane" match ≥5 skills ngoài cook/fix; "proof" match scenario/predict/brainstorm
- [ ] 4 cặp skill↔agent không còn mâu thuẫn (đối chiếu thủ công ghi vào parity report)
- [ ] Delegation template tồn tại, ≥3 skills trỏ vào
- [ ] plan phase template có Stop conditions; agent-lint + kit lint xanh

## Risk Assessment

Chạm nhiều file nhỏ → dễ phình dòng: mỗi wiring chỉ 1-3 dòng + link, nội dung
sống ở shared ref. Agent ≤120 dòng là hard limit (lint bắt).
