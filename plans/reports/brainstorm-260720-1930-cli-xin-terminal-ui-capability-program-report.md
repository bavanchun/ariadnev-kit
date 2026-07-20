# Brainstorm: vcskill CLI "xịn" program — terminal UI + capability parity/superiority

Date: 2026-07-20
Mode: brainstorm (problem-first). Flags: none.
Source reports: `plans/reports/scout-260720-1724-{archon,claudekit-engineer,repository-harness}-standout-deltas-report.md`
Prior shipped: `plans/reports/brainstorm-260720-1731-installer-selfverify-kit-quality-gates-report.md` → 0.7.0 (6 items already done).

## Problem statement

User wants vcskill's **CLI** to feel as good as — or better than — 3 competitor kits (Archon, claudekit-engineer, repository-harness). Underlying problem (problem-first): not "am I missing features" (vcskill is already a mechanical near-sibling of Archon), but "does the CLI **look and prove** like a serious, distinctive tool". Two explicit user adds mid-session: a **`vc` short alias** and a **beautiful, distinctive terminal UI** (emphasized twice → headline requirement).

## Verified current state (scout)

- Architecture already at parity: Bun single binary, embedded kit, curl|bash + sha256, self-update, adapt engine, `install/doctor/validate/contract/backups/migrate`, atomic writes + backups, TDD.
- 0.7.0 already shipped 6 top report items: matrix drift gate, description-collision scorer, release smoke-test, managed-hooks self-heal, env-scope security, update nudge.
- **Output layer is 100% plain strings via pure formatters** (`render-summary.ts`, `renderDoctorSummary`, …). No color/TTY/ANSI anywhere → clean base for a styling layer.
- **Windows is real**: `install.ps1` + `bun-windows-x64` target both exist (NOT a gap).
- `doctor` derives an overall status + exit 0/1/2 but is NOT tri-state per-check (`skip/pass/fail`).
- **Missing**: `SECURITY.md`, credential sanitization, telemetry (none), SQLite state (none). `contract --json` emits `{version, providers}` only (no `protocol_version`/`capabilities[]`).
- `install.sh`: `mv → ${INSTALL_DIR}/vcskill; chmod +x` → `vc` alias = one extra symlink. Same for ps1 + npm `bin` field.

## Scope decisions (user-confirmed)

- **In scope (all 7 phases)**: terminal UI + `vc` alias; scored doctor; security posture; `vc eval`; reliability + machine surface; SQLite memory; telemetry.
- **Push-back overruled**: user chose "Both" for telemetry + SQLite despite YAGNI advice → included, **sequenced last** so high-value/high-visibility work lands first; user may bail on 6/7 after earlier phases.
- **Rollout**: plan all 7 up front, build in order.
- **UI boldness**: **Bold & branded** — full web↔terminal brand cohesion.

## Design — the 7-phase program

Theme: *"vcskill that looks and proves like a serious tool."* Build order chosen so UI (Phase 1) is the foundation phases 2/4/6 render through — avoids re-skinning twice.

### Phase 1 — Identity + terminal UI (foundation, most visible)
- **`vc` short alias**: npm `bin` `{vcskill, vc}`; `install.sh` + `install.ps1` create a `vc` symlink/copy next to the binary; README/landing updated.
- **`ui/` module** (hand-rolled, zero external dep, pure, testable):
  - color gate: honor `NO_COLOR`, `FORCE_COLOR`, `process.stdout.isTTY`, Windows (modern Terminal ok / legacy cmd → plain). Pass `color:false` in tests → deterministic plain output.
  - palette from landing page: coral `#ff6b45` (brand/accent), teal `#4fb8a4` (ok/verified), amber (warn), faint gray (muted/skip). Truecolor + 16-color fallback.
  - primitives: `symbols` (`✓ ✗ ⚠ ◆ ·` = same glyphs as landing matrix), `box`, `table`, `bar` (health), `spinner`, `wordmark` (`>_ vcskill`).
- **Re-skin** existing pure formatters through `ui/`: install summary, doctor, list, validate, `contract` matrix as a real terminal grid (mirrors landing signature), no-args/`--help` banner.
- **Distinctive hook**: terminal output visually echoes `vcskill.vchun.dev` (coral, `>_`, matrix glyphs) — web↔terminal identity almost no personal kit has.
- Constraints: keep formatters pure; UI degrades on pipe/CI; cross-platform incl Windows.

### Phase 2 — doctor → scored audit
- Per-check **tri-state** `skip|pass|fail` (skip = unconfigured/optional provider, never nags); resilient (one thrown check ≠ abort whole run).
- **Weighted health score** 0–100 (entropy-style: missing backup, version drift, unverified-now-reachable provider cell, orphaned receipt entry, drifted hook binding …).
- **Per-finding remediation command** (`↳ run vc update` / `vc doctor --fix`).
- Rendered via Phase-1 UI (health bar + colored glyph rows).
- Pure scorer, ≥90% coverage like adapt engine.

### Phase 3 — Security posture
- **`SECURITY.md`**: private vuln reporting (GitHub advisories + email), scope, user best-practices.
- **credential-sanitizer** (pure): redact `GH_TOKEN`/`GITHUB_TOKEN` values + `https://x@host` creds from ALL error text/stacks before any print/log. Wire top-level catch in `index.ts` + any logging path through it.

### Phase 4 — `vc eval` (differentiator for a skills kit)
- **tier-1 static** (reuse existing `validate`) — always, $0, CI-safe.
- **tier-3 LLM-judge** behind `VC_EVAL_CMD` env (e.g. `claude`/`ccs`): send each `SKILL.md` (cap ~3000 chars), score clarity/specificity/completeness 1–10, flag overall <6, write `results/judge-{date}.json`. Extract JSON via regex.
- Flags `--diff` (changed skills only), `--skill <name>`, `--all`. Cost-tiered → CI stays free, authors opt into paid deep check.

### Phase 5 — Reliability + machine surface
- **Upgrade-transition CI test**: install prev release → `self-update` → assert kit intact + version bumped (proves an update can't brick an install).
- **`contract` protocol envelope**: extend `--json` with `protocol_version`, `capabilities[]` (e.g. `providers.matrix.v1`, `install.receipt.v1`), schema min/max — machine-readable capability discovery for edge/CI consumers.

### Phase 6 — SQLite memory + `vc query` (push-back overruled)
- `bun:sqlite` (zero dep) state db (`~/.vcskill/state.db` and/or per-repo `.vcskill/state.db`): append-oriented event log — install/uninstall, doctor findings, migrations, eval runs.
- **`vc query`** surfaces installed-where/when/why, doctor-trend, history. Minimal schema + migration runner. Start with receipt→sqlite upgrade (M), not full event-sourcing (L).

### Phase 7 — Privacy-first telemetry (push-back overruled)
- Categorical-only, write-only embedded key, fire-and-forget, `silentFetch` (network failures never print).
- Opt-out precedence: `DO_NOT_TRACK=1`, `VCSKILL_TELEMETRY_DISABLED=1`, `CI=true` auto-off, config off.
- Per-event privacy invariants (`$ip:''`, no person profile); user names → `"custom"`; no raw error text (fixed `errorClass` enum). First-run consent notice (schema-versioned). `vc telemetry status|reset`.

## Risks / considerations

- **Scope size**: 7 phases, multiple sessions. Mitigate: strict build order, ship per phase, phases 6/7 abortable.
- **UI cross-platform**: Windows legacy terminals; must degrade cleanly. Test matrix incl `NO_COLOR`/non-TTY.
- **Purity discipline**: `ui/` must stay pure (color flag param, no global) so existing formatter tests stay deterministic — matches project rule (adapt engine pure, ≥90%).
- **Bundle/dep weight**: prefer hand-rolled `ui/` over a styling dep to keep the Bun binary lean and controllable.
- **eval cost/availability**: tier-3 needs an external AI CLI; must skip cleanly + stay $0 in CI.
- **telemetry privacy**: highest-scrutiny surface; per-event invariants + write-only key are mandatory, not optional.
- **`vc` alias collision**: check `vc` isn't a common existing binary on user PATH; document override.

## Success metrics

- `vc` works as an alias on macOS/Linux/Windows; README/landing show it.
- Terminal output is colored/branded on TTY, plain on pipe/CI/`NO_COLOR`; recognizably matches the website.
- `vc doctor` prints a health score + per-finding fix command; tri-state (no red for unconfigured).
- `vc eval` scores skills; $0 tier-1 in CI, opt-in tier-3.
- `contract --json` carries protocol_version + capabilities.
- Upgrade-transition test green in release CI.
- `vc query` returns install/doctor history; telemetry categorical + opt-out honored.
- `pnpm test` stays green throughout; adapt engine coverage unchanged.

## Build order / dependencies

1 (UI foundation) → 2 (renders through UI) → 3 (security, independent) → 4 (eval, independent) → 5 (reliability/machine) → 6 (sqlite) → 7 (telemetry). 6 & 7 abortable after 1–5.

## Recommended next step

`/ck:plan --tdd` — program refactors the output layer + doctor (existing behavior + strong pure-formatter test coverage to preserve), so tests-first per phase locks current behavior before re-skin/refactor.

## Unresolved questions

- `vc` alias: any known PATH collision on the user's target machines? (Provide `VCSKILL_ALIAS=off` escape?)
- SQLite scope: global `~/.vcskill/state.db`, per-repo `.vcskill/state.db`, or both? (Product decision — affects schema.)
- Telemetry endpoint: reuse the existing edge Worker (`vcskill.vchun.dev`) as the ingest, or a PostHog-style write-only key? (Edge reuse avoids a new vendor.)
- eval: which AI CLI is the default `VC_EVAL_CMD` on the user's machine (`claude`? `ccs glm`?), and is paid tier-3 ever wanted in CI or authors-only?
