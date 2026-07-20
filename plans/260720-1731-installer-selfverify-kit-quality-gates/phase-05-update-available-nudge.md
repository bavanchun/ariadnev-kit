---
phase: 5
title: Update-available nudge
status: completed
effort: ''
---

# Phase 5: Update-available nudge

## Overview

Passive "a newer vcskill exists" hint on normal commands — cached, fast, silent-on-error, decoupled
from the active `update` command. Pure DX; you have `update` but no nudge.

## Requirements

- Functional:
  - On a normal command run, check a cached last-known-latest (TTL 1h) under `~/.cache/vcskill/update-check.json`;
    if stale, do a 3s-timeout swallow-on-error fetch to `/version`; if remote > current, print ONE stderr line
    (e.g. `vcskill 0.7.0 available — run: vcskill update`).
  - Off when `CI` set, `--quiet`, or non-TTY; never blocks or delays the actual command (async/best-effort).
  - Decoupled: `update` command itself unchanged; nudge only reads cache + optionally refreshes.
- Non-functional: no failure ever surfaces to the user (offline → silent); adds no measurable latency.

## Architecture

New `src/cli/update-check.ts`: `maybeNudge({execPath, isBinary, now, cacheDir})` — reads/writes the cache
file (atomic), reuses `update-command.ts::fetchLatestVersion`. Called early from `index.ts` guarded by
`isBinary && !CI && stderr.isTTY && !--quiet`. Writes to stderr only. Cache under the same
`VCSKILL_CACHE_DIR` root as embedded-kit, separate file.

## Related Code Files
- Create: `packages/cli/src/cli/update-check.ts` (+ `.test.ts`)
- Modify: `packages/cli/src/index.ts` (invoke guarded), reuse `update-command.ts::fetchLatestVersion`
- Read-only: `src/kit/embedded-kit.ts` (cache root helper)

## Implementation Steps (TDD)
1. **Test first**: `update-check.test.ts` — fresh cache (age <1h) with newer version → returns hint string; stale cache triggers a (mocked) fetch; fetch error → returns null (silent); remote ≤ current → null; CI/non-TTY guard → null.
2. Implement `maybeNudge` with injected clock + fetch + fs (pure-ish, testable) to pass.
3. Wire into `index.ts` behind the guards; ensure it never throws and never awaits in a way that delays output.
4. Manual check: stale cache + newer remote prints one stderr line; `CI=1` silent; offline silent.

## Success Criteria
- [ ] `update-check.test.ts` green across all branches (fresh/stale/error/older/guarded)
- [ ] Newer remote → single stderr hint; command output on stdout unaffected
- [ ] `CI=1`, `--quiet`, non-TTY, or offline → completely silent
- [ ] Zero added latency / never throws

## Risk Assessment
- Accidental stdout pollution breaks piping (`| bash` consumers) → hint MUST go to stderr; test asserts stdout clean.
- Nudge fetch delaying commands → strict 3s timeout + best-effort; do not block the command on it.
