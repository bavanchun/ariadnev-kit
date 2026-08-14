# Solution and Phase Design

Use this reference after scope and evidence are stable.

## Select the simplest viable design

Apply principles in this order:

1. **YAGNI:** omit functionality not required by acceptance criteria.
2. **KISS:** prefer the fewest new concepts and the clearest ownership.
3. **DRY:** remove duplication only when it is real and costly.

Compare credible approaches across current fit, worst plausible failure,
compatibility, security, performance, maintainability, effort, rollback, and
future switching cost. Record the chosen rationale. If no approach is accepted,
stop and use `av:brainstorm`; a plan must not disguise an unresolved design fork.

Trace component interactions, data flow, state lifetime, API/schema contracts,
authentication/authorization, failure handling, race/partial-failure behavior,
observability, deployment, and rollback only where the goal actually touches them.

## Build executable phases

Order by hard dependency, then front-load uncertainty and high-risk seams. Each
phase must be independently completable, testable, and revertible; it must not
need a later phase merely to prove its own result.

Each phase file should contain:

- overview and accepted requirements;
- architecture/data-flow changes relevant to that slice;
- concrete create/modify/delete file paths with ownership;
- numbered implementation steps;
- tests before/after when behavior changes;
- a regression gate listing exact compile, type-check, lint, build, or test
  commands that must pass;
- testable success criteria and completion evidence;
- risks with observable failure signals, mitigation, rollback, and stop conditions;
- dependencies on phases, plans, services, or user decisions.

Never say “relevant files”, “update callers”, or “add tests”. Name the files,
state the total caller count and list them, and name the scenarios and commands.
If there are more than ten callers, list the first ten with the total count.

## Deep-plan extensions

Each phase file in deep mode should include:

- a file inventory with action, owner, rough impact, and test coverage;
- a critical/high/medium test-scenario matrix;
- a function/interface checklist with all consumers;
- a dependency map linking code, contracts, and other phases.

Each TDD phase should include:

1. **Tests Before:** regression coverage that proves current behavior or the gap;
2. **Infrastructure:** only the seam needed by the change;
3. **Refactor/implementation:** behavior protected by the tests;
4. **Tests After:** scenarios for newly introduced behavior;
5. **Regression Gate:** compile/type-check plus exact test commands that must
   pass after the change.

Do not defer all testing to a final phase. Put focused evidence beside the work;
reserve a final integration phase for cross-phase behavior only.

## Parallel-ready shape

Parallel-ready plans include a dependency graph, execution strategy, and file
ownership matrix. Independent phases must have:

- no runtime dependency on one another;
- exclusive ownership of modified files and generated artifacts;
- explicit integration points and a later convergence gate;
- independent acceptance evidence and rollback.

If ownership overlaps, sequence the phases. Runtime task support may preserve
parallel groups when available, but the Markdown plan remains executable in a
plain sequential environment.

## File and status rules

- Create project plans only under the repository's configured plan root,
  normally `plans/{yymmdd-hhmm}-{slug}/`; never use arbitrary user directories.
- Every new `plan.md` begins with YAML frontmatter and `status: pending`.
- Fill `plan.md` with the overview, phases, whole-plan acceptance criteria,
  dependencies, risks, and decisions; fill each `phase-NN-*.md` with execution
  detail.
- Keep the hub concise and link every human-readable phase name to its file.
- Missing dependency references render `not found` as a warning; do not invent
  a target or silently remove the relation.
