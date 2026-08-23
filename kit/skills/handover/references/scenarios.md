# Handover Scenarios

Expected behavior for each dispatch path. Read when changing the required
sequence, the refusal conditions, or the job spec fields, to check the change
against every case it touches.

## Scenario 1 — Generated handoff, claude-code, read-only default

**Given** no `--handoff` is passed and the user runs
`/av:handover --agent claude-code "continue the OAuth callback fix"`.
**When** the skill runs.
**Expect** `av:handoff` produces a fresh artifact under `plans/handoffs/`;
the artifact passes schema validation; the built job spec has
`runtime: claude-code`, `prompt:` containing both the handoff read
instruction and the task text, `approval: require`, `effect: scoped-write`;
orchestrate runs a preflight and dispatches; the final report carries every
field of the SKILL.md Output format block.

## Scenario 2 — Supplied handoff, codex

**Given** `plans/handoffs/oauth-callback.md` exists and is valid.
**When** `/av:handover --agent codex --handoff plans/handoffs/oauth-callback.md`
runs.
**Expect** no new `av:handoff` invocation; the supplied artifact is
validated against the schema and secret patterns; the job spec's
`runtime: codex`.

## Scenario 3 — Runtime preflight failure, no silent fallback

_(There is deliberately no fallback opt-in. Orchestrate's `fallback_runtime`
YAML field remains available to advanced users who author a spec directly.)_

**Given** `--agent opencode` is chosen but the binary is missing or
unauthenticated.
**When** the skill runs.
**Expect** orchestrate's live matrix marks the candidate `unavailable`;
`av:handover` prints a blocker naming the missing capability and suggests
`--agent <alternative>`; **no silent substitution**; the handoff artifact
was written and is included in the blocker report so no work is lost.

## Scenario 4 — Write confirmation without `--yes`

**Given** the task text requests write work the handoff's Scope section does
**not** mark destructive (its Exact next actions say "delete legacy adapter",
and Scope confirms the adapter is dead code inside the change's own boundary).
**When** `/av:handover --agent claude-code "delete the legacy adapter"`
runs without `--yes`.
**Expect** the job spec has `approval: require` and `effect: scoped-write`;
orchestrate stops at the confirmation gate; the report notes the block and
suggests rerunning with `--yes` once the user approves.

Had Scope marked the change destructive, the effect would be
`high-impact-write` and `approval` would stay `require` whatever `--yes` said —
Trap 3 in [job-spec-template.md](job-spec-template.md) is the mapping, and the
report must say `--yes` will not clear that gate.

## Scenario 5 — Secret in `--task` text

**Given** the user pastes a Bearer token into the task string.
**When** `/av:handover --agent claude-code "use Bearer eyJ… to test"` runs.
**Expect** immediate refusal (before the handoff step) with a message
asking the user to rephrase without the credential. No artifact is
written. No orchestrate invocation.

## Scenario 6 — Successful captured + arbited completion

**Given** all preflight passes, `--yes` is set, `--agent claude-code`.
**When** orchestrate dispatches and the job completes.
**Expect** the report cites the run dir, the arbiter verdict, the produced
artifacts under the run dir, the verification-status summary, and the next
action. The handoff artifact path is still surfaced.

## Scenario 7 — `--agent internal` with `--model` rejection

**Given** `/av:handover --agent internal --model anthropic/claude-sonnet-5
"…"`.
**When** the skill runs.
**Expect** immediate refusal explaining that job-spec.md forbids `model:`
on internal jobs; suggests rerunning without `--model` or with a CLI
runtime.

