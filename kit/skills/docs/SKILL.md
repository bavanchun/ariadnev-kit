---
name: vc:docs
description: Initialize and maintain project documentation in the docs/ folder. Use for doc setup, updating docs after behavior changes, auditing docs against the code, or recording a durable decision.
user-invocable: true
argument-hint: "init | update | audit | decision [scope]"
metadata:
  author: vchun
  version: "1.0.0"
  upstream: "ak:docs"
  upstream_version: "1.4.0"
  upstream_digest: "sha256:c1524d140a67f0ac89472db64839162083238443e70039d0480f7f9ab1dd1194"
  upstream_relation: "distill"
---

# Docs

Keep `./docs` accurate and small. Documentation is a liability that must earn
its maintenance cost — this skill updates docs when reality changed, and
refuses churn when it didn't.

## The update rule

Update docs only when the change affects: user-visible behavior, setup or
commands, architecture, public contracts, security posture, or a decision a
future maintainer needs. Internal refactors with stable behavior get no doc
edits — say so instead of inventing changelog noise.

## Standard structure

```
docs/
├── project-overview-pdr.md    # what + why + requirements
├── codebase-summary.md        # map of the code, for onboarding
├── code-standards.md          # conventions actually enforced here
├── system-architecture.md     # components, data flow, decisions
├── deployment-guide.md        # how it ships
└── project-roadmap.md         # where it's going
```

Create only the files the project actually needs; an empty template is worse
than an absent file.

## Modes

**init** — scout the codebase (structure, stack, entry points, commands),
then write the needed subset of the structure above. Every claim must be
derived from the repo, not from what projects "usually" do.

**update** — given a change (diff, feature, session): identify which docs
the update rule actually triggers; edit those sections in place; leave the
rest untouched. Verify commands and paths you touch by running/checking
them.

**audit** — walk each doc claim against the code: commands still run, paths
still exist, architecture still true, versions current. Output a findings
list (doc, claim, reality) and fix the confirmed drift.

**decision** — record a durable architectural or behavioral decision that
future sessions should inherit rather than re-debate. Write
`docs/decisions/NNNN-<slug>.md` (next number, zero-padded):

```markdown
# NNNN: <decision title>

## Context
What forced this decision — the constraint, trade-off, or problem.

## Decision
What was chosen, one paragraph.

## Consequences
What this makes easier, what it makes harder, what it rules out.
```

Keep each record ≤40 lines. Use this mode when a plan, brainstorm, or fix
session changed behavior, architecture, authorization, or a public contract
in a way the next session must not silently reverse — not for routine changes.

## Anti-bloat gate

The codebase is the single source of truth; docs are a thin, curated map on top
of it. A pile of stale, contradictory docs is worse than fewer docs — an agent
reading them trusts the wrong one and ships bugs (this is a documented failure
mode, not a hypothetical). So:

- **Do not create a new doc when the code already answers the question.** Prefer
  a `// why:` comment at the code site over a prose file that will drift.
- **Do not open a `docs/decisions/NNNN` record for routine choices** — only for
  decisions a future session would otherwise re-debate or silently reverse.
- **Comments say WHY, never WHAT.** The code shows what it does; a comment that
  restates it is future rot.
- **Prune on sight.** If `audit` finds a doc the code no longer needs, delete it
  and say so — keeping it "just in case" is the bloat this gate exists to stop.

## Quality gates

- Read the existing doc fully before editing; match its structure and tone.
- Never document aspirations as facts — roadmap items go in the roadmap.
- Examples must be real: taken from the repo or executed once.
- Each doc stays under ~800 lines; split by concern when it grows past that.
- After editing, verify links and file references resolve.
- Every claim is derived from the repo, not from what projects "usually" have.

## Output format

Report which docs changed and why, which were deliberately left alone
(update rule not triggered), any doc pruned, and any drift found but not fixed
(with a reason).

## Workflow position

**Typically follows:** `vc:cook`/`vc:plan` finalize (behavior changed, docs may
need it), `vc:journal` (a session decision worth making durable → `decision`
mode).
**Typically precedes:** nothing — docs are a terminal maintenance step.
**Related:** `vc:journal` records what happened in a session; `vc:docs`
`decision` mode records a choice future sessions must honor. Route consequential
decisions here, reflections to `vc:journal`.
