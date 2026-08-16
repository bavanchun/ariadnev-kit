---
phase: 3
title: "Eval coverage that matches the claim"
status: completed
priority: P1
effort: "3-5d"
dependencies: [1]
---

# Phase 3: Eval coverage that matches the claim

## Overview

`evals/README.md:73` claims `scenarios/skills/` covers every shipped skill. There
are 26 scenario files and (after Phase 1) 105 skills. Write the missing scenarios
and add the test that makes the claim self-enforcing, so it cannot drift again.

## Requirements

- Functional: every skill in `kit/skills/` is the subject of at least one
  `evals/scenarios/skills/*.json` scenario with a positive and a nearest-negative case.
- Functional: a test derives the expected set from `kit/skills/` at runtime and
  fails when a skill has no scenario.
- Non-functional: every `requiredEvidence` id exists in the evidence vocabulary;
  no scenario invents an id or reuses a near-match.

## Architecture

A scenario is a JSON file validated against `evals/schema/scenario.schema.json`,
with `subjects.skills`, a `fixture`, and `cases.positive` / `cases.negative`. Each
case declares the expected terminal outcome, `requiredEvidence` ids drawn from the
27-term vocabulary (`evals/vocabulary/evidence-v1.json`), a `routing` map marking
one skill `required` and the confusable one `forbidden`, and a `safety` block.

The load-bearing design decision is the **negative case**. `skill.ask.routing`
pairs `av:ask` against `av:research` — two skills a model genuinely confuses. A
negative case pairing `av:ask` against, say, `av:shopify` proves nothing while
still incrementing the coverage count. Scenario authorship is therefore organized
by *confusable cluster*, not alphabetically: each batch takes a family of skills
that compete for the same intent and writes their positives and mutual negatives
together.

The vocabulary is expected to be short of some outcomes. When a skill's success
cannot be expressed with an existing evidence id, the id is added to
`evidence-v1.json` with a real `criterion` an evaluator can check — not aliased
onto the closest existing term. **Budget: ten new ids.** Past ten, stop and ask
rather than continue — a vocabulary growing roughly one id per skill is evidence
that the scenarios are asserting the wrong thing, not that 27 terms were too few.

## Related Code Files

- Create: ~79 files in `evals/scenarios/skills/` (77 existing skills + the 2 from Phase 1)
- Modify: `evals/vocabulary/evidence-v1.json` — new evidence ids where justified
- Modify: `evals/README.md` — the coverage sentence, rewritten only after the test passes
- Create: coverage test near `packages/cli/src/eval/behavioral-suite.test.ts`
- Read-only: `kit/skills/*/SKILL.md` (`description` + `when_to_use` are the source
  for each positive prompt and its nearest negative)

## Implementation Steps

1. Build the coverage matrix: for each of the 105 skills, its declared intent and
   its nearest confusable neighbour, taken from `description`/`when_to_use`.
2. Group into confusable clusters (frontend/design, planning, review, research,
   infra, media, docs, …).
3. Write the coverage test first, with the current 26 as a failing baseline, so
   the target is machine-checked from the start.
4. Author scenarios cluster by cluster, in parallel batches with disjoint files.
   Each batch reports: the cluster, the chosen negatives and why they are
   confusable, and any evidence id it needed but could not find.
5. Extend the vocabulary once per batch review, with criteria — never mid-authoring,
   and stop at ten new ids to ask.
6. Run the suite in dry/validation mode (`buildSuite` id-uniqueness and evidence
   validation) without a runner; fix schema and vocabulary failures.
7. Rewrite the README sentence to state what the test enforces.

## Success Criteria

- [x] `ls evals/scenarios/skills/*.json | wc -l` equals the skill count in `kit/skills`.
- [x] The coverage test passes and fails when a skill directory is added without a scenario.
- [x] Every `requiredEvidence` id resolves in `evidence-v1.json`.
- [x] Scenario ids are unique; suite construction succeeds with no runner attached.
- [x] Each negative case names a skill from the same confusable cluster, recorded
      in the batch reports under `plans/reports/`.
- [x] `evals/README.md` describes coverage in terms the test enforces.

## Risk Assessment

- **Ceremonial scenarios.** 77 files written to hit a number produce a coverage
  metric that is more convincing and less true than the honest 26. Signal: a
  negative case whose forbidden skill no model would ever have picked. Response:
  the cluster requirement in step 2 and the justification requirement in step 4;
  a batch that cannot name why two skills are confusable does not get merged.
- **Vocabulary inflation.** Signal: the tenth new evidence id. Response: the
  budget stops the work and asks. An id must be checkable by an evaluator from
  artifacts, per the vocabulary's own `proof` field; if it cannot be, the
  scenario's expectation is wrong, not the vocabulary.
- **Scenario/skill drift after this phase.** Signal: a renamed skill orphans its
  scenario. Response: the coverage test reads directories at runtime, so a rename
  fails the suite immediately.
