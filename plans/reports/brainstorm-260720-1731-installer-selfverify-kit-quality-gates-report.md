# Brainstorm — Installer Self-Verification + Kit-Quality Gates

- Date: 2026-07-20
- Mode: brainstorm (no --html/--wiki)
- Source deltas: `plans/reports/scout-260720-1724-{claudekit-engineer,repository-harness,archon}-standout-deltas-report.md`
- Handoff: `/ck:plan --tdd`

## Problem statement

vcskill's distribution is already state-of-art (Archon, a near-twin, taught nothing there). Real gaps vs the 3 kits cluster in two bands: **(a) the shipped binary can break silently** (this session hit exactly that — empty `--version`, isEntry no-output, hook-verify-with-wrong-runtime), and **(b) kit quality / installer truth is guarded only by static lint + hand-maintained docs** (provider matrix in README edited by hand → drift). Competitors automate both.

Scope = 6 upgrades, one coherent theme: *the tool proves itself correct, and the kit's quality/truth is machine-gated.* Explicitly NOT adopting harness's governance/memory layer (SQLite memory, trace scoring, context-selection) nor Archon telemetry — off-identity for a kit installer (YAGNI).

## Locked requirements (per user decisions)

- **Expected output:** 1 plan, 6 independent phases, TDD, ranked by value.
- **Scope boundary (OUT):** durable SQLite/agent-memory, trace-scoring, context-selection, privacy telemetry, full `.ck.json` config engine, epoch write-journal (only crash-safe slice for migrate/self-update may come later, not this round).
- **Constraints:** tests-first per phase; adapt engine stays pure + ≥90% cover; path constants single-sourced in `adapt/paths.ts`; hooks fail-open; cross-platform (`os.homedir`/`path.join`); files <200 LOC kebab-case; comments explain why.
- **Non-negotiable identity:** vcskill stays a kit-authoring + adapt-installer; no pivot to governance product.

## Evaluated approaches (per phase) + decisions

### Phase 1 — Release smoke-test (from Archon; effort S) — highest fit
Run the freshly-compiled host-target binary in a scratch git dir; assert: embedded kit loads, `--version` returns correct build-type+version, resolver output never leaks absolute `/Users/...` dev paths. Fail → CI red.
- Touchpoints: `.github/workflows/release.yml`, new `packages/cli/scripts/smoke-binary.mjs`.
- Why peak: guards the exact silent-break class already seen this session.
- Acceptance: CI step runs the binary, non-zero on any assertion; passes on a good build.

### Phase 2 — Skill-description collision scorer (from claudekit; S)
New kit-level lint rule: Jaccard token-set similarity across all skill `description`s → flag confusable pairs + routing cycles.
- **Decision: WARN by default, ERROR only ≥ hard near-duplicate threshold.** (single-author curated kit; avoid CI annoyance.)
- Touchpoints: `kit/skill-lint.ts` (cross-skill rule — currently per-skill; needs a kit-level pass), surfaced via `validate-command.ts` `findings[]`.
- Acceptance: two near-identical descriptions → error; mildly-similar → warning; distinct → clean.

### Phase 3 — Matrix auto-gen + drift gate + `contract --json` (Archon + harness; S/M)
Generate the README provider×artifact matrix from `resolver.ts` + `spec-verified.ts` (single source). `vcskill validate --check` fails on drift between generated + committed table. New `vcskill contract --json` serializes version + capabilities + per-provider verified paths.
- **Decision: include `contract --json` this round.**
- Touchpoints: new `packages/cli/scripts/generate-provider-matrix.mjs`, `validate-command.ts` (--check), new `contract-command.ts`, README block markers.
- Acceptance: editing the README table by hand → `validate --check` fails; regen fixes it; `contract --json` emits schema-stable JSON.

### Phase 4 — managed-hooks self-heal in doctor (claudekit; S)
`doctor` detects drifted/missing hook event-bindings in `.claude/settings.json` vs the kit's expected set; `doctor --fix` re-merges idempotently (backup first).
- Touchpoints: `doctor-command.ts`, `doctor/diagnose.ts` (`DiagnoseDeps` already has `readSettingsJson`).
- Acceptance: remove a binding → doctor reports it; `--fix` restores it; re-run clean; declining leaves a copy-paste snippet.

### Phase 5 — stripCwdEnv / owned-dir env scope (Archon; S/M) — GATED
- **Decision: verify-spike FIRST.** Confirm whether a Bun *compiled* binary auto-loads a target repo's `.env` into `process.env` (injecting `VCSKILL_*`). Implement strip only if a real leak is proven; otherwise drop with a one-line note.
- Touchpoints: `packages/cli/src/index.ts` (startup), read-only spike harness.
- Acceptance (if leak real): a `.env` in cwd with `VCSKILL_CACHE_DIR=…` does NOT alter behavior after strip.

### Phase 6 — update-available nudge (Archon; S)
Passive check: cached 1h under `~/.cache/vcskill/`, 3s timeout, swallow-on-error hit to `/version`; print a one-line stderr hint when newer exists. Off under `CI`/`--quiet`. Decoupled from the active `update` command.
- Touchpoints: `index.ts`, reuse `update-command.ts::fetchLatestVersion`.
- Acceptance: stale cache + newer remote → stderr hint on a normal command; `CI=1` silent; offline → silent.

## Recommended solution

Single `--tdd` plan, 6 phases, execute in value order **1 → 3 → 2 → 4 → 6 → 5** (5 last since it's spike-gated). Each phase independently shippable; no shared-file contention except `validate-command.ts` (P2+P3 — sequence them, P3 after P2).

## Risks

- P3 README block-marker regen must be deterministic (sorted keys) or the drift gate flaps. Mitigate: canonical serializer + golden test.
- P2 Jaccard thresholds are heuristic → pick thresholds via a test over the current 21 descriptions (must currently pass at "warn", none at "error").
- P5 may be a no-op → the spike prevents wasted code.
- `contract --json` is a new public surface → keep schema minimal + versioned.

## Success metrics

- CI fails on: a broken binary, a hand-edited stale matrix, a near-duplicate skill description.
- `doctor --fix` restores a tampered hook binding.
- `contract --json` consumed by the edge/landing without code changes.

## Unresolved questions

1. Does Bun compiled binary actually auto-load cwd `.env`? (P5 spike answers this.)
2. `contract --json` schema — include per-artifact target *paths*, or only verified booleans + version? (lean: paths, since that's the drift-prone data.)
3. Nudge cache location under `VCSKILL_CACHE_DIR` override — reuse embedded-kit cache root or a separate `update-check` file? (lean: same root, separate file.)
