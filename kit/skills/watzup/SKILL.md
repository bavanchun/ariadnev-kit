---
name: av:watzup
description: "Report in-flight work as text: branch, worktree, detached-HEAD state, unfinished plans with checkbox progress, roadmap milestones, ranked next steps. Use for end-of-session or fresh-worktree status."
user-invocable: true
when_to_use: "Invoke for end-of-session handoffs, progress summaries, cross-branch worktree status, unfinished plan discovery, and next-step recommendations."
category: utilities
keywords: [session, wrap-up, changes, review, worktree, branches, plans, roadmap, priority, next-steps]
metadata:
  origin: ported
  author: upstream
  version: "1.2.0"
---

# Wrap Up

Create a short, evidence-backed handoff report for the active project, with priority-ranked next steps grounded in plan progress and roadmap state.

This skill handles status and handoff reporting only. It does not implement, edit, commit, checkout, merge, push, or fetch unless the user explicitly requests fresh remote refs.

For conversation-state compaction that preserves decisions, rationale, and session
context for a fresh agent, use `av:handoff` instead.

## Required Scan

Run the scanner first from the project root:

```bash
node scripts/watzup-scan.cjs --json
```

Use `--fetch` only when the user asks to refresh remotes before the report:

```bash
node scripts/watzup-scan.cjs --json --fetch
```

When developing from this source repository before install, run the same command from the source skill directory.

Default behavior:
- Scan local branches and remote branch refs.
- Scan registered worktrees.
- Scan unfinished plans from visible worktrees and tracked branch refs.
- Count `- [ ]` / `- [x]` checkboxes in each plan directory (plan.md + phase-*.md) for progress %.
- Scan `docs/*roadmap*.md` and `docs/*milestones*.md` for active milestones.
- Build priority-ranked next steps via composite scoring (see below).
- Do not run network operations.
- Do not change branches or mutate the checkout.

## Priority Ranking

The scanner now emits `nextSteps[]` as objects with `{priority, action, rationale, planId?}`. Ordering reflects a composite score per plan:

- **Status**: `in-progress` (+400) > `in-review` (+300) > `pending` (+150).
- **Workspace alignment**: current worktree (+600), current branch (+400).
- **Provenance**: filesystem source (+80), local ref (+40).
- **Momentum**: plans between 40-90% complete get bumped (close to done). Brand-new plans (<10%) get a small starter bump.

Hygiene steps (dirty working tree, detached HEAD) always rank first. Roadmap milestones fill remaining slots after plan-driven actions.

Each step carries a `priority` bucket — one of `hygiene`, `plan`, `roadmap`, or
`fallback`. `fallback` appears alone, and only when the scan found no dirty
changes, no detached HEAD, no unfinished plans, and no active milestone.

## Output format

The scanner's own text mode (omit `--json`) prints raw evidence. Your report is
a separate, shorter thing written from that evidence — do not paste the scanner
output and call it the handoff. Prefer this structure:

1. **Current State** - branch or detached HEAD, dirty/clean, active worktree.
2. **Recent Work** - only the highest-signal branches/worktrees.
3. **In-Flight Plans** - unfinished plans with the scanner's
   `X/Y todos · NN% done` annotation where it supplied one. Progress is attached
   only to plans found on the filesystem; a plan discovered on a git ref comes
   back as `no checkbox data`. Report that verbatim and name the ref — never
   compute a percentage yourself.
4. **Roadmaps** - active milestones from each worktree's top-level `docs/`
   files whose name ends in `roadmap.md`, `milestone.md`, or `milestones.md`.
5. **Next Steps** - the scanner's ranked steps, at most six, each with its
   one-line rationale. There may be only one; report what came back rather than
   padding to a target count.
6. **Warnings** - scanner failures, stale remote-ref caveat, detached HEAD.

Pass `--redact-paths` when the report will leave this machine: it replaces
repository, worktree, and plan-source paths — plus next-step actions,
rationales, and warnings — with stable labels. It does not touch
`current.statusLines` or branch and commit subjects, so check those yourself
before sharing.

If the scanner fails, say it failed and include the error. Then use minimal read-only fallback commands:

```bash
git status --short --branch
git worktree list --porcelain
git for-each-ref --format='%(refname:short) %(committerdate:iso8601) %(objectname:short) %(subject)' refs/heads refs/remotes
find plans -maxdepth 2 -name plan.md -print
find docs -maxdepth 2 -iname '*roadmap*.md' -print
```

Do not pretend the full scan completed when fallback was used.

## Quality gates

- [ ] The checkout was not mutated — no branch change, commit, merge, or push,
      and no `--fetch` unless the user asked for fresh remotes
- [ ] Every plan named in the report came back from the scan, with its status
      and progress as reported — not recalled from earlier in the session
- [ ] Each next step keeps the scanner's rationale; a step whose rationale is
      dropped is a claim with its evidence removed
- [ ] If the scanner exited non-zero, the report says so and names the fallback
      commands used
- [ ] Plans found only on a remote ref are marked as such, since the local copy
      may be stale

## Workflow position

**Typically follows:** nothing — this skill is usually the first thing run in a
fresh worktree, a detached checkout, or at the end of a session.
**Typically precedes:** `av:cook` or `av:fix` on the plan its ranking put first,
or `av:handoff` when the session is ending and the next agent needs the
conversation's decisions, not just the repository's state.
**Related:** `av:handoff` captures conversation state for a successor agent
where this skill reads the repository; `av:pm` reconciles and edits the plan
files this skill only reports on; `av:plans-kanban` shows the same plan data as
a clickable dashboard rather than text.
