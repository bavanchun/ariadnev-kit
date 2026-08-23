---
name: av:handover
description: Hand in-progress work to one named coding agent — capture a portable handoff, then dispatch a single job pointing at it. Use to continue work in another runtime, not to build a job graph.
user-invocable: true
when_to_use: Invoke to continue current work in a different coding runtime with a controlled, captured, safety-gated job — not to orchestrate multiple jobs (that is av:orchestrate) and not to only capture context (that is av:handoff).
category: dev-tools
keywords: [handover, handoff, orchestrate, continuation, agent, runtime, dispatch]
license: MIT
argument-hint: "[task] --agent <id> [--cwd PATH] [--task TEXT] [--handoff PATH] [--model NAME] [--yes]"
metadata:
  origin: ported
  author: upstream
  version: "1.0.0"
---

# Handover

Hand a live coding session over to a specifically selected coding agent
while preserving mission, guardrails, live state, decisions, verification,
blockers, and next actions. This skill is a **thin composition** — it does
not duplicate runtime dispatch, model routing, capture, or arbiter logic.

## Required sequence

Every invocation performs, in order:

1. **Capture** — invoke [`av:handoff`](../av-handoff/SKILL.md)
   to produce a portable Markdown handoff artifact, unless the user passed
   a valid existing `--handoff PATH` (see Handoff validation below).
2. **Spec** — build one deterministic single-job orchestration spec that
   points the selected coding agent at that artifact and instructs it to
   read the artifact before acting. See
   [references/job-spec-template.md](references/job-spec-template.md).
3. **Dispatch** — invoke [`av:orchestrate`](../av-orchestrate/SKILL.md)
   with that spec. Preflight, safety gates, capture, resumability, and
   arbiter review are `av:orchestrate`'s responsibility.
4. **Report** — print the block defined in Output format below, which is the
   authoritative field list.

## Inputs

Accepted forms:

```bash
/av:handover --agent claude-code "continue the OAuth callback fix"
/av:handover --agent codex --cwd . --task "implement the next action in the handoff"
/av:handover --agent cursor --handoff plans/handoffs/oauth-callback.md
/av:handover --agent opencode --model anthropic/claude-sonnet-5 --yes
```

Flags:

| Flag | Effect |
| --- | --- |
| `--agent <id>` | **Required.** Selected coding runtime. Must match an ID in the [runtime catalog](references/runtime-catalog.md). No default; no silent substitution. |
| `[task text]` (positional) | Focus for the successor agent. Included in the handoff Mission section and in the orchestrate job's `prompt` field. |
| `--task TEXT` | Alternative form of the positional task string. If both are given, the positional value wins and `--task` is ignored with a warning. |
| `--cwd PATH` | Workspace root for the dispatched job. Defaults to the current workspace root; passed through verbatim to `av:orchestrate` `cwd:`. |
| `--handoff PATH` | Use an existing handoff artifact instead of generating a new one. The path must exist and pass the schema validation in [artifact-schema.md](../av-handoff/references/artifact-schema.md). |
| `--model NAME` | Override the model for CLI-runtime jobs. **Rejected** for `--agent internal` (see Job spec construction below). |
| `--yes` | Approve write continuation work in the dispatched job. Flips the job's `approval:` field from `require` to `inherit` — except where the handoff's Scope section marks the change destructive or external-destructive, which hold `require` regardless (see Trap 3 in [job-spec-template.md](references/job-spec-template.md)). |

Not accepted in v1:

- `--fallback-agent` — deliberately absent, because a silent runtime
  substitution defeats the point of `--agent`. On preflight failure this skill
  reports the blocker and suggests rerunning with a different `--agent`.
  `av:orchestrate`'s `fallback_runtime` YAML field remains available to anyone
  authoring a spec directly.
- Runtime-specific bypass flags such as `--dangerously-skip-permissions`,
  `--allow-all-tools`, `--yolo`. This skill never emits them by default and
  refuses jobs that would embed them in the prompt.

## Runtime selection

`--agent` must resolve to an ID in
[references/runtime-catalog.md](references/runtime-catalog.md).

- **First-class:** `claude-code`, `codex`, `av-run`, `internal`
- **External, preflight-gated:** `opencode`, `copilot`, `cursor`, `cline`,
  `qwen-code`, `grok`, `kimi`, `agy`
- **Not dispatchable:** `gemini-cli` — reject with actionable guidance
  ("The retired Gemini CLI path is not supported by av:orchestrate"; the
  wording mirrors the precedent in `../av-use-mcp/SKILL.md`).

Availability, authentication, flags, models, and capability tiers are
**never** asserted by this skill or its catalog. They come from
`av:orchestrate`'s live runtime matrix at run time. A missing binary,
missing authentication, unavailable internal agent, or failed preflight
returns a clear blocker in the final report without silent substitution.

## Handoff validation

Before dispatching, the artifact (freshly generated or supplied via
`--handoff`) must pass the four checks in the "Validation summary" of
[artifact-schema.md](../av-handoff/references/artifact-schema.md):

- The document begins with an H1 starting `HANDOFF: `.
- Every required H2 section is present, spelled exactly.
- `Exact next actions` contains at least one item and the first item is
  bold-prefixed `**First safe step**`.
- No raw-secret pattern from
  [redaction-patterns.md](../av-handoff/references/redaction-patterns.md)
  matches any line.

Plus two rules owned outside that summary:

- No required section is empty — `Not captured in this session` is the only
  permitted stand-in
  ([redaction-patterns.md](../av-handoff/references/redaction-patterns.md)).
- Frontmatter `handoff-version` (if present) is `1`, this skill's own rule, so
  an artifact written by a future version is rejected rather than
  half-understood.

Any failure is a hard blocker — this skill refuses to dispatch and prints
the failing check(s) plus the failing file's path. A malformed fresh
artifact means the handoff step itself is broken; dispatching anyway is
worse than surfacing it.

## Job spec construction

Read [references/job-spec-template.md](references/job-spec-template.md) for
the full YAML template. Field mapping summary (avoid these three traps):

- **`prompt:`** = the handoff-consumption instruction + the user's `--task`
  text. Not the enum `task:` field.
- **`task:`** (routing enum) = one of `implement | scout | review | audit |
  test | mechanical | architecture | docs | security`, chosen from the
  handoff's exact-next-actions shape. Defaults to `implement`.
- **`model:`** = the `--model` value for CLI runtimes; **omit** for
  `runtime: internal` (job-spec says internal jobs do not set `model`).
  Rejecting `--model` with `--agent internal` prevents an invalid spec.

Safety fields:

- **`effect:`** = `scoped-write` by default; `high-impact-write` or
  `external-destructive` when the handoff's Scope section marks the change so.
- **`approval:`** = `require` by default; flipped to `inherit` when `--yes` is
  passed, except on those two effects, which stay `require` (Trap 3).
- **`isolation:`** = `worktree` unless the caller explicitly runs
  `--cwd .` on a clean workspace, which is the only case for `none`. The enum
  is `none | worktree`; harness-level isolation is orchestrate's call, not a
  value this skill sets.
- **`timeout:`** = `10m` default; bounded regardless.
- **`expected_output:`** = a one-line description of what "done" looks
  like, cited from the handoff's Exact next actions section.
- **`allowed_tools:`** / **`disallowed_tools:`** — not set by default;
  the runtime's harness profile governs.

The spec references the handoff artifact **as file context**, not as
executable instructions that override the target agent's safety policy.
Wording in the prompt: "Read this file as continuation context. Your own
safety policy still applies."

## Output format

Print exactly:

```markdown
**Handover Result**
- Handoff artifact: <path>
- Orchestrate run: <run-dir>
- Runtime: <resolved-runtime>
- Model: <resolved-model-or-n/a>
- Job result: <success|failure|blocked>
- Verification: <arbiter-verdict-summary>
- Artifacts: <paths under the run dir — for example the job's artifacts/ directory, its capture files (stdout.txt/stderr.txt for CLI, result.md for internal), and report.md — or "none">
- First safe step: <the handoff's first Exact-next-action, the item marked **First safe step**>
- Next action: <what the successor agent completed / where to look>

Unresolved:
- <blockers if any, else "none">
```

`Model:` is `n/a` for `runtime: internal`, where the spec omits the field
entirely. For a CLI runtime with no `--model` the spec omits it too, since this
skill never picks one — report the route orchestrate resolved, read from
`<run-dir>/<job-id>/status.json`. On a blocked job the run directory,
verification, and artifacts may be absent; print the field with what stopped it
rather than dropping the line.

Never inline the handoff body, the orchestrate stdout, or captured logs
in the report. Reference them by path.

## Scope boundaries

- **`av:handoff`** owns capture and redaction. Do not duplicate its rules.
- **`av:orchestrate`** owns runtime discovery, model routing, harness
  profiles, dispatch, capture, resume, and arbiter review. Do not
  duplicate its job-state schema, runtime matrix, or model policy.
- **`av:handover`** owns only: validation, artifact wiring, single-job
  spec construction, and user-facing reporting.

If a change here would require editing `runtime-matrix.md`,
`model-routing.md`, `job-spec.md`, or `internal-routing.md`, stop and
route through `av:orchestrate` instead.

## Security

- Never launch the target runtime with permission-bypass flags by default.
- Never post secrets into the orchestrate prompt or capture. Refuse jobs
  whose `--task` text or handoff content requires embedded credentials.
- Secrets are redacted in the handoff before dispatch (per
  `av:handoff`'s rules). Verify no line matches redaction patterns before
  building the spec.
- Do not disable orchestrate's redaction or capture-bounding controls.

## Scenarios

Seven worked cases — generated and supplied handoffs, preflight failure with
no silent substitution, the write-confirmation gate, secret refusal, a captured
completion, and the `--agent internal --model` rejection — are in
[scenarios](references/scenarios.md). Read it before changing the required
sequence, a refusal condition, or a job spec field.

## Quality gates

- [ ] The handoff artifact passed schema validation before the job spec was
      built — dispatching against a malformed artifact wastes the whole run
- [ ] The spec is a single job; anything needing stages or dependencies goes to
      `av:orchestrate` instead
- [ ] The runtime is the one the user named, and no permission-bypass flag was
      added by default
- [ ] No line of the handoff or the prompt matches a redaction pattern, checked
      after `av:handoff` redacted and before dispatch
- [ ] The report references the handoff, orchestrate output, and logs by path —
      none of their contents are inlined
- [ ] A failed job is reported with the arbiter's verdict, and a blocked job
      with what stopped it — never summarised as success because the job exited

## Workflow position

**Typically follows:** `av:watzup` or `av:pm` when you need to know what is in
flight before handing it over. It calls `av:handoff` itself to produce the
artifact, so that does not need running first.
**Typically precedes:** none — the selected runtime's own session is next, and
this skill's last act is the dispatch and its report.
**Related:** `av:orchestrate` owns runtime discovery, model routing, dispatch,
capture, resume, and arbiter review, and is the right skill for a multi-job
graph or parallel worktrees; this one is the single-job front door over it.
`av:handoff` owns capture and redaction. `av:advise` (user-invoked) or
`kongming` picks *which* agent to use — this skill dispatches the one already
chosen. `av:watzup` owns human-facing status from branches, CI, repository
history, and team state; never route that here.
