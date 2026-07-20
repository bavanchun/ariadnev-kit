---
phase: 6
title: History + Query (JSONL)
status: completed
effort: M
---

# Phase 6: History + Query (JSONL, MVP)

## Overview

Add a durable local history and a `vc query` surface. MVP-trimmed per red-team: an **append-only `history.jsonl`** (Node-native, zero deps) — **NOT SQLite**. This kills the `bun:sqlite`-vs-Node-test problem, the StateStore-interface+2-stores+migrations premature abstraction, and reuses nothing that `receipt.json` already covers (query complements the receipt with a time-ordered event log).

## Requirements

- Functional: install/uninstall/doctor/update/eval append a **scrubbed, enum-only** event line to `history.jsonl`; `vc query` reports install history + doctor-trend. Recording is best-effort AND **surfaces degradation** (never silently loses history).
- Non-functional: pure record/format/query layer ≥90% (in `coverage.include`); Node-native (no Bun-only import anywhere in `src/`).

## Decisions locked

- **Location**: global `~/.vcskill/history.jsonl` (survives per-repo, one timeline per machine). If a per-repo log is ever wanted, write `.vcskill/.gitignore` (`*`) into the user's cwd dir first (red-team) — but MVP is global-only, so no cwd file, no gitignore-wrong-repo problem.
- **No SQLite, no interface, no migrations, no stores.** A newline-delimited JSON append + a read-all-parse-filter is the whole design.

## Architecture

`src/history/record.ts` (pure): `toEvent(kind, data) → HistoryEvent` mapping domain→a small enum/categorical shape (kind, provider, scope, version, count-buckets, `errorClass`). **Scrub via a strict allowlist** — only enumerated fields serialized; free-form/secret data (e.g. a `VC_EVAL_CMD` string) never persisted (red-team). `src/history/store.ts`: `append(event)` (atomic append to `~/.vcskill/history.jsonl`) + `readAll()` (tolerant line parse, skips corrupt lines). `src/cli/query-command.ts`: `vc query [installs|doctor|history]` → `ui/style` table over parsed events.

**Best-effort + surfacing (red-team)**: `append` is wrapped try/catch so a write failure never breaks the host command; on failure it sets a lightweight marker (e.g. `~/.vcskill/history.degraded`) that `vc query` and `vc doctor` read to print "history recording degraded — may be incomplete." Distinguish "no events" from "recording broken."

## Related Code Files

- Create: `packages/cli/src/history/record.ts`, `store.ts` + tests; `packages/cli/src/cli/query-command.ts` + test
- Modify: `packages/cli/src/index.ts` (register `query`); install/uninstall/doctor/update/eval command wiring (best-effort append); `vitest.config.ts` (coverage.include += `src/history/**`), `README.md`

## Implementation Steps (TDD — tests first)

1. **Failing tests** (pure, Node): `toEvent` emits only allowlisted enum fields (a secret-ish input field is dropped); `readAll` skips a corrupt line; install→`query('installs')` round-trips; doctor-trend aggregation.
2. Implement `record.ts` + `store.ts` (atomic append, tolerant read); extend `coverage.include`.
3. **Failing test**: `append` failure (fault-injected fs) → host command still succeeds AND the degraded marker is set; `vc query`/`doctor` surface "recording degraded."
4. **Failing test** for `vc query` formatting (`color:false`) via injected reader; implement `query-command.ts`.
5. Wire best-effort append into the mutating commands; register `query`.
6. Manual: install → `vc query installs`; `vc query doctor`.

## Success Criteria

- [ ] History is a Node-native `~/.vcskill/history.jsonl`; **no `bun:sqlite` / no Bun-only import in `src/`** (grep-test enforced).
- [ ] Events are enum/allowlist-only; no free-form/secret data persisted (proven by test).
- [ ] `append` failure never breaks install/doctor AND is surfaced via a degraded marker (not silently swallowed).
- [ ] `vc query` reports install history + doctor-trend via `ui/`.
- [ ] Pure layers ≥90% (in `coverage.include`); `pnpm test` (Node) green.

## Risk Assessment

- **bun:sqlite Node-test poisoning** [red-team High]: eliminated — JSONL is Node-native. Grep-test forbids any `bun:sqlite` static import.
- **Silent history loss** [red-team Medium]: degraded marker surfaced by query/doctor.
- **Secret in payload** [red-team High]: strict allowlist scrub in `toEvent`; test drops a secret-ish field.
- **Scope creep**: no SQLite/interface/migrations/event-sourcing — revisit only if a concrete need appears.
