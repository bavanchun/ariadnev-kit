---
name: av:orchestrate
description: "Use when coordinating parallel or staged jobs across headless coding-agent runtimes and subagents with capability routing, isolated worktrees, resumable capture, and arbiter review."
user-invocable: true
when_to_use: "Invoke when work should be split across multiple headless runtimes or in-session subagents, routed by task capability and risk, isolated where needed, and reviewed before handoff."
category: dev-tools
keywords: [orchestrate, headless, multi-agent, internal, subagents, live-routing, model-routing, capability, risk, worktree, resume, parallel, arbiter]
argument-hint: "<job-spec.yaml | task description | --resume <run-dir>> [--yes] [--internal]"
license: MIT
metadata:
  origin: ported
  author: upstream
  version: "1.4.0"
---

# Orchestrate

Coordinate multi-job engineering work when independent units can run in parallel
or when later stages depend on captured results from earlier ones. Keep ownership,
state, and review explicit; orchestration does not broaden authority to mutate,
publish, deploy, or merge.

## When to use

Use this skill for several headless coding-agent runtimes, in-session subagents
with disjoint file ownership, isolated worktrees, staged resumable jobs, or an
independent arbiter. Use `av:handover` for a single-session transfer and
`av:team` for a coordinated persistent team. Do not orchestrate a small
sequential task.

## Authority map

- [model-routing.md](references/model-routing.md) is the sole route-selection
  authority.
- [runtime-matrix.md](references/runtime-matrix.md) owns live runtime discovery.
- [harness-profiles.md](references/harness-profiles.md) owns profile evidence and
  invocation capabilities.
- [internal-routing.md](references/internal-routing.md) owns in-session dispatch.
- [job-spec.md](references/job-spec.md) owns the durable YAML job schema and
  execution-state transitions.
- [arbiter-and-failure-modes.md](references/arbiter-and-failure-modes.md) owns
  the arbiter checklist, the failure playbook, and the completion report.

Do not duplicate those tables here. Read only the references needed by the job.

## Workflow

### 1. Frame the graph

Capture outcome, constraints, non-goals, acceptance criteria, dependencies, and
authority boundary. Split work only where outputs and file ownership can be
stated precisely. Each job needs a stable ID, objective, exact files,
prerequisites, expected artifacts, checks, timeout/retry policy, worktree,
reports path, and status contract. Use [job-spec.md](references/job-spec.md) when
the run must be resumable across sessions.

### 2. Discover and route

Discover available runtimes from [runtime-matrix.md](references/runtime-matrix.md),
gather profile evidence from [harness-profiles.md](references/harness-profiles.md),
then resolve the route through [model-routing.md](references/model-routing.md).
Record the route and reason. Never assume a runtime, model, flag, or harness
from memory; report a job blocked when no verified route satisfies it.

### 3. Isolate writes

Assign one writer to each file or generated artifact. Use one worktree per
concurrent writer when repository policy permits. Base them on the same verified
commit and reserve shared config, migrations, lockfiles, and generated outputs
for one integration owner. Read-only jobs may share a checkout.

### 4. Dispatch and capture

For in-session subagents, follow
[internal-routing.md](references/internal-routing.md). For headless runtimes, use
the verified harness profile. Every prompt includes objective, exact paths,
acceptance criteria, constraints, work context, reports path, and scope flags.

Require each job to end with:

```text
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Summary: one or two sentences
Concerns/Blockers: optional
```

Capture stdout, stderr, exit code, artifacts, commit SHA when applicable, and
elapsed time. A missing or malformed result is not success.

### 5. Integrate and arbitrate

The integration owner reviews each result, resolves shared boundaries, and runs
the narrowest relevant checks before broader gates. Route the combined diff to
an independent arbiter using [model-routing.md](references/model-routing.md).
The arbiter advises; the controller remains accountable for fixes and delivery.
The final report is blocked until every question in
[arbiter-and-failure-modes.md](references/arbiter-and-failure-modes.md) is
answered; the same file says what to do when a job fails, times out, prompts
for permission, or was interrupted.

## Safety defaults

- Preserve user changes and repository branch policy.
- Never share secrets in prompts, logs, reports, or commits.
- Delegated jobs cannot merge, deploy, publish, or contact people unless the
  user explicitly authorized that action.
- Track long-running processes by PID, port, command, and worktree; stop only
  processes the run owns.
- Retry transient failures only. Change context or approach for `BLOCKED` and
  `NEEDS_CONTEXT` instead of repeating the same prompt.
- Serialize edits to shared config, generated artifacts, migrations, and plans.

## Output format

Return one report containing outcome and authority boundary; job graph; route
and evidence per job; worktree/file ownership; statuses, artifacts, and checks;
integration and arbiter findings with disposition; remaining blockers; and the
next safe action. For resumable work, update the durable job spec too.

Everything a run produces lives under one directory. `<run-dir>` throughout the
references means this directory, and `--resume` takes its path:

```text
plans/reports/orchestrate-<timestamp>/     # this is <run-dir>
  jobs.yaml
  runtimes.json
  state.json
  report.md
  worktrees/
    <job-id>/
  <job-id>/
    command.txt         # CLI jobs only
    stdout.txt          # CLI jobs only
    stderr.txt          # CLI jobs only
    result.md           # internal jobs only
    status.json
    artifacts/
    attempt-<n>/
plans/reports/orchestrate-history.jsonl    # appended once per run, across runs
```

`orchestrate-history.jsonl` is what makes cross-run metrics possible; without it
the advisory-evidence rule in `references/harness-profiles.md` has nothing to
read.

## Quality gates

- [ ] Every job has bounded scope, files, checks, and authority.
- [ ] Dependencies are executable and concurrent writers do not overlap.
- [ ] Runtime and model routes were live-verified through owning references.
- [ ] Every result has valid status and attributable evidence.
- [ ] Shared boundaries and generated outputs have one integration owner.
- [ ] Relevant tests, lint, typecheck, or build gates pass after integration.
- [ ] Independent arbiter findings are resolved or reported.
- [ ] Owned processes and temporary worktrees are reconciled.

## Workflow position

**Typically follows:** `av:brainstorm` or an accepted `av:plan`, after work can
be split safely.

**Typically precedes:** integration, `av:test`, code review, and any separately
authorized ship workflow.

**Related:** `av:handover` for a single-session transfer, `av:team` for a
persistent team, and `av:worktree` for repository isolation.

## Limitations

Orchestration cannot make coupled work independent, grant missing access, or
turn an unavailable runtime into a valid route. It does not replace domain
expertise, tests, review, or user approval for external changes.
