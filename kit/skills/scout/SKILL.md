---
name: av:scout
description: Scout a codebase fast with parallel av-explore agents. Use for file discovery, task-context gathering, or mapping which modules a change will touch.
user-invocable: true
argument-hint: "<what to find or understand> [--quick]"
metadata:
  author: vchun
  version: "1.0.0"
---

# Scout

Answer "where does X live and how does it work" quickly, by fanning out
`av-explore` agents over non-overlapping regions and merging their findings
into one report.

Handles: file discovery, pre-planning context, blast-radius mapping.
Does not handle: fixing (`av:fix`), deciding (`av:brainstorm`), deep single
file analysis (just read the file).

## Mode selection

| Situation | Mode |
|---|---|
| Small repo, or one clear question | **Solo**: search directly (Glob/Grep/Read), no agents |
| Medium repo, 2-4 distinct areas | **Parallel**: one `av-explore` agent per area |
| `--quick` flag | Solo, cap at ~10 file reads, report what you have |

## Parallel workflow

1. **Partition** — split the repo into non-overlapping scopes by directory
   (e.g. `src/api` + `src/web` + `packages/*`). Never give two agents the
   same tree; never assign generated dirs (node_modules, dist, .git).
2. **Dispatch** — spawn `av-explore` agents in a single batch, each with
   the prompt template from `references/agent-prompt-template.md` filled in:
   scope dirs, the question, the report format, the status line.
3. **Merge** — deduplicate findings, resolve conflicts by reading the
   contested file yourself, drop anything an agent could not evidence with a
   path.
4. **Report** — to the user, and to
   `plans/reports/scout-{yymmdd-hhmm}-{slug}-report.md` when the scout feeds
   a plan or brainstorm.

## Output format

```markdown
# Scout: <question>

## Answer
2-5 sentences: the shape of the thing you were asked to find.

## Relevant Files
| Path | Why it matters |

## Patterns & Conventions
Existing idioms a change here must follow.

## Risks / Gotchas
Contracts, coupling, or surprises found.

## Unresolved Questions
What scouting could not settle, or "none".
```

## Quality gates

- [ ] Every claim carries a file path (line ref where useful)
- [ ] Agent scopes did not overlap
- [ ] Report says what was NOT searched, when scope was cut

## Workflow position

**Typically follows:** any request that names an unfamiliar area — usually the
first step of `av:brainstorm`, `av:plan`, `av:cook`, or `av:fix` rather than a
standalone invocation.
**Typically precedes:** `av:brainstorm` (options need grounding), `av:plan`
(phases need real file paths), `av:cook` (match existing patterns), `av:fix`
(widen the search after failed hypotheses).
**Related:** `av:ask` answers a question about code already located; `av:scout`
locates it. Deep analysis of one known file needs neither — just read it.
