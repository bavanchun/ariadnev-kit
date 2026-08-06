---
phase: 4
title: "Checklist coverage checker"
status: todo
priority: P1
effort: "3-4d"
dependencies: [3]
---

# Phase 4: Checklist coverage checker

## Overview

Build the deterministic gate that answers "did this distilled skill keep its source's operational claims, or did we delete them?" — the cheap half of advice item F. It is a **ratchet, not an oracle**: it guarantees no claim silently disappears; it does not judge whether the distillation is good.

## Requirements

- Functional: for a given skill, every claim in `kit/distill-decisions.json` is either `covered` (present in the vc SKILL.md or its references) or explicitly `rejected` with a reason. Unclassified or missing-but-not-rejected claims make the standalone `vcskill coverage` command fail. During the eight-skill rollout, the same domain findings appear as warnings inside aggregate `vcskill validate`; Phase 5 promotes that integration to errors after all eight are clean.
- Non-functional: runs **offline** — no `ak` installation, no network. Reproducible in CI. Forks (`upstream_relation: "fork"`) and no-upstream skills are exempt.

## Architecture

**Honest boundary.** Research found no published method for automated omission detection — faithfulness and NLI metrics target over-claiming, not dropped rules. Full automation is not achievable deterministically, so the design puts the human in exactly one place and makes everything else mechanical:

1. **Pin time (human, once per upstream version).** `pin-upstream.ts` extracts candidate claims from the source. The reviewer classifies each as `covered` or `rejected` (with a reason). Result is stored in the registry.
2. **Check time (machine, every run).** The checker verifies each `covered` claim still has a plausible anchor in the vc content, and fails on any claim left unclassified. No LLM, no network, no source tree.
3. **Re-pin time (human, only on drift).** When the upstream digest changes, the tool diffs claim sets and asks for classification of **new** claims only. Existing classifications carry over.

This makes the recurring cost proportional to upstream churn, not to catalog size — which matters at 97 skills.

**Claim extraction** (deterministic): normative and procedural lines from the source — lines containing MUST / SHOULD / ALWAYS / NEVER / DO NOT, numbered steps, and rule-shaped bullets. Normalized (lowercase, whitespace-collapsed, markdown stripped). Over-extraction is acceptable; the reviewer rejects noise once and it stays rejected.

**Coverage matching**: keyword-set overlap between the claim and the vc content above a tuned threshold. Deliberately weak — its job is to catch wholesale deletion, not paraphrase drift. A claim below the threshold becomes `unmatched`; the strict command fails until the reviewer restores an anchor or explicitly marks the claim `rejected` with a reason.

**One domain result, two delivery contracts:**

- `checkClaimCoverage()` returns domain findings with no severity and no process-exit behavior.
- `vcskill coverage [--skill <name>]` is always strict: any `unclassified` or unmatched-and-not-rejected finding sets `ok: false` and the CLI exits non-zero. This is the per-skill Phase 5 gate.
- `vcskill validate` maps those same findings to `ValidateFinding.kind: "coverage"`. The mapping level is `warn` during rollout so unrelated kit work is not blocked by yet-unclassified skills; after all eight pass the strict command, Phase 5 flips only this validate-integration default to `error`.

The standalone command never changes semantics during the rollout. `warn` versus `error` belongs only to the aggregate validate adapter.

## Related Code Files

- Create: `packages/cli/src/kit/claim-extract.ts` — pure: source text → normalized claim list
- Create: `packages/cli/src/kit/claim-coverage.ts` — pure: claims + vc content → per-claim status
- Create: `packages/cli/src/cli/coverage-command.ts` — strict `vcskill coverage [--skill <name>]` adapter over the pure result
- Create: tests for each of the above
- Modify: `packages/cli/src/index.ts` — wire the subcommand (watch the 330-LOC ceiling; extract if it grows)
- Modify: `packages/cli/src/cli/validate-command.ts` — add finding kind `coverage`, invoke the same checker, map rollout findings to warnings
- Modify: `packages/cli/src/cli/validate-command.test.ts` — prove warning findings do not fail aggregate validate and error findings do
- Modify: `packages/cli/scripts/pin-upstream.ts` — emit claims in registry shape; support re-pin diff mode
- Modify: `docs/vc-skill-authoring-spec.md` — document the ratchet, and state its limits plainly
- Modify: `vitest.config.ts` — add `kit/claim-*.ts` to the 95% coverage-gated set (pure functions belong there)

## Implementation Steps

1. Failing tests for `claim-extract.ts`: normative lines extracted; prose ignored; numbered steps captured; output stable across runs.
2. Implement `claim-extract.ts`.
3. Failing tests for `claim-coverage.ts`: claim present → covered; claim absent → unmatched; rejected claim → skipped; unclassified claim → fail.
4. Implement `claim-coverage.ts`.
5. Add the standalone `vcskill coverage` adapter reading the registry + kit; it always exits non-zero on unclassified or unmatched-and-not-rejected findings. Test command summary, `ok`, and process exit behavior.
6. Integrate the same pure result into `vcskill validate` under finding kind `coverage`, mapped to `level: "warn"` during this batch. Prove warnings are visible but do not make aggregate validate fail; add a test-only/error-policy case proving the eventual strict mapping does fail.
7. Extend `pin-upstream.ts` with re-pin diff: given an old registry entry and a new source, list only new claims.
8. Exempt `upstream_relation` of `fork` and `none` from coverage; test both adapters.
9. Run against 2 skills end-to-end (`docs-seeker` — smallest source at 574 lines — then `problem-solving`) to calibrate the overlap threshold and measure registry size.
10. Record in the authoring spec that standalone coverage is always strict, aggregate validate is warn-only during rollout, and Phase 5 flips only the validate mapping to `error` after all eight pass.

## Success Criteria

- [ ] `vcskill coverage --skill docs-seeker` runs with no `ak` installed and no network
- [ ] Standalone `vcskill coverage` has stable strict semantics: a deleted, unclassified, or unmatched-and-not-rejected claim causes a non-zero exit throughout the rollout
- [ ] A claim marked `rejected` with a reason does not fail
- [ ] An unclassified claim fails with a message naming the skill and claim id
- [ ] `fork` and `none` relations are exempt (tested)
- [ ] Re-pin against a bumped upstream lists only new claims for classification
- [ ] `claim-extract.ts` and `claim-coverage.ts` are pure, ≥95% covered, under 200 LOC each
- [ ] Registry size measured after 2 skills and recorded in the plan
- [ ] Aggregate `vcskill validate` emits the same findings under kind `coverage` at `level: "warn"` in this batch; tests distinguish this adapter policy from the strict standalone command
- [ ] Flip-to-`error` criterion applies only to aggregate validate and is documented
- [ ] `pnpm test` green

<!-- Updated: Validation Session 2 - strict standalone command; warn-first only in aggregate validate; flip validate integration after all 8 pass -->

## Risk Assessment

- **False confidence is the main risk.** The gate proves no claim vanished; it does not prove the distillation is faithful. Mitigation: state this in the authoring spec and in the command's own output. Outcome regression on golden tasks remains the validated technique and is deliberately deferred — do not let this gate be described as parity proof.
- **Threshold tuning is guesswork.** Mitigation: calibrate on two real skills (step 9) before applying to the other six; prefer surfacing for review over auto-failing.
- **Two adapters drift into different definitions of clean.** Mitigation: both consume one pure domain result; adapters may differ only in severity/exit policy. Shared fixture tests assert identical finding identities.
- **Reviewer fatigue at 97 skills.** Mitigation: the re-pin diff means classification cost tracks upstream churn, not catalog size. If step 9 shows more than ~40 claims per skill, revisit extraction strictness before scaling.
- **`index.ts` is already 330 LOC** — adding a subcommand pushes it further past the repo's 200-LOC rule. Mitigation: extract command registration while wiring this one.
