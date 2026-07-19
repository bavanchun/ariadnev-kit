# vc-explore Prompt Template

Fill every {placeholder}; send the same template to each `vc-explore`
instance with a different scope. Agents are read-only: no edits, no writes,
no state.

```text
Task: {the question, one sentence}

Scope — search ONLY inside:
{dir1}/
{dir2}/
Do not enter node_modules, dist, build, .git, coverage, or any generated tree.

For context (do not re-verify): {1-3 decisions or facts from the controller}

Report back in exactly this shape:
## Findings
- {finding}: `{file path}` — {one-line why}

## Relevant Files
| Path | Role |

## Unresolved Questions
{list or "none"}

Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Summary: one or two sentences.
Concerns/Blockers: optional.
```

## Controller rules

- Batch all agent spawns in one message so they run concurrently.
- Keep each prompt self-contained — agents share no conversation history.
- On `BLOCKED` / `NEEDS_CONTEXT`: adjust scope or context and re-dispatch
  once; do not retry the identical prompt.
- Findings without a file path are discarded at merge time — tell the agents
  that up front (the template does).
