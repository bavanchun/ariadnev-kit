# Research: repository-harness deep dive + vcskill audit + RDD lens

Date: 2026-07-20 11:28 (+ update sau khi đọc bài RDD của Goon Nguyen)
Sources: 3 Explore agents đọc toàn bộ repository-harness (~200 files, 15K LOC Rust),
1 Explore agent audit vcskill hiện tại, bài Substack "SDD đã lỗi thời, bây giờ là RDD".
Prior distill (đã adopt đợt v2): risk lanes, proof vocabulary, authority gate,
intake-and-context, harness-delta/friction concept, subagent-init hook.

## Executive summary

repository-harness là 1 "operating harness" đầy đủ nhất từng thấy: intake risk-lane
→ story packet 4 file → SQLite durable layer + changeset JSONL replay → trace/friction
→ audit entropy score → improvement proposal state machine → maturity ladder H0-H5.
Rất nhiều cơ chế hay, NHƯNG nó là hệ 15K-LOC Rust phục vụ multi-agent/multi-repo.

Bài RDD là counterweight quan trọng: chính team ClaudeKit chết launch vì 40 ADRs
mâu thuẫn + 135 plans tồn đọng + 2 source-of-truth (code vs specs) → context rot.
Bài học: **codebase là single source of truth duy nhất; specs mỏng như bản đồ;
xoá plans đã done; comment ghi WHY**.

⇒ Kết luận: KHÔNG bê máy móc nặng của harness về vcskill (SQLite layer, epoch
fence, orchestration contract, evidence sha256 bundles, story 4-file). Chỉ lấy
những cơ chế sống được qua cả 2 bộ lọc (harness-quality ∧ RDD-anti-bloat), và ưu
tiên sửa gap NỘI TẠI mà audit vcskill vừa lộ ra.

## 1. repository-harness có gì (condensed)

### Governance
- Authority gate: read-only request bỏ qua toàn bộ bootstrap/tracing; change request mới chạy full pipeline. (đã adopt)
- FEATURE_INTAKE: 6 input types; lanes tiny/normal/high-risk; 10 risk flags; 6 hard gates auto-escalate. (đã adopt lõi)
- CONTEXT_RULES: token budget theo lane (~2K/5K/10K harness context); bounded retrieval theo phase. (đã adopt 1 phần)
- HARNESS_COMPONENTS: 11 runtime responsibilities map lên 7 surfaces (prompt/tool/middleware/skill/subagent/memory).
- HARNESS_MATURITY: ladder H0→H5 (bare → scaffolding → durable state → observability → automated verification → self-improving), mỗi level có compliance % + trace-quality score đo được.
- IMPROVEMENT_PROTOCOL: proposal state machine `new→proposed→accepted→implemented→outcome-recorded` (+rejected/suppressed/regression); accept/reject từng key một, cấm bulk commit; outcome observation append-only tách khỏi completion proof.
- HARNESS_AUDIT: entropy score 0-100 từ 6 loại drift có trọng số (orphaned stories 10đ, broken tools 8đ, unverified 5đ, stale>30d 3đ, open-no-outcome 2đ).
- ADR-0010: release chỉ promote sau platform proof; tag fail không bao giờ move/delete.

### CLI (Rust, 17 subcommands)
- SQLite WAL + 13 forward-only migrations; changeset JSONL append-only (header + semantic ops + sha256, idempotent replay, `db rebuild`).
- epoch_fence: writer.lock + journal state machine chống concurrent write khi schema transition.
- `story verify --verify "<cmd>"` / `verify-all` / `story complete` (implemented chỉ đạt được qua complete + proof pass).
- `audit` read-only, `propose` sinh proposal từ friction/intervention/drift, deterministic + evidence-backed.
- `score-trace` / `score-context`: chấm trace quality tier 1-3 và mức tuân thủ context rules.
- Issue template agent-failure-case bắt buộc khai: "What context was missing?" + checkbox doc nào thiếu.

### Story/evidence system
- Story = 4 file: overview (current/target/non-goals) · design (domain model + alternatives) · execplan (phases + **stop conditions**) · validation (proof table + **acceptance evidence** = output cụ thể, không được "passed" chay).
- Evidence bundle: mọi artifact + sha256 sidecar + evidence-lock.json; verify script bash fail-closed (jq + shasum + git ls-files).
- Review-finding closure: mỗi finding F-NNN phải có (code fix + test) hoặc (docs + grep proof); ledger phải sạch mới merge.
- Disposition policy khi đóng epic: retain-core / archive-only / derive / discard từng artifact — có lý do.

## 2. Bài RDD (Goon Nguyen — chính tác giả ClaudeKit)

- RDD = Revenue-Driven Development: lăng kính "cái này có dẫn tới doanh thu không?", không phải methodology.
- Post-mortem AgentKit launch fail: 40 ADRs mâu thuẫn nhau + 135 plans + hàng trăm reports không dám xoá → 2 source of truth → AI tin nhầm specs cũ → bugs ngớ ngẩn hàng loạt.
- Khoa học: Context Rot (Chroma, 18 models đều degrade khi input dài), lost-in-the-middle (−30% accuracy), Distractor Interference (Salesforce).
- Khuyến cáo: single source of truth = codebase; specs giữ tối thiểu (CLAUDE/AGENTS.md, system-architecture, code-standards, PRD, codebase-summary); xoá plans done; comment ghi WHY không ghi WHAT; test do agent độc lập verify, đừng tin test agent tự viết tự xanh.
- Trực tiếp áp vào vcskill: repo này cũng đang tích plans/reports (session hôm nay đã sinh ~10 reports). Nguy cơ y hệt.

## 3. Audit vcskill hiện tại (brutal)

### Mạnh (có bằng chứng)
- Lõi cook/fix/plan/pm + 3 references của cook (risk-lanes, test-gate, review-gate) = gold standard; fix có prove-before-fix loop.
- 13 agents đều có behavioral checklist + status protocol + scope "not handle X".
- Hạ tầng trung thực: provider matrix skip-not-guess, atomic writes, receipt sha256, hooks fail-open có test.

### Yếu (xếp theo severity)
1. **CRITICAL — proof vocabulary chỉ sống trong cook/fix**: scenario, predict, brainstorm, research, bootstrap không reference/enforce proof layers → phase bỏ e2e không cần nói lý do.
2. **CRITICAL — 10 skills không có quality-gate checklist**: ask, research, problem-solving, journal, docs, docs-seeker, security-scan, sequential-thinking, obsidian, git. Output không có bước tự-kiểm.
3. **HIGH — risk-lane chỉ cook dùng**: predict nói "risky refactors" mà không định nghĩa risky; brainstorm/plan không phân lane.
4. **HIGH — references phân bố lệch**: git 10 files (nhiều variant trùng lặp), trong khi problem-solving 6 techniques + scenario 12 dimensions nhét hết inline.
5. **MEDIUM — thin skills thiếu output contract** (ask/research/journal/problem-solving/sequential-thinking).
6. **MEDIUM — workflow chaining ngầm**: problem-solving→brainstorm→plan→cook, predict→scenario không được nêu 2 chiều.
7. **MEDIUM — hooks là black box**: không README, không header comment.
8. **MEDIUM — concept drift skill↔agent**: vc-tester Strategy A-E không được cook nhắc; review-gate.md ≠ format checklist của vc-reviewer.
9. **MEDIUM — CLI thiếu `validate`** (lint kit không cần install).

## 4. Gap analysis: lọc 30 ý tưởng qua 2 bộ lọc

### ADOPT (qua cả 2 bộ lọc — đề xuất làm)

| # | Ý tưởng | Nguồn | Map vào | Cost |
|---|---------|-------|---------|------|
| A1 | Unify proof vocabulary + quality gates + output contracts cho 10 skills thin | audit nội tại | mỗi SKILL.md +5-10 dòng theo pattern cook/brainstorm | S |
| A2 | Shared risk-lane quick-check reference, link từ brainstorm/predict/plan/scenario/problem-solving | audit + harness | 1 reference file + 1 dòng/skill | S |
| A3 | **Plan hygiene / disposition**: vc:pm thêm bước đóng plan = archive/delete plans done + reports cũ (retain-core/archive/discard có lý do) | RDD + harness disposition policy | kit/skills/pm (sync-back.md) | S |
| A4 | **Acceptance evidence rule**: checkbox completed phải cite output cụ thể (đã làm trong session này, giờ codify thành rule trong plan template + pm) | harness validation.md | plan template + pm | S |
| A5 | **Stop conditions** section trong phase template (gate breach → hỏi user, không silent skip) | harness execplan | plan SKILL template | S |
| A6 | Hooks README + 5-dòng header mỗi hook.cjs | audit nội tại | kit/hooks/ | S |
| A7 | Consolidate git references 10→~4 (base + variants) | audit nội tại | kit/skills/git/references | S |
| A8 | **Friction line trong journal/session-state**: khi lặp lại confusion 2+ lần, ghi 1 dòng friction → nguồn cho cải tiến kit sau | harness friction→proposal (bản siêu nhẹ) | journal SKILL + session-state hook | S |
| A9 | `vcskill validate` — lint kit (frontmatter, agent-lint, refs tồn tại) không cần install | audit + harness verify | CLI, tái dùng load-kit + agent-lint | M |
| A10 | Explicit workflow chaining 2 chiều (problem-solving↔brainstorm, predict↔scenario) + "depends on" note | audit nội tại | 5-6 SKILL.md, 1-2 dòng mỗi cái | S |
| A11 | Đồng bộ review-gate.md ↔ vc-reviewer checklist, cook nhắc vc-tester strategies | audit nội tại | cook references + agents | S |
| A12 | RDD guard trong docs skill: giữ docs tối thiểu (5 file), cấm sinh ADR/spec mới khi codebase tự nói được; comment WHY not WHAT (đã có trong dev-rules, nhấn mạnh lại) | RDD | vc:docs + development-rules | S |

### DEFER (hay nhưng chưa cần — ghi lại để v3)
- `vcskill doctor --fix` (đã cắt có chủ đích trong parity report; làm khi có user thật kêu).
- Trace recording nhẹ cho CLI ops (install/uninstall đã có receipt + backups — đủ).
- Agent-failure-case template (chỉ hữu ích khi có người dùng ngoài).

### REJECT (fail bộ lọc RDD/YAGNI — lý do 1 dòng)
- SQLite durable layer + changeset JSONL replay: single-user TS CLI, receipt.json đã đủ; thêm = 2nd source of truth.
- Epoch fence: không có concurrent writers.
- Orchestration contract v1 (JSON envelope, exit-code spec): không có consumer máy nào ngoài chính mình.
- Story 4-file bundle thay plan/phase: nặng gấp đôi hiện tại — chính là bệnh 135-plans mà RDD cảnh báo.
- Evidence-lock sha256 bundles cho plans/reports: hash markdown reports là bureaucracy thuần.
- Maturity ladder S0-S5, context scoring CLI, proposal state machine CLI, replay/rebuild validation, cross-repo receipt attestation: chi phí vận hành > giá trị cho kit cá nhân.

## 5. Đề xuất thứ tự thực hiện

1. **Wave 1 (kit coherence, ~nửa ngày)**: A1 + A2 + A5 + A10 + A11 — biến "lõi xịn + vệ tinh lỏng" thành 1 hệ nhất quán. Đây là điểm CAO HƠN ck rõ nhất có thể claim.
2. **Wave 2 (anti-bloat, RDD)**: A3 + A4 + A12 — vc:pm học được bài học đắt nhất của chính ClaudeKit; đồng thời dọn plans/ của repo này làm demo.
3. **Wave 3 (hạ tầng nhỏ)**: A6 + A7 + A8 + A9.

## Unresolved questions

- A3: xoá hẳn plans done hay move vào `plans/_archive/`? (khuyên: archive 1 chu kỳ rồi xoá — cần user chốt)
- A9 `vcskill validate`: tách lệnh riêng hay làm `vcskill list --strict`? (khuyên: lệnh riêng, exit code CI-able)
