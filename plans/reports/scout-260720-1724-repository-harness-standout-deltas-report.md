# Scout: repository-harness — Standout Deltas vs vcskill

Scope: peak mechanisms `repository-harness` (Rust) has that vcskill LACKS or does WORSE. Concepts worth stealing (Rust→TS). Read-only scan of `/Users/vchun/Documents/kit/repository-harness`.

## Core idea (context, not a gap to fix, but the frame)

The harness is NOT a skill/kit installer. It installs a **repository-level operating layer for coding agents**: markdown policy docs (`AGENTS.md` shim, `FEATURE_INTAKE.md`, `CONTEXT_RULES.md`, `ARCHITECTURE.md`, templates) PLUS a single prebuilt Rust CLI (`harness-cli`) backed by a git-ignored SQLite durable DB. The CLI is the "peak" surface: it turns agent process discipline (classify → retrieve minimal context → verify → trace → capture decisions/friction → self-improve) into **mechanically enforced, scored, queryable state** rather than instructions the model may ignore. vcskill installs capabilities (skills/agents/hooks); the harness installs *governance + memory + verification* — a different axis. Architecture is clean hexagonal: `domain.rs` (pure logic, scoring, 1583 LOC), `application.rs` (use-cases), `infrastructure.rs` (SQLite/fs), `interface.rs` (clap CLI), `epoch_fence.rs` (write fencing). Distributed as 5-platform prebuilt binary + sha256, same as vcskill.

Below: only the deltas — things vcskill lacks or does worse.

---

### 1. Durable, queryable project-memory DB (SQLite) as the agent's state layer
What: A git-ignored `harness.db` with tables `intake`, `story`, `decision`, `backlog`, `trace`, `tool`, `intervention` + schema migrations (`scripts/schema/00N-*.sql`). Decision to use SQLite is itself a recorded decision (`docs/decisions/0004-sqlite-durable-layer.md`). CLI exposes `query matrix/traces/friction/backlog/interventions/stats/improvement-health` and even a read-only `query sql` (rejects any write; infrastructure.rs:129). Files: `crates/harness-cli/src/infrastructure.rs`, `application.rs`.
Why peak: vcskill state is ephemeral (`receipt.json` records what was installed, nothing about *work done*). The harness gives agents a persistent, structured cross-session memory that survives context compaction — the single biggest agent reliability lever. Everything else (scoring, audit, proposals) is built on this.
Steal this: vcskill already ships a Bun binary + writes `receipt.json`. Add an optional embedded SQLite (`bun:sqlite`, zero dep) writing `~/.vcskill/state.db` or per-repo `.vcskill/state.db`: record install events, skill activations, doctor findings, migration history. Then `vcskill query` surfaces "what's installed where, when, and why". Turns the installer into a memory layer.
Effort: L (schema design + migration runner + query CLI). A minimal receipt→SQLite upgrade is M.

### 2. Trace quality scoring — mechanical rubric that grades an agent's own work log
What: `score_trace()` (domain.rs:838) grades a recorded trace Incomplete/Minimal(1)/Standard(2)/Detailed(3) by checking presence of fields (summary ≥10 chars, files_read/changed JSON, friction/errors, decisions, duration/tokens). `required_trace_tier_for_lane()` maps risk lane → required tier and returns `meets_requirement`. Auto-scored on write; re-scorable via `score-trace --id`. Spec in `docs/TRACE_SPEC.md` (tiers, lane mapping, good/weak examples). Pure fn, fully unit-tested (domain.rs:1500).
Why peak: converts "did the agent document its work well enough for the risk level" into a number with named missing fields. vcskill skills have prose "Output-format / Quality-gates / Proof vocab" but nothing *measures* compliance — it's advisory. This is a deterministic gate.
Steal this: Add a `vcskill validate --trace` or a hook that scores a structured session-summary/handoff object against a tiered rubric keyed to change risk. Reuse existing proof-vocab + risk-lane vocabulary as the rubric fields. Pure TS function, easy ≥90% coverage like the adapt engine.
Effort: M.

### 3. Context-selection scoring — grades whether the agent read the RIGHT files, not too many
What: `score_context()` (domain.rs:878) + `CONTEXT_RULES.md`. Infers phase (intake/planning/implementation/trace) from trace fields, computes per-lane MUST/SHOULD file sets, checks which were actually read (from `files_read`), and flags **over_read** (files read that the lane said to skip — e.g. tiny-lane reading ARCHITECTURE.md). Retrieval triggers escalate context only when schema/CLI/auth/API paths are touched. Token budgets per lane (~2K/5K/10K).
Why peak: this is real context-engineering enforcement — rewards minimal correct retrieval and penalizes over-reading. vcskill has shared risk lanes but no notion of measuring/enforcing what context a task should pull. Directly relevant to a "skills" tool: skills could declare their MUST/SHOULD/SKIP context and be scored.
Steal this: Give each vcskill skill a machine-readable `context-budget` (must/should/skip globs + token target) in frontmatter; add a scorer that, given a task's read-set, reports coverage + over-read. Even without runtime enforcement, publish it as a lint the skill author runs.
Effort: M (scorer) / L (per-skill context specs authored).

### 4. Drift audit + entropy score — quantifies harness/repo decay
What: `audit` command → `AuditResult` (domain.rs:1168) finds orphaned stories, unverified stories/decisions, backlog-without-outcomes, stale stories, broken tools. `entropy_score()` (domain.rs:1179) = weighted sum (orphan×10, unverified×5, stale×3, broken-tool×8…) capped at 100. `audit --record-evidence` persists episode transitions so proposals can cite stable audit evidence.
Why peak: a single inspectable "how decayed is this install" number, with named findings and next actions. vcskill has `doctor` (checks install integrity) but no *decay/staleness* metric across skills (e.g. skill installed but never activated, provider cell newly unverified, backup drift, orphaned receipt entries).
Steal this: Extend `vcskill doctor` into a scored audit: weight findings (missing backup, stale skill vs kit version, unverified provider cell now reachable, orphaned files not in receipt) into an entropy score + per-finding remediation command. Cheap, high UX value.
Effort: S–M (doctor already enumerates findings; add weights + score).

### 5. Improvement-proposal lifecycle with predicted-vs-actual outcome loop
What: `propose` (domain.rs:1199 `ImprovementProposal`, `IMPROVEMENT_PROTOCOL.md`) mines repeated trace friction + repeated interventions + nonzero audit categories into proposals with a **stable versioned key** (`proposal_key(rule_id, rule_version, canonical_issue)`, domain.rs:100). Evidence-aware lifecycle: new/pending/accepted/suppressed/**regression**/**reconsideration**. Accept → creates ONE backlog occurrence + schedules an outcome review (`--outcome-after-traces N`); later `backlog outcome record --status confirmed|ineffective|reverted` appends immutable measured outcomes compared against the original **predicted_impact**. `propose --commit` is deliberately rejected (never bulk-write suggestions). `query improvement-health` gives deterministic daily next-actions.
Why peak: a closed self-improvement loop that separates *prediction* from *measured result* and refuses to reopen handled evidence unless genuinely new evidence appears (regression/reconsideration). This is the most sophisticated mechanism in the repo. vcskill has zero feedback loop from usage back into the kit.
Steal this: Long-term. Aggregate doctor/validate friction + failed adapts into keyed "kit improvement" suggestions with predicted impact, and only surface new/regressed ones. Even a lightweight version — dedupe repeated install failures into stable-keyed actionable items — is valuable for a kit maintained across many provider cells.
Effort: L (full loop); M for stable-keyed friction dedupe only.

### 6. Epoch write-fencing — crash-safe, checksummed state transitions with fail-closed reads/writes
What: `epoch_fence.rs`. Every state-mutating command takes a shared file lock; a checksummed journal (`.harness/epoch-transition/journal.json`, sha256 over canonical payload) gates writes. States: `fenced`, `switched_pending_validation` allow reads but block writes; `complete`/`compensated` are terminal; anything else with `mutates_state` fails closed with a clear "writes remain fenced" error. Tampered checksum → `InvalidJournal`. Eliminates the check/start race by sharing the lock file.
Why peak: rigorous crash-consistency around a stateful migration/transition — fail-closed by default, tamper-evident. vcskill does atomic temp+rename writes + keeps last-3 backups (good), but has no fenced multi-step transition concept for its migrate/self-update flow (partial update could leave inconsistent state).
Steal this: For `vcskill migrate` and `self-update` (binary+kit swap), add a checksummed transition journal + lock so an interrupted update fails closed and the next run detects the incomplete transition instead of running on half-swapped state. Node has `fs` locks via lockfile libs or `proper-lockfile`.
Effort: M.

### 7. Semantic changesets + deterministic DB rebuild (append-only, sha-identified, replayable)
What: State mutations also append JSONL **changesets** (`changesets/<run_id>.changeset.jsonl`, header op with `version`, `run_id`, `base_schema_version`; infrastructure.rs:810+). `db changeset apply` is idempotent with **identity conflict detection** — reapplying a run_id with a different content sha256 errors (infrastructure.rs:77). `db rebuild` reconstructs a fresh DB purely from committed changesets, and **semantic replay preserves original timestamps** (verification/completion/closure times, nanosecond ordering) rather than substituting rebuild time (IMPROVEMENT_PROTOCOL.md:158). `db snapshot` = atomic SQLite online-backup.
Why peak: durable state is reproducible from committed, content-addressed operations — an event-sourcing spine. Backups aren't just file copies; the DB is *rebuildable and verifiable*. vcskill keeps last-3 target backups but has no reproducible-from-log rebuild or content-identity guard against double-apply.
Steal this: If adopting the SQLite memory layer (#1), record mutations as append-only sha-keyed changesets so state is rebuildable and migrations are idempotent with double-apply protection. Even for the current receipt model: make install/uninstall an append-only event log with content hashes, so `vcskill backups` can rebuild state, not just restore files.
Effort: L.

### 8. Protocol-v1 machine envelope + capability/compat discovery for external runners
What: `contract discover` (`ContractDiscoveryResult`, application.rs:123) returns `protocol_version`, `cli_version`, schema min/max, database_state (missing/current/needs_migration/unsupported), required env vars, and a **capabilities** list (e.g. `changesets.apply.v1`, `changesets.status-sha.v1`). Many commands take `--protocol` to emit a stable JSON envelope. An external orchestrator (Symphony) consumes this contract without parsing human output.
Why peak: the tool advertises its own versioned capability surface for programmatic consumers and negotiates schema compatibility — no scraping stdout. vcskill CLI output is human-first; other tools can't reliably introspect its capabilities/versions.
Steal this: Add `vcskill contract` / `--json` protocol envelopes: emit tool version, kit version, supported providers+artifacts (the spec-verified matrix!), and a capability list. The spec-verified provider gate is *exactly* a capability matrix begging to be machine-readable for CI and other installers.
Effort: S–M (matrix already exists in `spec-verified.ts`; serialize it).

### 9. Compare-and-set + runnable-graph gating for concurrent-safe state updates
What: `StoryCasUpdateInput` (application.rs:80) — status updates carry `expected_status` (compare-and-set checked *inside* the write transaction) and optional `require_runnable`, where "runnable" is computed from a **dependency DAG** (blocker→blocked edges, cycle-safe add/remove) + hierarchy edges. `story complete` runs fresh verify and marks implemented atomically, closing eligible backlog occurrences in the same transaction; concurrent/repeated completion is idempotent (`story update conflict: not runnable`, infrastructure.rs:73). `WorkGraphResult` carries a content-hash `revision`.
Why peak: safe concurrent multi-agent state mutation with optimistic concurrency + dependency-ordered readiness — no lost updates. vcskill is single-writer install; no concurrency model, but multi-agent orchestration (which vcskill's ecosystem clearly uses) needs exactly this.
Steal this: If vcskill ever tracks task/skill-activation state for multi-agent runs, use CAS (expected-version) writes + a revision hash so parallel agents don't clobber. Conceptual port even without the DB: version any shared JSON state and reject stale writes.
Effort: M (depends on #1).

### 10. Machine-readable tool registry with liveness probing
What: `tool` table + `docs/TOOL_REGISTRY.md`. Tools registered with `kind` (cli/binary/mcp/skill/http), `capability`, `scan_target` (declarative path/URL). `tool check` probes each and persists present/missing/unknown status; `query tools` filters by capability/status (interface.rs:410+, infrastructure.rs:2411+).
Why peak: the harness knows which external tools exist *right now* and by capability, and records it. vcskill's skill catalog is static text (huge routing tables in CLAUDE.md); no liveness/health probe of the tools skills depend on.
Steal this: A `vcskill tools check` that probes dependencies skills declare (e.g. ffmpeg, gh, python venv, MCP endpoints) and reports present/missing/unknown by capability — turns the routing docs into a health-checkable registry. Directly complements doctor.
Effort: M.

### 11. Read-only vs change authority gate keyed to request outcome (not keyword)
What: `CONTEXT_RULES.md` "Authority Gate": read-only requests (answer/explain/review/plan) may NOT mutate state (no bootstrap/intake/trace); only explicit change requests do. Crucially "review and apply fixes" is a change request because the *outcome* is edits — "request outcome, not a single keyword, sets authority." Enforced by AGENTS.md shim being the first read.
Why peak: a crisp, outcome-based permission model preventing agents from mutating state during read-only asks. vcskill hooks include `scout-block`/`privacy-block` (good) but no unified outcome-based authority gate that scales mutation permission to intent.
Steal this: Formalize a lightweight authority gate in vcskill's hook/rules layer: classify request outcome (read-only vs mutating) and gate state-writing operations accordingly. Conceptual, cheap, improves the existing hook suite.
Effort: S (doc/hook rule).

### 12. Self-verifying install: source checkout refuses to fabricate empty state
What: `bootstrap-harness.sh` — a **source checkout** rebuilds the CLI and *validates the restored core-state epoch*; it refuses to fabricate an empty replacement for missing repository state. An installed project reuses the verified release binary and inits its own empty local state. Release assets built+proven across 5 platforms *before* tag promotion; failed tags never moved/reused; CI verifies a pinned upgrade transition (`v0.1.14`).
Why peak: distinguishes "I am the source of truth, my state must be intact" from "I am a consumer, empty is fine" — prevents silent state loss on the authoring repo. Release integrity: prove-before-promote + immutable tags + upgrade-transition test. vcskill has sha256 + self-update but (per baseline) no explicit prove-before-promote upgrade-transition gate or anti-fabrication check on its own kit source.
Steal this: (a) In vcskill's release CI, add a pinned old→new upgrade-transition test before publishing (install prior version, self-update, assert state intact). (b) Guard the authoring repo so a broken/missing kit isn't silently replaced by an empty one.
Effort: S–M (CI additions).

### 13. Component taxonomy self-audit (Covered/Partial/Missing responsibility map)
What: `docs/HARNESS_COMPONENTS.md` maps the repo to 11 "Runtime Substrate" responsibilities + NexAU 7-surface decomposition, each Covered/Partial/Missing with evidence files + named gaps + a coverage summary (8/11 covered). Plus `HARNESS_MATURITY.md` H0–H? ladder with *verifiable* criteria per level and current status.
Why peak: the project grades its own completeness against an explicit capability framework, with file-level evidence — a living self-assessment that doubles as a roadmap. vcskill has docs/ but no self-scored capability-coverage matrix or maturity ladder.
Steal this: Add a `docs/coverage-matrix.md` mapping vcskill to installer responsibilities (authoring, adapt, verify, backup, memory, self-improve…) with Covered/Partial/Missing + evidence, and a maturity ladder. Pure doc; sharpens roadmap and marketing ("what we don't do yet, verifiably").
Effort: S.

---

## Top 5 worth stealing

| Rank | Mechanism | vcskill port (Rust→TS) | Effort |
| --- | --- | --- | --- |
| 1 | Durable queryable memory DB (#1) | `bun:sqlite` state layer: install/activation/doctor history + `vcskill query` | L (M for receipt→sqlite) |
| 2 | Trace quality scoring (#2) | Tiered rubric scorer over session/handoff objects, keyed to risk lane; pure TS, ≥90% cov | M |
| 3 | Drift audit + entropy score (#4) | Upgrade `doctor` into weighted, scored audit with per-finding remediation | S–M |
| 4 | Protocol/capability envelope (#8) | Serialize spec-verified provider matrix as machine-readable `vcskill contract --json` | S–M |
| 5 | Epoch write-fencing (#6) | Checksummed transition journal + lock for `migrate`/`self-update` (fail-closed) | M |

Honorable mentions: context-selection scoring (#3), improvement-proposal outcome loop (#5, highest ceiling but L), semantic changesets/rebuild (#7).

## Unresolved questions
1. Does vcskill's ecosystem run multiple agents against one install concurrently? If yes, CAS/runnable-graph (#9) jumps in priority; if single-writer, deprioritize.
2. Is persistent per-repo state in scope for a "kit installer," or is vcskill deliberately stateless? Items #1/#5/#7 hinge on this product decision.
3. Would a machine-readable capability contract (#8) have a real consumer (CI, another installer, orchestrator), or is it speculative? Symphony proves the pattern's value for the harness; unclear for vcskill.
4. The scoring rubrics (#2/#3) assume a recorded "trace" of agent work — does vcskill capture any structured session record today, or would that machinery need building first?
5. Couldn't confirm exact SQLite pragmas/WAL usage or full changeset op vocabulary without deeper read of infrastructure.rs (10k LOC); ports above rely on documented behavior + signatures, sufficient for concept transfer.

Status: DONE | Summary: Harness's peak deltas are a durable SQLite agent-memory layer with scored traces/context, drift-entropy audit, a predicted-vs-actual improvement loop, and crash-safe checksummed state transitions — vcskill is stateless by comparison and should steal the memory+scoring+audit spine first.
