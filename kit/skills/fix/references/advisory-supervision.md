# Advisory Supervision Mode (`--advice`)

Where `kongming` is consulted while fixing. Read when the invocation carries
`--advice`.

When `--advice` is present, run this skill under `kongming` supervision.
`kongming` is an advisory-only supervisor: it returns counsel, never code, and
the main agent stays responsible for every decision, edit, and gate.

Spawn `kongming` at these checkpoints:

- **After each phase or step completes** (Steps 1-6) — pass the goal, what
  changed, and the evidence; ask for a go/no-go and the next risk to watch.
- **When stuck** — the 3+ failed-attempt gate, a blocked step, or contradictory
  evidence; pass everything already tried and the exact obstacle before
  questioning the architecture.
- **Before a high-stakes decision** — a design fork, a public-contract or
  security-sensitive change, or an irreversible action; get counsel first.

Invoke with
`delegate_agent capability(subagent_type="kongming", prompt="<task, evidence, approaches tried, the exact question>", description="advice: <checkpoint>")`.
Give it enough context to answer in one reply; it does not interview.

**When the workflow reaches a PR** (for example, a CI-failure fix shipped for
review): when handing off to a downstream skill, pass `--advice` along so
supervision persists. Watch and fix CI until every required check is green,
then spawn `kongming` to review the whole implementation and post its
assessment plus concrete next steps as a comment directly on the PR and the
source issue (when one exists).

`--advice` adds supervision; it never bypasses this skill's approval gates,
tests, review blockers, branch protections, or security policy.
