# Advisory Supervision Mode (`--advice`)

Where `kongming` is consulted during planning. Read when the invocation
carries `--advice`.

When `--advice` is present, run this skill under `kongming` supervision.
`kongming` is an advisory-only supervisor: it returns counsel, never code, and
the main agent stays responsible for every decision, edit, and gate.

Spawn `kongming` at these checkpoints:

- **After each planning phase, gate, or major analysis completes** (research,
  solution design, red-team, validation) — pass the goal, what was concluded,
  and the evidence; ask for a go/no-go and the next risk to watch.
- **When stuck** — repeated failures, a blocked step, or contradictory evidence;
  pass everything already tried and the exact obstacle.
- **Before a high-stakes decision** — a design fork, a public-contract or
  security-sensitive change, or an irreversible action; get counsel first.

Invoke with
`delegate_agent capability(subagent_type="kongming", prompt="<task, evidence, approaches tried, the exact question>", description="advice: <checkpoint>")`.
Give it enough context to answer in one reply; it does not interview.

**When the workflow reaches a PR** (here, via `--github` or a downstream
`/av:cook`/`/av:ship` handoff): pass `--advice` to the downstream skill so
supervision persists across the handoff. Watch and fix CI until every required
check is green, then spawn `kongming` to review the whole implementation and
post its assessment plus concrete next steps as a comment directly on the PR
and the source issue (when one exists).

`--advice` adds supervision; it never bypasses this skill's approval gates,
red-team/validation gates, or security policy.
