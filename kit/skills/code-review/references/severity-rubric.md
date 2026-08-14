# Severity Rubric (shared)

The single severity scale for `av:code-review` and `av:review-pr`. One rubric so
a finding means the same thing whichever reviewer produced it.

## Tiers

| Tier | Meaning | Blocks merge? |
|---|---|---|
| **Critical** | Bug, security hole, data loss, or a regression to working behavior | Yes — fix + re-verify before merge |
| **Important** | Logic gap, missing validation, broken contract, or *structural* AI-slop (see below) | Yes — fix before proceeding |
| **Suggestion** | Style, naming, minor cleanup, or *micro* AI-slop | No — safe to merge as-is |

Verdict from tiers: any Critical or Important ⇒ **Request changes**. Only
Suggestions ⇒ **Comment**. Nothing actionable ⇒ **Approve**.

## Structural vs micro slop

Keep `--fix` from churning cosmetic rewrites the author won't recognize:

- **Structural (Important):** new dumping-ground file (`utils/`, `helpers/`,
  `*manager.ts`) with no domain anchor; parallel reimplementation of existing
  code; abstraction with a single caller; schema change without a migration;
  a file grown past the project's size limit without splitting.
- **Micro (Suggestion):** over-comments paraphrasing code; defensive paranoia
  (try/catch around code that cannot throw); one-line wrappers; `any`-widening or
  `@ts-ignore` added to silence rather than fix.

## Evidence rule

A finding without `file:line` + a concrete failure (input → wrong output) is not
a finding — it is a feeling. Cut it or prove it. Distrust polished shape:
AI-assisted diffs pass happy-path tests and read cleanly while still being wrong.

## Proof layer

When a finding asserts a bug, name the proof layer that would catch it —
`unit` / `integration` / `e2e` / `platform` (`cook/references/risk-lanes.md`) —
so the fix ships with the right regression guard.
