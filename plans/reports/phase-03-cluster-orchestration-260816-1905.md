# Phase 3 — Cluster: Orchestration and project workflow

Plan: `plans/260816-1845-ariadnev-evidence-backed-parity-with-agentkit/phase-03-eval-coverage-that-matches-the-claim.md`

## Scenarios written

| skill | positive intent | negative (forbidden) skill | why genuinely confusable |
|---|---|---|---|
| `ariadnev` | Ambiguous multi-domain task with no obvious owner — classify, route, chain installed skills. | `av:orchestrate` | `ariadnev`'s own SKILL.md boundary table names `orchestrate` as the explicit handoff target for headless/cross-runtime work; a model over-eager to "orchestrate" a merely multi-domain (not cross-runtime) task is the realistic failure mode the skill's own doc calls out. |
| `ariadnev` (negative case) | — | `av:cook` required, `av:ariadnev` forbidden | Assignment-specified subtle case: `ariadnev` Step 0 says "user names a skill to use → invoke it directly, stop routing." A prompt that explicitly says "run av:cook on `<plan.md>`" must NOT re-enter the router. |
| `orchestrate` | Multi-job graph across live-verified headless CLI runtimes, worktree-isolated, arbiter-reviewed. | `av:team` | Both coordinate multiple concurrent workers toward one goal; the real boundary is headless external-runtime dispatch (orchestrate) vs. live same-product multi-session teammates (team) — exactly the triangle called out in the task brief. |
| `orchestrate` (negative case) | — | `av:handover` required, `av:orchestrate` forbidden | A single continuation job to one already-selected successor agent is `handover`'s explicit non-goal boundary in reverse: `handover`'s own doc says it is "a thin composition," not a multi-job orchestrator; a one-agent hand-off should not be hand-rolled as an orchestrate spec. |
| `team` | Three live teammates each auditing a different review focus in parallel sessions, synthesized into one file-relative findings list. | `av:orchestrate` | Mirror of the orchestrate/team pairing above, from team's side. |
| `team` (negative case) | — | `av:orchestrate` required, `av:team` forbidden | Headless dispatch to external CLI runtimes (Codex, Cursor) in isolated worktrees is explicitly orchestrate's job-spec/runtime-matrix territory, not team's live-teammate lifecycle. |
| `handover` | Hand a live session to one specifically selected coding agent: capture handoff, dispatch one job, report. | `av:orchestrate` | `handover`'s own "Non-goals" section states "Multi-job orchestration graphs — that is `av:orchestrate`'s job spec," making this the skill's self-declared nearest neighbor. |
| `handover` (negative case) | — | `av:orchestrate` required, `av:handover` forbidden | A multi-stage job graph (scout → dependent implementation) across several runtimes with an integration/arbiter step is squarely `orchestrate`'s job-spec scope, not a single-job hand-off. |
| `vibe` | Full autonomous pipeline: plan → implement → review → PR → ship → merge/CI convergence, one command. | `av:issue-to-plan` | `issue-to-plan`'s own doc: "planning-only... does NOT implement, cook, ship, or open a PR." `vibe` explicitly composes `issue-to-plan`'s neighbors (`worktree`, `plan`, `cook`, `ship`) into the full pipeline `issue-to-plan` deliberately stops short of. |
| `vibe` (negative case) | — | `av:issue-to-plan` required, `av:vibe` forbidden | Mirrors the pairing: a request that explicitly stops at a validated, pushed plan branch (no implementation) is issue-to-plan's exact contract. |
| `issue-to-plan` | Audit-gated, validated, red-teamed plan from a GitHub issue; stop before implementation. | `av:vibe` | Mirror of the vibe/issue-to-plan pairing from issue-to-plan's side. |
| `issue-to-plan` (negative case) | — | `av:vibe` required, `av:issue-to-plan` forbidden | A request for a merged, CI-green result (not just a plan) needs the full pipeline only `vibe` runs end to end. |
| `project-management` | Mirror unchecked items from *all* active plans into a live task-tracking surface, sync as work lands, trigger doc-update flags. | `av:pm` | Read `pm.json` first (per assignment) and confirmed `av:pm` and `av:project-management` are two separately shipped skills covering nearly the same ground (plan status truth, sync-back, reports). `project-management`'s distinguishing capability is runtime task-surface mirroring + documentation-trigger coordination across *multiple* plans — `av:pm` explicitly says it "does not handle" runtime tracking and stays file-only, single/most-plan scoped. Did not restate `pm.json`'s prompts (which pair `av:pm` against `av:cook`). |
| `project-management` (negative case) | — | `av:pm` required, `av:project-management` forbidden | A single-plan, evidence-only checkbox audit against git commits/tests ("repo state wins over the plan file") is `av:pm`'s literal "Core rule" language — the file-evidence discipline `project-management` does not own as its primary differentiator. |
| `project-organization` | Decide the exact output path, filename, and template sections for a new file (an ADR) — not its content. | `av:docs` | `project-organization`'s own SKILL.md names itself "the single source of truth for file organization" and explicitly lists `docs`/`docs-manager` as a consumer that "references it when determining output paths" — i.e., a model asked to "handle this ADR" could plausibly route the whole thing to `av:docs` without realizing path/naming/template ownership sits with `project-organization`. This pairing is drawn from outside the assignment's suggested pairs (no genuine in-cluster neighbor exists for a pure path/naming-decision skill); recorded here per the "may go outside cluster with reason" allowance. |
| `project-organization` (negative case) | — | `av:docs` required, `av:project-organization` forbidden | Writing the actual ADR content (context, decision, consequences, alternatives) is `av:docs`'s explicit job ("maintain the smallest documentation set..."), distinct from where/how the file is named. |
| `plans-kanban` | Open the visual dashboard for kanban/grid/timeline views across plans, click into files. | `av:watzup` | Assignment-specified real pair: both answer "where are we," but `plans-kanban` is a thin CLI-dashboard launcher (visual) and `watzup` is a scanner producing a short evidence-backed text handoff (no UI, no mutation). |
| `plans-kanban` (negative case) | — | `av:watzup` required, `av:plans-kanban` forbidden | A request explicitly refusing UI ("don't open any UI") and asking for a short text handoff with priority-ranked next steps is watzup's exact report format. |
| `watzup` | No-UI, evidence-backed handoff of branch/worktree/plan state with priority-ranked next steps. | `av:plans-kanban` | Mirror of the plans-kanban/watzup pairing from watzup's side. |
| `watzup` (negative case) | — | `av:plans-kanban` required, `av:watzup` forbidden | An explicit request for the visual kanban/grid/timeline view (not a text summary) is plans-kanban's only job. |
| `goal-warmup` | Lock an approved outcome contract, plan against it, run a whole-plan preflight, hand off a readiness packet — never auto-start the goal. | `av:codex-goal` | Assignment-specified real pair: preflight contract (goal-warmup) vs. running/drafting the goal itself (codex-goal). `goal-warmup`'s own doc: "Does not replace `av:vibe` or `av:issue-to-plan`" and lists `codex-goal` under "Related." Hard gate 3 in goal-warmup explicitly forbids auto-starting `/goal` — the exact behavior codex-goal exists to do. |
| `goal-warmup` (negative case) | — | `av:codex-goal` required, `av:goal-warmup` forbidden | A request to skip the interview/preflight ("I already know exactly what I want") because the scope is already clear and mechanical matches codex-goal's own "Use Test" (task is mechanical, stop condition verifiable, scope clear enough to skip a decision gate). |
| `codex-goal` | Draft the Codex `/goal` contract (objective, files, constraints, validation command, stop condition) for an already-decided, mechanical, verifiable objective. | `av:goal-warmup` | Mirror of the goal-warmup/codex-goal pairing from codex-goal's side. |
| `codex-goal` (negative case) | — | `av:goal-warmup` required, `av:codex-goal` forbidden | External deploy credentials + unclear scope is exactly goal-warmup's risk-estimate trigger (external deps/credentials/deploy escalate past the `--fast` eligibility bar) — codex-goal's own "Boundaries" section defers exactly this case to goal-warmup. |

## Evidence ids used (all pre-existing, reused honestly)

`implementation.verified`, `worktree.path`, `handoff.context`, `review.findings`, `ship.pr-url`, `plan.phases`, `plan.progress`, `docs.updated`, `design.acceptance`. Each reuse was checked against the vocabulary's `criterion` text before use (not pattern-matched from the id name) — e.g. `plan.progress`'s criterion ("maps completed work and unresolved criteria without claiming unverified completion") legitimately covers both `av:pm`'s repo-evidence audit and `av:project-management`'s multi-plan/task-surface mirroring, which is part of *why* those two skills are confusable, not a workaround.

## Proposed new evidence ids (2, at cluster budget cap)

### `routing.decision`
- **id**: `routing.decision`
- **producer**: `evaluator`
- **proof**: `decision`
- **criterion**: The router states the workflow classification (`Route: <class> | size: ... | risk: ... | domains: ...`) and the selected skill or chain before any routed work begins, and the routed skill genuinely matches the task's declared domain.
- **capabilities**: `{}`
- **why no existing id fits**: `av:ariadnev` is a pure dispatcher — its positive-case success is the routing decision itself, not a domain deliverable (implementation, plan, docs, etc.). None of the 27 existing ids describe a classify-then-select decision; aliasing onto e.g. `solution.options` or `reasoning.steps` would misdescribe what the evaluator actually checks (a routing line + matching downstream invocation, not a compared set of options or a logic proof).
- **used in**: `evals/scenarios/skills/ariadnev.json` (positive case).

### `path.resolution`
- **id**: `path.resolution`
- **producer**: `evaluator`
- **proof**: `artifact`
- **criterion**: The response names the exact target path, filename, and naming mode (timestamped/evergreen/variant) for the requested file, and the evaluator can verify the choice matches the project's declared directory-category and naming-pattern rules.
- **capabilities**: `{}`
- **why no existing id fits**: `av:project-organization`'s deliverable is a path/naming/template decision, not file content. The nearest candidates (`project.bootstrap-plan` — over-claims commands/dependencies/verification path for a whole new project; `docs.updated` — asserts an actual content change happened) both misdescribe a pure placement decision. Aliasing onto either would mean the evaluator checks something the skill did not actually promise.
- **used in**: `evals/scenarios/skills/project-organization.json` (positive case).

Both ids are within budget (2 proposed, cluster max per assignment; phase-wide budget is 10 new ids across all clusters — orchestrator should reconcile).

## Negative taken from outside the cluster

- `project-organization` vs `av:docs` (see table above). No in-cluster skill is genuinely confusable with a pure path/naming-decision skill — forcing an in-cluster pairing (e.g. against `plans-kanban` or `watzup`) would have been the "ceremonial negative" failure mode the phase spec explicitly warns against. `av:docs` is a legitimate, evidence-backed neighbor: `project-organization`'s own SKILL.md names `docs`/`docs-manager` as a direct consumer of its path-resolution authority.

## Verification

- `node -e "JSON.parse(...)"` — all 12 files parse.
- Scenario-id uniqueness check across `evals/scenarios/skills/*.json` (71 files at check time, includes other clusters landing in parallel) — no duplicates.
- `npx vitest run packages/cli/src/eval/scenario-coverage.test.ts`:
  - "uncovered skills" failure: none of this cluster's 12 skill names (`ariadnev`, `orchestrate`, `team`, `vibe`, `handover`, `issue-to-plan`, `project-management`, `project-organization`, `plans-kanban`, `watzup`, `goal-warmup`, `codex-goal`) appear in the reported uncovered list — confirmed covered. Remaining uncovered names belong to other clusters (expected, still in flight).
  - "unresolved evidence id" failure: only `ariadnev.json (positive): routing.decision` and `project-organization.json (positive): path.resolution` are mine in that list, both intentional pending-vocabulary-merge proposals documented above; the rest belong to other clusters' proposals.

## Files created

All under `evals/scenarios/skills/`: `ariadnev.json`, `orchestrate.json`, `team.json`, `vibe.json`, `handover.json`, `issue-to-plan.json`, `project-management.json`, `project-organization.json`, `plans-kanban.json`, `watzup.json`, `goal-warmup.json`, `codex-goal.json`. No other files touched.

## Unresolved questions

- None. `routing.decision` and `path.resolution` await orchestrator merge into `evals/vocabulary/evidence-v1.json`.
