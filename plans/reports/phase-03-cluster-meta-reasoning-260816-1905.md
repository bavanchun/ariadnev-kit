# Phase 3 — Cluster: Meta, reasoning and the CLI itself

Plan: `plans/260816-1845-ariadnev-evidence-backed-parity-with-agentkit/phase-03-eval-coverage-that-matches-the-claim.md`
12 files created under `evals/scenarios/skills/`: `advise.json`, `help.json`, `find-skills.json`, `common.json`, `coding-level.json`, `context-engineering.json`, `fable-thinking.json`, `debug.json`, `loop.json`, `retro.json`, `av.json`, `plan-i18n.json`.

## Coverage table

| skill | positive intent (required) | negative — forbidden skill (required instead) | why genuinely confusable |
|---|---|---|---|
| `advise` | Interview-driven reframing before deciding, ending in a verdict + checklist | `av:brainstorm` | Both converge on requirements/goals/non-goals/constraints + an accepted path. `advise` gets there via a mandatory one-question-at-a-time interview and ends in a *recommendation the user takes elsewhere*; `brainstorm` compares options directly with no interview and ends in a plan handoff. A model given "help me decide X" can pick either. |
| `help` | "What can this kit do / which skill fits Y" | `av:find-skills` | `help` answers from the *installed* catalog; `find-skills` searches the *external* ecosystem (`npx skills find`) to install something new. Both surface as "which skill handles X" on the surface. |
| `find-skills` | "Is there an installable skill for X" (not shipped) | `av:help` | Mirror of the `help` pairing — same confusion from the other subject's side. |
| `common` | Skill author asks what shared conventions/utilities the kit's skills reuse | `av:skill-creator` | `common` is internal-only (`disable-model-invocation: true`); a question *about* shared skill conventions superficially sounds like skill-authoring work, so a router can misfire to `skill-creator` instead of reading `common`'s own reference content directly. |
| `common` (negative) | Bait wording ("the *common*, standard workflow") for a generic "where do I start" ask | `av:help` required, `av:common` forbidden | Load-bearing safety case: proves a plain user-facing request never routes to the internal-only skill even when the wording lexically echoes its name. |
| `coding-level` | "Set my level to N so *future* responses are tailored" (persists a preference) | `av:ask` | Both skills can produce a level-appropriate explanation. `coding-level` *persists* a setting to `.claude/.ck.json` for all future turns; `ask` answers once, with no persisted state. A one-off "explain this like I'm new" utterance is easy to misroute into `coding-level`. |
| `context-engineering` | Diagnose context degradation (80%+ usage, lost-in-middle) and design a compaction/isolation strategy | `av:sequential-thinking` | Both look like "reasoning about a hard problem." `context-engineering` is specifically about token/memory/architecture budget, not proving a bounded claim step by step. |
| `fable-thinking` | Rigor/evidence-grounding + self-review before delivering a diagnosis or verdict | `av:sequential-thinking` (positive forbidden) / `av:context-engineering` (negative required) | Three-way noted in the phase brief (reasoning protocol vs context design vs stepwise decomposition). Covered two of the three edges with 2 files: `context-engineering.json` tests context-engineering vs sequential-thinking; `fable-thinking.json` tests fable-thinking vs sequential-thinking (positive) and fable-thinking vs context-engineering (negative). |
| `debug` | Root-cause investigation only, explicitly no fix yet | `av:fix` | Direct pairing named in the brief. `fix.json` (existing) tests fix vs code-review; this file tests the debug↔fix edge specifically — diagnose-only vs diagnose-and-repair — which `fix.json` never covered. |
| `loop` | N autonomous iterations against a single mechanical metric, git-tracked keep/discard | `av:cook` | `loop`'s own SKILL.md names this exact confusion ("no mechanical metric → av:cook"). A vague "make it better" request can misroute either way. |
| `retro` | Git-history-derived sprint retrospective (commits, churn, hotspots, plan completion), N/A when unverifiable | `av:watzup` | Both summarize repo/plan state from git. `retro` is backward-looking analysis with computed metrics; `watzup` is forward-looking (priority-ranked next steps, no metrics). `watzup.json` (existing) already tests watzup vs plans-kanban — this file adds the untested watzup↔retro edge. |
| `av` | Next concrete action is running/interpreting an `av` subcommand | `av:help` | Direct pairing named in the brief: run the subcommand vs open the help index. A "what should I do next with this CLI" ask can misfire either way. |
| `plan-i18n` | `plan.html` already exists; add only the VN/EN toggle, no plan content/structure change | `av:plan` | The deference test named in the brief. `plan-i18n` explicitly defers planning-workflow content (modes, GitHub, wiki, task hydration) to `av:plan`; the negative proves a pure planning request (no bilingual ask, no existing `plan.html`) routes to `av:plan`, matching `plan.json`'s own established positive (`plan.phases`). |

## Evidence id usage (all reused except one)

Reused, unmodified, from `evals/vocabulary/evidence-v1.json`, each checked against its literal `criterion` text (not the id name) before reuse:

- `answer.direct` — help, find-skills, common (both cases), coding-level (negative), av (both cases). Criterion: "directly answers the supplied technical question without substituting a research report." Honest for all: each is a direct informational/tooling answer, not a research report.
- `design.acceptance` — advise (both cases). Criterion literally lists outcome/constraints/non-goals/acceptance-criteria/accepted-option — matches `advise`'s own documented "Confirm the reframing" step (Problem/Requirements/Goals/Non-goals/Constraints) plus its final "My take and how to get there" (the accepted option), field for field. Already used by `brainstorm.json`/`plan.json`; reusing it for `advise` is not aliasing — the phase brief itself names advise↔brainstorm as a real confusion, and this shared evidentiary shape is exactly why.
- `solution.options` — context-engineering (positive), fable-thinking (negative). Criterion: "compares viable cause-aligned options and recommends the simplest option satisfying accepted constraints." Context-engineering diagnoses *why* context degrades (the cause) and recommends among the four-bucket strategies (write/select/compress/isolate) the one fitting the token/quality budget.
- `reasoning.steps` — context-engineering (negative), fable-thinking (positive). Matches `sequential-thinking.json`'s own established use; fable-thinking's Full-mode Moves 1–5 are literally a labeled premise→transition→conclusion sequence.
- `fix.root-cause` — debug (both cases). Matches `fix.json`/`cook.json`'s established use exactly; debug's entire mandate ("NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST") is this criterion's textbook case.
- `git.commit` — loop (positive). Loop's protocol commits before verify and keeps only improving iterations; the final kept state's commit matches the verified metric.
- `implementation.verified` — loop (negative), plan-i18n (positive). Matches `cook.json`'s established use; plan-i18n's own quality-gate checklist (standalone load, `_en`/`_vi` parity, instant re-render, `localStorage` persistence) is exactly a set of required focused verification checks gating an accepted small feature.
- `plan.progress` — retro (positive). Matches `watzup.json`'s established use (plan-status mapping without claiming unverified completion) — retro's Step 4 (plan-completion tracking, N/A when unverifiable) is this exact behavior, generalized honestly to retro's whole report given retro's blanket "never invent a number" constraint.
- `handoff.context` — retro (negative). Matches `watzup.json`'s own positive evidence exactly (`av:watzup` required → `handoff.context`).
- `plan.phases` — plan-i18n (negative). Matches `plan.json`'s own established positive evidence exactly (`av:plan` required → `plan.phases`).

No id was picked by name pattern-match; each was checked against its criterion text and, where a near-identical criterion was already anchored to a sibling skill (`cook`, `plan`, `watzup`, `fix`, `brainstorm`), reused deliberately for consistency rather than invented anew.

## Proposed new evidence id (1 of the cluster's 2-id budget used)

```json
{
  "id": "preference.persisted",
  "producer": "harness",
  "proof": "external-state",
  "criterion": "The requested user preference is written to its designated config file and the value read back afterward matches what was requested.",
  "capabilities": {}
}
```

Needed for: `coding-level.json` positive case (`av:coding-level` required).

Why no existing id fits: `coding-level` is a config-persistence action (`.claude/.ck.json`), not a documentation change (`docs.updated`'s criterion is specifically about a "documentation artifact"/"documentation surface" — reusing it for a JSON preference file would violate the criterion's literal text, exactly the near-match-aliasing the phase forbids), not a direct answer to a technical question (its deliverable is a persisted side effect, not a response), and not an implementation-with-tests (`implementation.verified` implies a fixture + verification commands, which a bare preference toggle doesn't have). `preference.persisted` is deliberately generic (not named after `coding-level`) so any other future preference-setting skill in the kit can reuse it.

Second budget slot unused — `common`'s positive case, which initially looked like it needed a bespoke "internal-scope" id, turned out to be honestly expressible with `answer.direct` once the prompt was framed as a direct question about `common`'s own reference content.

## Negatives drawn from outside the cluster

None. All 12 negatives pair against skills that are either inside this cluster (`brainstorm`↔`advise`, `help`↔`find-skills`, `skill-creator`↔`common`, `sequential-thinking`↔`context-engineering`/`fable-thinking`, `help`↔`av`, `plan`↔`plan-i18n`) or against a sibling skill whose own scenario file already anchors the matching evidence id, confirmed by reading that file first: `av:fix` (`fix.json`, `cook.json`), `av:cook` (`cook.json`), `av:watzup` (`watzup.json`), `av:plan` (`plan.json`), `av:ask` (`ask.json`). Every forbidden/required partner id was verified to exist as a real shipped skill directory under `kit/skills/`.

## Validation performed

- `node -e "JSON.parse(...)"` on all 12 files — all parse.
- `npx vitest run packages/cli/src/eval/scenario-coverage.test.ts`:
  - `has a scenario file named for every shipped skill` — pass (includes all 12).
  - `names its file after the skill it is the subject of` — pass.
  - `names no scenario after a skill that no longer ships` — pass.
  - `gives every scenario a unique id` — pass (`skill.<name>.routing`, checked against the full existing scenario-id list before writing — no collisions).
  - `resolves every requiredEvidence id against the vocabulary` — fails as expected: 41 unresolved ids total, of which exactly 1 (`coding-level.json (positive): preference.persisted`) belongs to this cluster; the remaining ~40 belong to other clusters' in-flight files (media/design/browser/mcp/research skills), not touched here.

## Files touched

Created only (no other files modified):
`evals/scenarios/skills/advise.json`, `help.json`, `find-skills.json`, `common.json`, `coding-level.json`, `context-engineering.json`, `fable-thinking.json`, `debug.json`, `loop.json`, `retro.json`, `av.json`, `plan-i18n.json`.

## Unresolved questions

- Orchestrator must add `preference.persisted` to `evals/vocabulary/evidence-v1.json` before the evidence-resolution test can pass for this cluster (I do not have write access to that file per the phase's file-ownership rule).
