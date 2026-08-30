# Ultra verifier and advisory supervision

Full mechanics for the two supervision flags this skill accepts. Both compose:
`--ultra` shapes how the decision is produced, `--advice` reviews it.

## Ultra Verifier Mode (`--ultra`)

When `--ultra` is present, run phases 0-1 once; the skill then fans only the
Agentization Map and decision record generation (phases 2-3) to exactly five
independent read-only candidates in one parallel wave; a single strongest-model
verifier scores them.

- **Candidate task:** each candidate produces a complete decision record —
  Agentization Map, output mode, capability list, tool/command names,
  transports, deployment targets, package metadata — from the same scout
  evidence packet.
- **Rubric:** fidelity to scouted behavior (nothing invented), agent-centric
  design quality, capability selection sharpness, and deployment realism.
- **Finalizer:** the verifier selects the single winning decision record
  unchanged (or rejects all); phases 4-7 execute once from the winner. On
  reject-all, hard-stop and report why.

In `--ask`, the user interview runs once before the fan; candidates never call
`ask_user`. Full mechanics are in
`../../av-brainstorm/references/ultra-verifier-mode.md`. It is a best-of-5
verifier mode inspired by LLM-as-a-Verifier, not the full framework.

## Advisory supervision (`--advice`)

When `--advice` is present, run this skill under `kongming` supervision. The
shared protocol — the advisory-only role, the invocation shape, and the
never-bypass rule — lives in
`../../av-cook/references/advisory-supervision.md`; read it first. Spawn
`kongming` at these checkpoints:

- **After Scout/Analyze** — pass the Agentization Map and evidence; ask for a
  go/no-go and the top risk before deciding.
- **Before the phase 3 decision record is finalized** — pass mode, capability
  list, names, transports, deployment targets; get counsel first.
- **Before the phase 7 package handoff** — pass harden evidence (tests, CI,
  docs, security pass) and ask whether it supports release.
- **When stuck** — repeated failures or contradictory evidence; pass everything
  tried and the exact obstacle.

`--advice` adds supervision; it never bypasses this skill's hard gates, tests,
review blockers, or security policy.
