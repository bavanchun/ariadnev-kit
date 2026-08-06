# Input and Review Pipeline

Read this reference to resolve the target, collect a complete evidence range,
scout edge cases, and coordinate downstream fix/review cycles.

## Target resolution

Parse left to right; first unambiguous match wins:

| Pattern | Resolve |
|---|---|
| `#N` or GitHub pull URL | Fetch PR title/body/base/head/files and full diff with `gh` |
| 7–40 hex SHA | Validate object, read commit intent/parent, full diff, file list |
| `--pending` | `git status --short`, staged diff, unstaged diff, combined diff vs `HEAD` |
| `codebase <scope>` | Search the named subsystem and its tests/config/contracts |
| `codebase parallel` | Split only independent subsystem scopes |

For a completed commit range requesting review, resolve evidence explicitly:

```bash
BASE_SHA=$(git rev-parse HEAD~1)
HEAD_SHA=$(git rev-parse HEAD)
git diff "$BASE_SHA" "$HEAD_SHA"
```

Use the actual accepted base (often the target branch) when `HEAD~1` is not the
implementation boundary. Do not fetch, switch branches, or modify the worktree
unless the review target requires and authorizes it.

## Resolution failures

- PR lookup fails → report repository/auth state and the unresolved PR.
- Commit object is absent → report the exact hash; do not review a guessed SHA.
- Pending diff is empty → report no pending changes and stop.
- Codebase scope is too broad to review credibly → propose concrete subsystem
  scopes rather than returning a shallow audit.

## Edge-case scout

Before quality review, invoke `vc:scout` with an edge-case-focused prompt. Scout
the changed files plus:

1. affected importers/callers;
2. data flows through changed functions;
3. error and rollback paths;
4. null, empty, max, and malformed boundaries;
5. races, async ordering, resource lifetime, and state side effects;
6. compatibility, migration, and trust boundaries;
7. missing negative-path or integration tests.

Review scout findings against actual code. Add affected files to scope and
address critical evidence gaps before ranking review findings.

## Reviewer handoff

For heavy analysis, dispatch the read-only reviewer with:

- what was implemented;
- `{PLAN_OR_REQUIREMENTS}` — what it should do;
- `BASE_SHA` and `HEAD_SHA` or equivalent diff boundary;
- complete changed-file list and full diff;
- repository rules, risk lane, and scout findings;
- required output: `file:line`, problem, failure path, fix, proof.

Never trust the reviewer summary alone. Reopen cited code, deduplicate findings,
and reject claims without evidence.

## Delivery integration

Use this dependency order when review belongs to active implementation:

1. scout edge cases;
2. review the implementation after scouting completes;
3. route accepted Critical and Important findings to `vc:fix` before proceeding;
4. verify fixes with fresh evidence;
5. re-review the affected range.

The review skill remains read-only. “Fix Critical immediately” means the
controller hands off to `vc:fix`, not that the reviewer edits code.

## Tracked and parallel reviews

Track the chain for multi-file work, independent reviewer scopes, or critical
fix cycles. Split parallel reviews only by disjoint subsystems; assign one owner
per scope and join all reviewers before a shared fix step. Limit re-review to
three cycles before surfacing a persistent disagreement or blocker.

When an active plan exists, reconcile finished review work with it after fixes:

- update affected phase checkboxes, including stale earlier phases;
- record unresolved findings and requirement mappings;
- keep durable evidence in the plan/report;
- treat runtime task state as disposable once the plan is current.

Standalone review with no active delivery returns findings only and does not
create or mutate a plan.
