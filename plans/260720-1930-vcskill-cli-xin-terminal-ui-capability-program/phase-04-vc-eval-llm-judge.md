---
phase: 4
title: VC Eval LLM Judge
status: completed
effort: S
---

# Phase 4: VC Eval LLM Judge

## Overview

Add `vc eval` — a cost-tiered skill-quality gate. Tier-1 static (reuse `validate`, $0, CI-safe) always runs; tier-3 sends each `SKILL.md` to an AI CLI (behind `VC_EVAL_CMD`) and scores it. MVP-trimmed per red-team: one command module, inline prompt + permissive parse, no speculative flags/persistence until a second consumer needs them.

## Requirements

- Functional: `vc eval` runs tier-1 always. With `VC_EVAL_CMD` set, runs tier-3 judge per skill, scores 1–10 each axis, flags overall <6. `--skill <name>` scopes to one skill. Skips tier-3 cleanly (message, exit 0 on pass) when `VC_EVAL_CMD` unset.
- Non-functional: CI stays $0 (tier-3 opt-in). The subprocess call is thin + injected (tests never spawn). Pure parse/score ≥90% (add to `coverage.include`).

## Architecture

**MVP (single module + one small pure helper file)**: `src/cli/eval-command.ts` holds an inline ~15-line judge prompt (cap content ~3000 chars, ask for strict JSON `{clarity, specificity, completeness, notes}`) and `runEval({ evalCmd, skill, deps })`. `deps.runJudge(prompt) → string` (injectable; real impl spawns `VC_EVAL_CMD`). `src/eval/parse-judge.ts` (pure) = permissive `extractJudgeJson(raw)` (tolerant regex/`try JSON.parse`, returns `unscored` on garbage) + `overall(scores)` + `flagged = overall < 6`. Do NOT split into judge-prompt/parse/score 3-way or add `--diff`/results-file until a real need appears.

**Tier-1 reuse — FACT (red-team)**: `runValidate(opts)` validates the WHOLE kit (loops all `kit.skills`, no per-skill filter — `validate-command.ts:29-36,74`). To serve `--skill`, add an optional `skillFilter?: string[]` to `ValidateOpts` (small, honest change), OR run whole-kit and filter `findings` by `finding.skill` name. Choose `skillFilter` (cleaner). State this explicitly — "reuse runValidate" alone does not scope to one skill.

Register `eval` in `index.ts`; render score summary via `ui/style`.

## Related Code Files

- Create: `packages/cli/src/eval/parse-judge.ts` + `parse-judge.test.ts`
- Create: `packages/cli/src/cli/eval-command.ts` + `eval-command.test.ts`
- Modify: `packages/cli/src/cli/validate-command.ts` (add `skillFilter?`), `packages/cli/src/index.ts` (register `eval`), `vitest.config.ts` (coverage.include += `src/eval/**`), `README.md`

## Implementation Steps (TDD — tests first)

1. **Failing tests**: `extractJudgeJson` pulls JSON from a noisy reply, returns `unscored` on garbage; `overall`/`flagged` math.
2. Implement `parse-judge.ts`; extend `coverage.include`.
3. **Failing test** for `runValidate` with `skillFilter:["foo"]` → only `foo` validated (add the param).
4. **Failing test** for `runEval` with injected fake `runJudge`: tier-1 always runs; tier-3 scores + flags <6; `VC_EVAL_CMD` unset → tier-3 skipped, exit 0; `--skill foo` scopes both tiers.
5. Implement `eval-command.ts` (inline prompt; real `runJudge` spawns `VC_EVAL_CMD` — spawn output routed through Phase-3 `sanitize`). Register `eval`.
6. Manual: `vc eval` (tier-1 only), `VC_EVAL_CMD=... vc eval --skill scout`.

## Success Criteria

- [ ] `vc eval` runs tier-1 with no external dep; exit 0 on clean kit; `--skill` scopes via `skillFilter`.
- [ ] Tier-3 scores each skill, flags overall <6; `VC_EVAL_CMD` unset → skipped (CI $0) — proven by a test asserting `runJudge` is not called.
- [ ] Spawned judge output passes through `sanitize` (no arg/key leak).
- [ ] `parse-judge` ≥90% (in `coverage.include`); `pnpm test` green.

## Risk Assessment

- **CI cost leak**: tier-3 opt-in via env; test asserts skipped when unset.
- **Over-engineering** [red-team]: MVP = 2 files, inline prompt, `--skill` only. Defer `--diff`/`--all`/results-JSON/3-way split until a second caller exists.
- **Flaky LLM JSON**: tolerant parse + `unscored` path (never crash).
- **Subprocess key leak** [red-team]: route spawned stderr through `sanitize` (Phase 3).
