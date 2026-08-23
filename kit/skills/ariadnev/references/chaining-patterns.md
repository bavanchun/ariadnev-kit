# Chaining Patterns

How to compose installed skills into a workflow: the skeleton, the link
contract, context passing, when to collapse, and how to recover. Sequences for
engineer development work are owned by
`../../av-cook/references/workflow-routing.md` — load that file for them; this
file never re-lists its tables. Marketing sequences live here because no
installed reference owns them today; if a marketing routing reference ships
later, this section slims to a pointer.

## The Skeleton

Every chain is a subset of:

```
understand → decide → execute → verify → deliver
```

| Link | Purpose | Typical owners |
|---|---|---|
| understand | Gather the facts the next link needs | scout/research skills, explorer roles |
| decide | Turn facts into an approach the user would accept | brainstorm/plan skills |
| execute | Produce the artifact | domain skill under a workflow skill |
| verify | Prove the artifact does what was decided | test/review skills, tester + reviewer roles |
| deliver | Ship, publish, schedule, or report | ship/publish skills, outcome-first report |

Chains run forward only. A discovered problem creates a detour, not a
reshuffle.

## Link Contract

- **Entry criteria**: the inputs the link needs exist and are named (a file, a
  report, a decision). If entry criteria are not met, the previous link is not
  done — do not start the link anyway.
- **Exit criteria**: the link produced its artifact and it is verifiable
  (file written, tests green, draft complete). "Mostly done" does not exit.
- **Single owner**: one skill or agent owns each link. Helpers feed the owner;
  they do not share the pen.

## Context Passing

- Chains of one or two links pass context in-conversation.
- Longer chains write artifacts to files (reports, plans, drafts) and pass
  paths, not prose summaries — the next link rereads the artifact, so nothing
  is lost to compression. Use the project's existing report/plan directories
  (`plans/reports/` where the convention exists).
- A link's report states: what was produced, where, what the next link needs
  to know, open concerns. Nothing else.

## Collapse Rule (keep chains short)

Merge or drop a link when ALL of:

1. Its owner would spend under ~5 minutes of focused work.
2. It produces no artifact a later link rereads.
3. Skipping it removes no verification demanded by the risk class.

A three-link chain that fits the task beats a five-link chain that fits the
diagram. Verification links are exempt from collapse at elevated and high
risk.

## Insertion Rule

Modifiers add links; nothing else does:

- size epic → insert `decide` (planning) if absent, split `execute` by phase.
- risk elevated → insert `verify` if absent.
- risk high → insert `verify` AND an independent review, plus user
  confirmation before the irreversible step.
- domains 2+ → one execute sub-link per domain, dependency-ordered.

## Engineer Development Sequences

Owned by `../../av-cook/references/workflow-routing.md` (ships with every
ariadnev install). Load it when the class is build-feature, fix-defect,
investigate-explain, review-audit, or ship-release on a codebase. If domain
choice is ambiguous first, `../../av-find-skills/references/domain-routing.md`
resolves it on installs that ship find-skills; otherwise match installed skill
descriptions.

## Marketing Sequences

This kit ships no marketing routing reference and no marketing skills. The
taxonomy still classifies `plan-campaign`, `create-content`, and
`analyze-performance` tasks, but there is nothing here to route them to: build
the chain from whatever Step 2 actually found, and report the gap rather than
inventing a skill name that looks plausible.

## Failure and Detours

- A failed link never advances the chain. Detour: diagnose (fix/debug skill or
  debugger role), or rescope the link, then resume AT the failed link.
- Two consecutive failures of the same link: stop the chain, report what ran,
  what failed, and the smallest missing input.
- New information that invalidates a completed link: say so explicitly, redo
  from that link forward. Silent partial redo corrupts the chain's artifacts.
