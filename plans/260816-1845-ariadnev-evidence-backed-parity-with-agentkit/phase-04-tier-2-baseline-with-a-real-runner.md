---
phase: 4
title: "Tier-2 baseline with a real runner"
status: pending
priority: P2
effort: "1-2d wall time, metered agent cost"
dependencies: [3]
---

# Phase 4: Tier-2 baseline with a real runner

## Overview

The behavioral harness has never been run against a real agent. Run it, size the
cost honestly from a pilot first, and record a baseline that later runs can be
compared against.

## Requirements

- Functional: a tier-2 run completes against a real runner and produces a recorded
  baseline under `evals/baselines/<version>/`.
- Non-functional: repeat counts, provider, version, and model are pinned in the
  environment manifest, and every reduction from the documented defaults is stated
  as a limitation there — not silently applied.

## Architecture

`ariadnev eval --suite` spawns a strict JSON argv runner without a shell, feeds it
only the case prompt on stdin, and starts each case in a fresh copied fixture.
Defaults are `--skill-repeats 3` and `--deep-repeats 1`, which at 105 skills × 2
cases × 3 is **≈630 skill cells** plus 14 golden tasks — the reason this phase
starts with a pilot rather than a full run.

Available runners on this machine: `claude` 2.1.233, `codex` 0.147.0,
`cursor-agent` 2026.07.23, `opencode` 1.15.3. `claude` is the baseline runner
because it is the provider the kit installs into most completely.

`evals/baselines/v0.10.0/` shows the shape to produce: `environment.json`,
`summary.json`, `README.md`. `packages/cli/scripts/compare-tier2-baseline.mjs`
already exists to diff a later run against a recorded one.

## Related Code Files

- Create: `evals/baselines/<released-version>/{environment.json,summary.json,README.md}`
- Modify: `evals/README.md` — the measured cost and the exact reproduction command
- Read-only: `packages/cli/src/eval/behavioral-suite.ts`, `behavioral-runner.ts`,
  `packages/cli/scripts/compare-tier2-baseline.mjs`

## Implementation Steps

1. Resolve the runner's non-interactive invocation empirically (prompt on stdin,
   no TTY) and record the exact argv array.
2. Pilot: one confusable cluster (~5 skills), `--skill-repeats 1`. Measure wall
   time, token cost, and failure modes per cell.
3. Extrapolate to the full suite. Choose the repeat count the measurement
   supports, and write the reason into the environment manifest.
4. Full run at the chosen settings, with `--runtime-provider`, `--runtime-version`,
   and `--model` pinned to the observed values.
5. Record the baseline; verify `compare-tier2-baseline.mjs` reads it.
6. Document the reproduction command and its measured cost in `evals/README.md`.

## Success Criteria

- [ ] A pilot report exists with per-cell wall time and cost.
- [ ] A full run completes; failures are attributed to scenario, harness, or model,
      not left unclassified.
- [ ] `evals/baselines/<version>/environment.json` pins provider, version, model,
      repeat counts, and every limitation.
- [ ] `compare-tier2-baseline.mjs` runs against the new baseline without error.
- [ ] `evals/README.md` states the real cost of reproducing it.

## Risk Assessment

- **The full run is unaffordable.** Signal: pilot cost extrapolates past what the
  owner will spend. Pre-decided response: reduce repeats to 1 and record the
  limitation — routing variance is then explicitly *not* measured, and the
  baseline says so. Do not shrink the scenario set to make the number look good.
- **A large share of cells fail.** Signal: failures cluster in one cluster or one
  evidence id. Response: that is Phase 3 feedback, not a harness bug — fix the
  scenarios and re-pilot before spending on a full run.
- **The baseline becomes stale immediately.** Signal: the next release changes
  skills and nothing re-runs. Response: this phase records cost so the owner can
  decide the cadence deliberately; it does not promise a run per release.
