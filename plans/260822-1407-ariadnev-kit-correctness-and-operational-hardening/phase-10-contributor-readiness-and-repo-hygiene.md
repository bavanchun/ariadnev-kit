---
phase: 10
title: "Contributor readiness and repo hygiene"
status: completed
priority: P3
effort: "4-6h"
dependencies: []
---

# Phase 10: Contributor readiness and repo hygiene

## Overview

Make the repo legible to someone who is not the author, and clear the debris a
solo history has accumulated. No dependencies, touches no release machinery,
conflicts with no other phase — it can be done in any gap.

Scope came from a brainstorm on 2026-08-22. The maintainer wants the repo to hold
up if a contributor ever appears. That is a *contributor*-facing concern and is
deliberately kept separate from the *user*-facing release-channel work in
[phase 11](./phase-11-beta-release-channel.md); conflating the two is what made
the original request look bigger than it is.

## What exists already

Not starting from zero. Present: `SECURITY.md`, `LICENSE`,
`packages/cli/CHANGELOG.md` (changesets-generated), `docs/decisions/` with 11
ADRs, `docs/release-and-publish-guide.md`, `AGENTS.md` + `CLAUDE.md`.

Missing: `CONTRIBUTING.md`, PR template, issue templates, root `CHANGELOG.md`.

## A constraint that cannot be bought

**Branch protection is unavailable on this repo.** Verified:

```
GET /repos/bavanchun/ariadnev-kit/branches/main/protection
→ 403 "Upgrade to GitHub Pro or make this repository public"
```

So required reviews, required status checks, and linear-history enforcement
**cannot be turned on** while the repo is private on the free plan. Everything
here is therefore convention plus CI, not enforcement. Say so in `CONTRIBUTING.md`
rather than implying a gate that does not exist — a contributor who assumes CI is
blocking will merge red.

The honest options, if enforcement is ever wanted: GitHub Pro, or make the repo
public. Both are the maintainer's call and neither is in scope here.

## Requirements

**Functional**
- `CONTRIBUTING.md` covers: prerequisites and setup, how to run the test tiers,
  the commit convention actually in use, the PR flow, and what "done" means.
- A PR template whose checklist matches the gates CI actually runs.
- Issue templates for bug and feature.
- Repo debris cleared.

**Non-functional**
- Describe the workflow that exists. Do not invent process to look complete —
  this repo has one maintainer and no enforcement, and pretending otherwise is
  worse than saying it plainly.
- Every claim about a command or gate must be checked against
  `.github/workflows/ci.yml` and `package.json` before it is written.

## Related Code Files

- Create: `CONTRIBUTING.md`
- Create: `.github/pull_request_template.md`
- Create: `.github/ISSUE_TEMPLATE/bug.md`, `.github/ISSUE_TEMPLATE/feature.md`
- Modify: `README.md` (link to CONTRIBUTING)
- Modify: `package.json` (root version)

## Implementation Steps

1. Read `ci.yml` end to end and list the gates it actually enforces. The PR
   checklist is derived from that list, not from habit.
2. Write `CONTRIBUTING.md`. The commit convention is observable from
   `git log` — single-line conventional subjects, no trailers, no AI references.

   Document the branch model **as it now stands**, not as it was: the maintainer
   adopted `main ← dev ← feature/*` on 2026-08-22. Work branches off `dev`, lands
   on `dev` by PR, and `dev` is promoted to `main` deliberately. An earlier
   brainstorm the same day listed a long-lived integration branch as a non-goal;
   that was superseded by an explicit decision and this file records the decision,
   not the recommendation it overrode.
3. PR template: a checklist mirroring step 1, plus a line for the scope rule that
   unrelated changes ride in their own commit.
4. Issue templates, minimal.
5. Hygiene, each verified before acting:
   - `git remote prune origin` — two dead refs
     (`feat/evidence-backed-parity`, `fix/installer-checksum-pin`).
   - Six `vcskill@*` GitHub releases are still **Draft** from the old brand.
     Decide per release: publish or delete. Do not bulk-delete without looking —
     they are the only record of that era.
   - Root `package.json` says `0.1.0` while the CLI is `1.1.0`. Confirm the root
     is private and unpublished, then either align it or mark it `"private": true`
     with no version. Check what reads it first.
6. Link `CONTRIBUTING.md` from `README.md`.

## Decisions made during implementation

**The six `vcskill@*` drafts stay drafts.** The phase said "publish or delete";
both are worse than the third option, so the decision is recorded here rather
than forced into one of two boxes.

Measured first: six drafts, 6 assets each, 423-427 MB apiece, ~2.5 GB total.
They are the only artifacts from that era.

- *Delete* is irreversible and destroys the only copy. The commits still exist,
  but nothing proves those binaries are reproducible from them today.
- *Publish* makes old-brand binaries reachable. The edge proxies `/download/<asset>`
  generically — verified against production — so publishing them puts `vcskill`
  binaries on `ariadnev.com`. That is the opposite of what the brand-drift gate
  exists to enforce.
- *Leave as drafts* costs nothing but storage. They stay private, stay
  recoverable, and reach no user.

Revisit if release storage ever matters. Until then this is a decision, not an
omission.

**The root `package.json` version was removed, not aligned.** It said `0.1.0`
against the CLI's `1.1.0`. Nothing reads it — `version.ts` resolves
`packages/cli/package.json`, and the root is `private: true`, so it is never
published. A field that cannot drift is better than one kept in step by hand.
`pnpm install --frozen-lockfile`, `lint` and `build` all verified after.

**The dead refs were not the two the phase named.** It listed
`feat/evidence-backed-parity` and `fix/installer-checksum-pin`; by the time this
ran they were already gone and the stale ones were `feat/link-integrity` and
`feat/lint-ratchet` — this plan's own merged branches. Pruned.

## Success Criteria

- [x] `CONTRIBUTING.md` exists and every command in it was run from this
      checkout: lint, build, coverage, test:hooks, the node:test scripts, the
      dist validate, brand drift, and `bash -n install.sh`.
- [x] The PR checklist maps 1:1 to a gate in `ci.yml`, plus two things CI
      cannot check and which are marked as such.
- [x] `CONTRIBUTING.md` states plainly that CI is advisory, quotes the 403, and
      says what the honest fixes are.
- [x] `git branch -a` shows no dead remote refs.
- [x] No `vcskill@*` release is left in an *undecided* Draft state — the
      decision is to keep them, with the reasoning above.
- [x] Root version inconsistency resolved, with the reason recorded.

## Risk Assessment

**Documenting a process nobody follows.** A `CONTRIBUTING.md` that describes an
idealized flow is worse than none: it misleads the one contributor it was written
for. *Signal:* a step in the document has never actually been run by the
maintainer. *Response:* derive every step from observable repo evidence — `git
log`, `ci.yml`, `package.json` — and delete anything that cannot be pointed at.

**Deleting the wrong draft release.** The `vcskill@*` drafts predate the rename
and may hold the only artifacts from that period. *Signal:* a draft has assets
attached. *Response:* inspect assets before deciding; when in doubt, publish
rather than delete — a published old release is harmless, a deleted one is gone.
