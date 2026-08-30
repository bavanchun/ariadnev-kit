# Arbiter Checklist and Failure Modes

What the coordinator asks before the final report is allowed out, and what it
does when a job does not finish cleanly. The pass conditions themselves are the
Arbiter Contract in [job-spec.md](job-spec.md); this file is the working
checklist that proves each condition and the playbook for the failures that
make it unprovable.

## Arbiter Checklist

The final report is blocked until the arbiter answers:

- Did every required job produce its expected artifact?
- Did any job fail, time out, request permission, or emit uncertainty?
- Do outputs contradict each other?
- Were all listed checks run, and did they pass?
- Are claims supported by paths, command output, citations, tests, or artifacts?
- Did every route meet its capability and risk floor?
- Was runtime/model/agent availability revalidated for this run?
- Are destructive actions approved and reversible?
- Are unresolved questions listed plainly?

A "no" or "unknown" on any line is `Arbiter: fail` or `Arbiter: blocked`, never
a footnote. The arbiter route must satisfy the judgment floor in
[model-routing.md](model-routing.md), and its independence is verified from the
live inventory, not asserted.

## Failure Modes

- **Missing or unauthenticated runtime:** evaluate declared fallbacks through
  the same live policy in [runtime-matrix.md](runtime-matrix.md); otherwise
  block.
- **Missing internal agent:** re-resolve against the live agent list per
  [internal-routing.md](internal-routing.md); use a CLI fallback only when it
  meets the same floors.
- **Unknown flag or model:** fail the attempt, return to the live probe, and
  never guess a replacement.
- **Permission prompt:** stop the job and report the exact approval boundary.
- **Timeout:** preserve bounded partial output, fail the job, and block
  dependents.
- **Interrupted run:** reload `jobs.yaml` and `state.json`; keep successful
  outputs, preserve prior attempts, revalidate live routes, and redispatch only
  interrupted jobs, following the resume rules in [job-spec.md](job-spec.md).
  Before redispatching a CLI job, confirm its original process is no longer
  running (the PID, command, and worktree the run tracked under Safety
  defaults); a still-running worker is reconciled or stopped, never doubled.
- **Ambiguous ownership:** sequence the jobs or assign separate worktrees and
  an explicit integration step.
- **Reference disagreement:** stop and report the contract mismatch instead of
  choosing whichever copied route looks newer.

Retry only transient failures. `BLOCKED` and `NEEDS_CONTEXT` change the
context, scope, or approach — never the same prompt again.

## Completion Report

End every run with:

```markdown
**Orchestrate Result**
- Spec: <path or inline request>
- Report: <plans/reports/orchestrate-.../report.md>
- Jobs: <success>/<failed>/<blocked>
- Arbiter: pass|fail|blocked
- Checks: <commands or none>

Unresolved questions:
- None
```
