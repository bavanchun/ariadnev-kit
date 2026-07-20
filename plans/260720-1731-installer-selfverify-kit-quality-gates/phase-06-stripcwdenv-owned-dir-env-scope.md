---
phase: 6
title: stripCwdEnv owned-dir env scope
status: completed
effort: ''
---

# Phase 6: stripCwdEnv owned-dir env scope

## Overview

**Spike-gated hardening.** A Bun compiled binary MAY auto-load a target repo's `.env` into
`process.env`, letting a hostile repo inject `VCSKILL_*` (e.g. redirect `VCSKILL_CACHE_DIR`).
First PROVE the leak; implement the strip only if real. Otherwise close with a documented note.

## Requirements

- **Spike (do first)**: build the host binary, put a `.env` in a scratch cwd with
  `VCSKILL_CACHE_DIR=/tmp/hijack` + `VCSKILL_EMBEDDED=1`, run the binary, observe whether those vars
  reach `process.env` / change behavior. Record verdict in the phase.
- **If leak real**: at the very top of `index.ts`, before any config read, delete `VCSKILL_*` keys that
  originated from a cwd `.env` (or, simpler + robust: snapshot allowed env from the real process env
  before Bun's dotenv runs — confirm ordering — else explicitly unset the known `VCSKILL_*` set unless
  passed via real shell env). Ownership = only `~/…` and process env are trusted, not cwd files.
- Non-functional: must NOT break legitimate `VCSKILL_*` set via real shell env or CI.

## Architecture

Depends on spike outcome. Preferred if leak real: a tiny `src/env-scope.ts` run as the first import in
`index.ts` that reconciles `process.env` against a trusted source. Distinguishing "from shell" vs "from
cwd .env" may be impossible after the fact → fallback design: vcskill reads its own config ONLY from an
explicit allowlist and ignores cwd `.env` by construction (document the trust boundary).

## Related Code Files
- Create (if implementing): `packages/cli/src/env-scope.ts` (+ `.test.ts`)
- Modify (if implementing): `packages/cli/src/index.ts` (first-line import)
- Always: append spike verdict + decision to this phase file

## Implementation Steps (TDD)
1. **Spike**: run the leak experiment above; write the verdict here. If NO leak → mark phase `closed: no-op`, note why, STOP.
2. If leak: **test first** — `env-scope.test.ts` simulating a cwd-`.env`-injected `VCSKILL_CACHE_DIR` gets neutralized while a shell-provided one survives (or, per fallback design, config ignores cwd `.env` entirely).
3. Implement `env-scope.ts` to pass; wire as first import in `index.ts`.
4. Regression: `vcskill install`/`list` behave identically with and without a malicious cwd `.env`.

## Success Criteria
- [ ] Spike verdict recorded (leak: yes/no)
- [ ] If no leak: phase closed as no-op with rationale (no code)
- [ ] If leak: cwd-`.env` `VCSKILL_*` cannot alter behavior; legit shell/CI env still honored; tests green

## Risk Assessment
- Over-stripping legit env → only touch the known `VCSKILL_*` namespace; test the shell-provided path survives.
- Bun dotenv ordering may make post-hoc origin detection impossible → prefer the "ignore cwd .env by construction" design over guessing origin.
