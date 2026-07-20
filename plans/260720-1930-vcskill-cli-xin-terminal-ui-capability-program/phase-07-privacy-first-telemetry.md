---
phase: 7
title: Privacy-First Telemetry
status: completed
effort: S
---

# Phase 7: Privacy-First Telemetry (MVP)

## Overview

Optional, categorical-only, opt-out anonymous telemetry. MVP-trimmed per red-team: **stateless** (no stable device id → genuinely no PII), consent-before-capture, hard timeout, and the ingest route is a **hard prerequisite** (not "optional") before the CLI ever points at it. Abortable — least user-visible phase.

## Requirements

- Functional: fire-and-forget categorical events (`vc_started`, `install_completed` with categorical flags, `adapt_failed` with an `errorClass` enum). Opt-out precedence honored. First-run notice shown BEFORE any capture. `vc telemetry status` (no `reset` — there's no id to rotate).
- Non-functional: network failures silent AND non-blocking (hard timeout + unref, never awaited on exit). Only categorical enums leave the machine — enforced per-event, tested. Pure classify/consent layer ≥90% (in `coverage.include`).

## Decisions locked

- **Ingest = a SEPARATE edge route/Worker, NOT the token-proxy Worker** (red-team): no shared code path with the GitHub-token proxy; require rate-limit + enum/size validation at the edge. The `/t` route is a **hard prerequisite** — the CLI capture URL defaults **off** (config/const) until the route ships and is verified, so a first-run POST can never 404 the token origin.
- **Stateless — no `~/.vcskill/telemetry-id`** (red-team): send truly stateless categorical counts. Eliminates the pseudonymous-profile / "no PII is false" problem entirely. (If longitudinal data is ever needed, revisit honestly as pseudonymous with disclosure.)

## Architecture

`src/telemetry/consent.ts` (pure): `isEnabled(env, config) → {enabled, reason}`. Precedence: `DO_NOT_TRACK=1`→off; `VCSKILL_TELEMETRY_DISABLED=1`→off; `CI` truthy→off; config `telemetry:false`→off; **capture URL unset/off→off**; else on. `src/telemetry/sanitize.ts` (pure): `classifyError(err)→errorClass enum`; user-authored names→`"custom"`; per-event invariants applied to EVERY payload; a test asserts no non-enum field is ever present. `src/telemetry/client.ts`: `capture(event, deps)` — builds payload, `silentFetch` with a **~1–2s `AbortController` timeout**, `.catch(()=>{})`, socket `unref`, **never awaited on the process-exit path**. `src/cli/telemetry-command.ts`: `status` only (enabled/reason/host). First-run notice: on missing stamp file, print the notice and **suppress ALL capture that run** (consent-before-send).

## Related Code Files

- Create: `packages/cli/src/telemetry/consent.ts`, `sanitize.ts`, `client.ts` + tests; `packages/cli/src/cli/telemetry-command.ts` + test
- Modify: `packages/cli/src/index.ts` (register `telemetry status`; guarded `vc_started` capture), install/adapt capture sites, `vitest.config.ts` (coverage.include += `src/telemetry/**`), `README.md` (Telemetry section — exact fields + opt-out)
- Prereq (separate edge repo): a rate-limited, enum-validating `/t` ingest route on its OWN Worker/route

## Implementation Steps (TDD — tests first)

1. **Failing tests**: `isEnabled` precedence (DO_NOT_TRACK / VCSKILL_TELEMETRY_DISABLED / CI / config / URL-unset / default); `classifyError`→enum; user skill name→`"custom"`; payload always carries invariants + NO non-enum field.
2. **Failing test**: with no stamp file, `capture` deps' fetch is **never called** (consent-before-send); after stamp exists, capture is allowed.
3. **Failing test**: `capture` with an injected fetch that hangs → resolves within the timeout, never throws/prints, does not block (fake timers).
4. Implement pure modules + `client.ts` (timeout+unref) + `telemetry-command.ts` (status) until green.
5. Wire guarded capture at `vc_started` + install/adapt (behind `isEnabled`; capture URL defaults off until the edge route exists).
6. README "Telemetry" section: exact events/fields + how to opt out. Ship the edge `/t` route (separate Worker) BEFORE enabling the default URL.

## Success Criteria

- [ ] Opt-out precedence fully honored + tested; `CI`/`DO_NOT_TRACK`→off; URL-unset→off (safe default).
- [ ] Stateless — no device id file; only categorical enums sent; per-event invariants proven; no user names / raw error text leak.
- [ ] First-run notice precedes ANY capture (run-1 sends nothing); proven by test.
- [ ] `capture` bounded by ~1–2s timeout, unref'd, never blocks exit; proven by a hanging-fetch test.
- [ ] `/t` on a separate rate-limited route; CLI URL defaults off until it ships. `vc telemetry status` works; README documents fields.
- [ ] Pure layers ≥90% (in `coverage.include`); `pnpm test` green.

## Risk Assessment

- **Pre-consent send** [red-team High]: consent-before-capture; run-1 sends nothing (tested).
- **CLI hang on captive network** [red-team High]: ~1–2s AbortController + unref + never-awaited (tested with hanging fetch).
- **Pseudonymous profile / false "no PII"** [red-team Medium]: eliminated — stateless, no id file.
- **Coupling ingest with token proxy** [red-team Medium]: separate route, rate-limited; CLI URL off until it ships.
- **Scope**: if phases 1–6 already satisfy the "xịn" goal, this phase can be dropped — least user-visible.
