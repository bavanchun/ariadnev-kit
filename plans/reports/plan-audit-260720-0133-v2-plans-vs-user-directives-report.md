# Plan Audit: 2 plans v2 vs lời dặn user + repository-harness — trước implement

Date: 2026-07-20 | Mode: deep audit (verification pass tự chạy — auditor có full context session)
Audited: `plans/260720-0116-vc-kit-v2-agents-harness-skills/` (6 phases) + `plans/260720-0116-vcskill-cli-v2-receipt-doctor-uninstall/` (4 phases)

## Kết luận

Plans đúng hướng, KHÔNG cần redesign. Tìm thấy **5 findings** (2 inconsistency, 2 thiếu-lời-dặn, 1 risk-verify) — **đã fix hết trong audit này**. Sẵn sàng cook.

## Đối chiếu từng lời dặn của user

| Lời dặn | Trạng thái trong plan |
|---|---|
| Full 13 agents prefix `vc-` | ✅ plan 1 phases 2-4, công thức persona+checklist |
| Lõi bằng hoặc CAO HƠN CK | ✅ plan 1 có PARITY-OR-BETTER GATE; ❌→✅ plan 2 THIẾU — đã thêm gate đối chiếu ck doctor/uninstall/backups/update (finding #2) |
| 21 skills (thêm 9) | ✅ phases 5-6, đủ 9 skill đã chốt |
| CLI "chỉn chu đầy đủ" | ✅ plan 2: receipt→doctor→uninstall→backups+update |
| Repo tham khảo repository-harness | ✅ đã distill (rules intake-and-context, cook risk-lanes, proof vocabulary, trace, decision records); ❌→✅ friction/harness-delta từ IMPROVEMENT_PROTOCOL chưa landed — đã thêm vào rules (d) + vc:journal (finding #3) |
| "Ai muốn dùng cũng xài được" | ❌→✅ chưa có deliverable — đã thêm README Getting Started vào phase 6 (finding #4) |
| Thay thế dần CK | ✅ vc- prefix cài song song không đụng; uninstall CK là bước user tự quyết |

## Findings đã fix

1. **[Inconsistency] Phase-06 smoke đếm "2 rules"** — stale sau khi thêm `intake-and-context.md` (rules thứ 3). Fix: 2 chỗ (phase-06 smoke + phase-01 step 3) → "3 rules".
2. **[Thiếu lời dặn] Plan 2 không có parity gate vs ck CLI** — "lõi phải cao hơn" áp cho cả CLI. Fix: thêm PARITY-OR-BETTER GATE vào plan 2 (mốc phải vượt: ck uninstall "ownership-aware" — receipt-based phải chính xác hơn heuristic, chứng minh bằng test) + acceptance criterion mới.
3. **[Thiếu distill] Harness-delta/friction (IMPROVEMENT_PROTOCOL)** chưa vào phase nào. Fix: rules `intake-and-context.md` thêm mục (d) harness delta; vc:journal (phase 5) thêm mục friction (lặp ≥2 → đề xuất sửa rule/skill).
4. **[Thiếu lời dặn] README Getting Started cho người mới** — fix vào phase 6.
5. **[Risk verify] SubagentStart event** — VERIFIED tồn tại thật (CK bind tại `~/.claude/settings.json:454`); risk phase 1 hạ từ open → resolved. Bonus verify: `agent-to-toml` drop im lặng `model`/`memory` khi adapt codex — hành vi đúng nhưng phải ghi chú chủ đích trong spec doc (đã thêm vào phase 1).

## Verification evidence

- SubagentStart: grep `~/.claude/settings.json` → line 454 (CK subagent-init đang chạy production trên máy user).
- agent-to-toml: đọc `packages/cli/src/adapt/agent-to-toml.ts` — chỉ serialize name/description/sandbox_mode/developer_instructions.
- Consistency sweep sau fix: grep "2 rules|verify tên event" toàn 2 plan dirs → 0 stale.
- Cross-plan: 2 plans độc lập file-ownership; điểm chạm duy nhất install.test.ts đã ghi trong plan 2 Dependencies.

## Điểm KHÔNG đổi (đã cân nhắc, giữ nguyên)

- SQLite durable layer của repository-harness: vẫn không lấy (YAGNI, markdown+frontmatter đủ) — nhất quán scout report.
- ui-ux-designer + cụm UI reference: vẫn v3.
- Thứ tự phases và dependency chain 2 plans: hợp lệ, không phát hiện deadlock/thiếu blocker.

## Unresolved questions

1. (carry-over từ brainstorm) vc-developer generalist — đã ghi trong plan, chốt khi viết phase 3.
2. Trace ghi session-state (TTL 7d) vs durable — đề xuất trong scout report giữ nguyên: auto-trace vào session-state, durable chỉ khi có plan active; chốt khi làm phase 1.
