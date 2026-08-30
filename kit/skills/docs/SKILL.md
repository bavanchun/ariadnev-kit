---
name: av:docs
description: "Create, refresh, summarize, or audit this repository's own docs and root CLAUDE.md/AGENTS.md, or mine git/CI history into DO/DON'T agent rules. Use for docs you maintain here."
user-invocable: true
when_to_use: "Invoke to create, refresh, summarize, or audit project documentation; to author or optimize the root CLAUDE.md/AGENTS.md agent context file; or to distill DO/DON'T rules for that file from git history, CI runs, and optionally source-tree markers via --source."
category: utilities
keywords: [documentation, init, update, summarize, audit, agent-context, claude-md, agents-md, agents, rules, git-history, ci-failures, source-mining, scout, llms-txt]
argument-hint: "init|update|summarize|agent-context|agents|llms"
metadata:
  origin: ported
  author: upstream
  version: "1.9.0"
---

# Documentation Management

Maintain the smallest documentation set that lets people and AI collaborators
understand the project's intent, current contract, evidence, and operating
workflow.

## Philosophy

Code owns WHAT and HOW; docs own WHY and WHERE. Docs are a thin navigation
layer plus knowledge code cannot express: decisions, rejected alternatives,
business rules, domain terminology, and constraints. Point to executable owners
instead of paraphrasing behavior. Load `references/doc-content-rules.md` for any
doc-writing operation and include its relevant rules in delegated context.

A root agent context file (`CLAUDE.md`/`AGENTS.md`) is a distinct artifact
class: process memory that owns imperative HOW-TO-BEHAVE, not WHY/WHERE. It
follows `references/agent-context-rules.md`, which shares this skill's
deletion-test spine but keeps its own keep-or-cut filter and enforcement rules.

## Opening Gate

Start with a bounded brainstorm. Establish:

- who consumes the docs: people, AI, or both;
- the outcome and decisions the docs must make possible;
- which sources prove current behavior;
- what is evergreen guidance versus stateful evidence;
- the acceptance criteria for this docs operation.

Reuse an accepted plan or prior brainstorm when it already answers these
questions. Do not reopen settled intent without new evidence.

## Routing

Parse the first word of `$ARGUMENTS`:

| Input | Load | Purpose |
|---|---|---|
| `init` | `references/init-workflow.md` | Establish a minimal project-specific docs route |
| `update` | `references/update-workflow.md` | Reconcile impacted docs with current evidence |
| `summarize` | `references/summarize-workflow.md` | Summarize current evidence without forcing a new file |
| `agent-context` | `references/agent-context-rules.md` | Author, audit, or optimize the root `CLAUDE.md`/`AGENTS.md` agent context file |
| `agents` | `references/agents-workflow.md` | Mine bounded git and CI history for recurring failures and non-derivable gotchas; distill confirmed DO/DON'T rules into the root agent context file |
| `llms` | `references/llms.md` | Generate or update a links-only `llms.txt` index (llmstxt.org format) from the `docs/` directory |
| empty or unclear | ask the user | Choose the operation; never assume `init` |

Other workflows deciding whether docs are affected should load
`references/documentation-management.md`. When an operation documents or
distills testing guidance, load
`references/practical-principles-for-setting-up-and-running-tests.md` first.

## Flags

Composable with any operation unless noted:

- `--advice` — before writing or updating any doc or agent context file, spawn
  `kongming` for counsel on what to keep, cut, or restructure, and factor it into
  the change. `kongming` advises only; this skill stays responsible for every
  edit and still confirms writes with the user. Spawn it again when stuck or
  before an irreversible docs change. **Implied by `agents`** (do not re-spawn).
- `--audit` — for `agent-context`: first get a `kongming` audit pass over the
  current `CLAUDE.md`/`AGENTS.md`, then interview the user one question at a time
  (one keep / cut / fix decision per question) using the keep-or-cut filter in
  `references/agent-context-rules.md`. Apply only the confirmed changes. For
  `agents`: same interview cadence at the confirmation step, one question per
  proposed rule.
- `--dry-run` — scoped to `agents`. Stops after signal ranking (step 3), reports
  mined signals and the watchlist, spawns no advisor, writes no file.
- `--source` — scoped to `agents`. Layers `av:scout` source-tree mining onto
  the git/CI pass (never replaces it). Read-only: no generators, no tests.
  Adds a corroboration gate for source-only clusters (≥2 anchors plus a
  code/test guard or git-CI corroboration). Composes with `--dry-run` and
  `--audit`.

`agents` also accepts an optional positional bound: `agents 30d` (days) or
`agents 500` (commits). Defaults: 90 days OR 300 commits (whichever is smaller),
200 CI runs.

## Discovery Contract

Do not assume filenames, a file count, or a universal documentation tree.
Discover the project's contract in this order:

1. repository instructions such as `AGENTS.md` or `CLAUDE.md`;
2. the root `README.md`;
3. the project's docs index or navigation file, when present;
4. existing files under `docs/` and links from the earlier routes;
5. source, tests, scripts, generated artifacts, and live state that prove claims.

Use `docs/` for project documentation when that is the repository convention.
Treat source and tests as evidence, not prose that must be copied into every
document.

## Maintenance Rules

- Update only documents whose contract or evidence changed.
- Delete stale or duplicate guidance instead of preserving it for history.
- Link to the owning script, manifest, or generated source instead of copying
  command lists, inventories, or exact test names into multiple files.
- Keep evergreen guidance free of dates, issue IDs, phase labels, and section
  coordinates unless those values are the subject of the contract.
- Keep stateful research, plans, audit results, and release evidence clearly
  labeled and outside the evergreen authority path.
- Do not create an ADR, governance layer, generator, or docs-only CI gate unless
  the user explicitly requests that additional operating surface.
- Verify every path, command, configuration key, and behavioral claim against
  current evidence.

For diagrams, use `av:mermaidjs-v11` for a diagram that lives inline in a
document, or `av:tech-graph` when a document needs a publish-grade exported
image — and only when a visual materially improves understanding. Review the
rendered output before committing it.

**Do not implement product code during a documentation operation.**

## Output format

Report the decision before the diff, because "no change was needed" is a valid
and common result:

1. **Operation** — which route ran (`init`, `update`, `summarize`,
   `agent-context`, `agents`, `llms`) and the argument that selected it.
2. **Discovery** — the contract found, in the order of the Discovery Contract:
   which instruction file, README, index, and evidence sources were read. Name
   them; do not describe them as "the usual docs". Write "none" for a route that
   read none of them.
3. The body, which depends on the route:
   - **Write routes** (`init`, `update`, `llms`) — **Changes**, a table of
     `File | Created/Updated/Deleted | What changed | Evidence`. `Evidence`
     cites the source, test, script, or live state that proves the new text. A
     row without evidence is a row that was written from memory.
   - **`agent-context`** — a **Proposal**, not a change log: the current file's
     line count, a per-block keep / cut / migrate classification, the deletions
     and migrations as a diff, and any deterministic control recommended as a
     snippet. Nothing is written until the user confirms.
   - **`agents`** — the **Evidence** first: the window mined, which sources
     were read (git, CI via `gh`, PR reviews, `--source` scout) and which were
     skipped and why, the ranked candidates with their incident or anchor
     counts, and the watchlist. With `--dry-run` the report ends there. Otherwise
     a **Proposal** follows, one distillation template per surviving rule with
     its placement, as a single batch diff plus cut-offers; after confirmation,
     the proposed / accepted / rejected / watchlisted / enforcement-recommended
     counts and the line-count delta.
   - **`summarize`** — **Findings**, the evidence-backed summary itself. This
     route answers a question; it does not necessarily touch a file.
4. **Deliberately unchanged** — documents inspected and left alone, each with
   the reason.
5. **Unresolved questions** — or "none".

## Quality gates

- [ ] The only files written are documentation surfaces the Discovery Contract
      identified — this project's docs route, the root `CLAUDE.md`/`AGENTS.md`,
      or the `llms.txt` output path — and no product code was implemented
- [ ] No claim was verified against another document; every one traces to
      source, tests, scripts, or live state
- [ ] For `agent-context` and `agents`: the diff was shown and confirmed before
      any write, no secret was written into the file, and nothing was written
      inside the installer-managed `<!-- ariadnev:start -->` …
      `<!-- ariadnev:end -->` block
- [ ] For `agents`: mining was read-only — no git mutation, no CI re-run, no
      test run — and every proposed rule cites ≥3 independent incidents or
      passes the `--source` corroboration gate
- [ ] No `settings.json` or hook file was edited — a deterministic control is
      recommended as a snippet for the user to apply, never applied here
- [ ] Any runtime loader behavior stated was verified against that runtime
      rather than asserted as an evergreen fact

## Workflow position

**Typically follows:** `av:cook` or `av:fix` when landed work changed a
user-visible contract, and `av:scout` when the repository's docs layout is not
yet known.
**Typically precedes:** `av:ship`, which invokes `/av:docs update` as step 9 on
official releases — as a background task, so confirm the docs landed before
ship's commit at step 10 rather than assuming they rode along.
**Related:** `av:docs-seeker` retrieves *other* projects' documentation, where
this skill writes this project's own; `av:interview-docs` derives a document
from the user's answers rather than from the codebase; `av:folder-context`
owns subfolder `CLAUDE.md` files, where the `agent-context` route here owns the
root one; `av:retro` narrates git history for people, where the `agents` route
here mines it for agent rules and writes nothing until confirmed — route
cross-run watchlist trends through `av:journal`, not a state file; `av:llms` is
the general `llms.txt` generator — arbitrary source paths or URLs, custom
output location, and the inline-content `llms-full.txt` — whereas this skill's
`llms` argument covers only the narrow case: a links-only index built from
`docs/`.
