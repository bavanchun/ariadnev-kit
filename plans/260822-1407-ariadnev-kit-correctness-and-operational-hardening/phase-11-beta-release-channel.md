---
phase: 11
title: "Beta release channel"
status: in-progress
priority: P1
effort: "2-4d"
dependencies: [5]
---

# Phase 11: Beta release channel

# Read this before scheduling phase 4

**Phase 4 must not ship to stable without this phase.** Phase 4 calls itself "the
point of no return": it renames skill directories on live installs. The plan was
written assuming the only install was the maintainer's. That assumption is false —
confirmed 2026-08-22: **other people have installed ariadnev via the curl
installer.** A directory rename that heals live installs, shipped straight to
stable, has no rehearsal and no way back for those users.

So the execution order changes:

```
0 ✓ → 1, 2, 5 in parallel → release(5) → 11 → 3 → 4 (beta first, then stable) → 6 → 7 → 8 → 9
```

## Overview

Publish pre-stable builds that a person can actually install, without those builds
ever becoming what the bare installer serves.

Decided in a brainstorm on 2026-08-22. The maintainer chose a real installable
channel over the cheaper option of documenting the existing draft-hold gate,
because there are real users and phase 4 needs a rehearsal with them.

## What already exists, and what it is not

The pipeline is more developed than "no release process" suggests:

```
push main → Version PR (changesets) → candidate-build → candidate-publish
                                       · previous-stable lock  · creates a HELD DRAFT
                                       · provenance A
                                       · smoke on 5 binaries
            finalize-release (workflow_dispatch, manual) → public
```

There is already a human gate between built and public. What it is **not** is a
channel: a held draft is installable by nobody. That gap is this phase.

## The four blockers

Each one was verified, not assumed.

**1. The version parser rejects prereleases by design.**

```ts
// packages/cli/src/cli/update-version.ts:1-2
// Exact major.minor.patch only — no ranges, no "latest", no "v" prefix, no
// prerelease/build tags.
```

`av update --to 2.0.0-beta.1` is refused today. This regex has to widen before
any of the rest matters, and widening it is a public-contract change to the
update path — the same path phase 5 is putting a signature on.

**2. The edge lives in another repository.** There is no `workers/` directory
here; the Worker serving `/install`, `/version`, `/version?version=`, and
`/download/<asset>?version=` is in `ariadnev-web`. Channel routing is therefore a
**cross-repo change**, and the two repos ship independently. Sequence it so the
edge understands a channel before the CLI starts asking for one.

**3. Phase 5's signing design assumes one channel.** It states signing happens
"at the manual finalize step, not on every RC build". A beta channel that is
published but not finalized would be *unsigned* under that design — which is
exactly the hole phase 0 just closed, reopened for beta users. **Signing must
cover beta too, or beta must be explicitly refused by a signature-verifying
client.** Pick one deliberately; do not let it fall out by accident.

**4. Changesets is on `main` with no pre mode.** `.changeset/config.json` has
`baseBranch: main` and no pre state. Changesets supports `pre enter beta` /
`pre exit`, which is the intended mechanism — but entering pre mode changes what
the Version PR does for every subsequent merge until exit. That is a mode with a
sharp edge for a solo maintainer who may forget to exit.

## Requirements

**Functional**
- A published `ariadnev@X.Y.Z-beta.N` that an installer or `av update` can fetch
  on explicit request.
- The bare `curl … | bash` and bare `av update` paths never select a beta. Proven
  by test, not by inspection.
- A beta is never marked "latest" on GitHub.
- Whatever authenticates a stable binary authenticates a beta binary, or the
  client refuses betas outright with a message saying so.

**Non-functional**
- Opting into beta must be explicit and legible — the same reasoning as phase 0's
  `ARIADNEV_ALLOW_UNVERIFIED_BASE`: routine-looking overrides get set by accident.
- Exiting pre mode must be hard to forget. A stable release accidentally cut as
  `-beta.7` is a worse failure than not having the channel.

## Open design questions

These are genuinely open and should be settled at the start of this phase, not
guessed at now:

1. **Channel selector shape.** `ARIADNEV_CHANNEL=beta` env var, an argv flag, or
   pinning an exact prerelease version via the existing `?version=` selector. The
   third needs almost no new edge work and no new concept — worth pricing before
   building a channel abstraction.
2. **Does beta get its own signing key**, or share stable's? Sharing is simpler;
   separate keys mean a leaked beta key cannot sign a stable release.
3. **Do beta users auto-update to stable** when a stable release overtakes their
   version? Say it explicitly either way.

## Related Code Files

- Modify: `packages/cli/src/cli/update-version.ts` (prerelease acceptance) + tests
- Modify: `packages/cli/src/cli/update-command.ts` (channel selection)
- Modify: `install.sh`, `install.ps1` (channel selector)
- Modify: `.changeset/config.json` / pre-mode operating procedure
- Modify: `.github/workflows/release*.yml` (tag shape, latest flag, signing reach)
- Modify (other repo): `ariadnev-web` edge Worker route handling
- Modify: `docs/release-and-publish-guide.md`

## Implementation Steps

1. Price open question 1 first. If pinning an exact prerelease through the
   existing `?version=` selector satisfies the requirement, most of the rest of
   this phase disappears. Do not build a channel abstraction before proving the
   cheap path is insufficient.
2. Widen the version parser, with tests covering rejection of everything that is
   still invalid.
3. Settle signing reach with phase 5's design in hand, not after it ships.
4. Edge route in `ariadnev-web`, deployed before the CLI depends on it.
5. Installer + `av update` selector.
6. Pre-mode procedure, with a CI guard that fails a stable release cut while pre
   mode is active.
7. Document the whole flow in the release guide.

## Step 1's answer: the cheap path wins

The phase said to price open question 1 before building anything. Priced.

**Pinning an exact prerelease through the existing `?version=` selector covers
the requirement.** There is no `ARIADNEV_CHANNEL`, no channel routing, no
installer selector and no new concept — `av update --to 2.0.0-beta.1` is the
opt-in, and it reuses machinery that already exists on both sides.

The three open questions fall out of that:

1. **Selector shape** — exact version. A channel abstraction would have added a
   concept to two repositories to express something one flag already says.
2. **Beta signing key** — shared with stable, and it comes for free. Signing is
   local and finalization verifies whatever it is handed, so a beta is signed by
   the same key through the same step. No unsigned-but-accepted path exists,
   which was the phase's blocker 3.
3. **Do beta users auto-update to stable** — yes, and the honest reason is that
   the alternative was a bug. `isNewerVersion` read `"0-beta"` as `0` via
   `parseInt`, so `2.0.0-beta.1` and `2.0.0` compared equal and a beta user was
   told "up to date" forever. Fixing the comparison makes the right thing happen.

**But the cheap path is not free: the edge rejected it.** Probed against
production before deciding:

```
/version?version=1.1.0        → 200  1.1.0
/version?version=2.0.0-beta.1 → 400  bad request: prerelease-or-build-unsupported
```

So blocker 2 is real and unavoidable — this is a cross-repo change either way.
What the cheap path buys is its size: "accept `-beta.N` in the version selector"
instead of "teach the edge about channels".
`bavanchun/ariadnev-web` PR #7 carries it, **not deployed**.

## What is left, and who can do it

- **Deploy `ariadnev-web` #7.** The CLI half expects a live edge.
- **Publish an actual beta**, which needs a release to be cut — the same
  maintainer step phase 5 is waiting on.
- **Rehearse phase 4 on it.** That is the whole reason this phase exists and it
  cannot happen until the two above do.

## Success Criteria

- [x] A `-beta` version is published and installable by explicit opt-in.
      `ariadnev@1.3.0-beta.1` is a prerelease carrying 10 assets including
      `checksums.txt.sig`. The edge serves it only when asked:
      `/download/…?version=1.3.0-beta.1` answers 200 while `/version` still
      answers `1.1.0`, and `av update --check --to 1.3.0-beta.1` resolves the
      pin while a bare `av update --check` reports "up to date".
- [x] Bare install and bare `av update` select the stable release with a beta
      published — asserted by a test that fails if the selection logic changes.
      Belt and braces: finalization never marks a beta latest (asserted as a
      negative), and `runUpdate` refuses a prerelease on the bare path even if
      the edge reports one.
- [x] A signature-verifying client accepts a beta: signing is local and
      finalization verifies whatever it is handed, so a beta goes through the
      same key and the same step. No unsigned-but-accepted path exists.
- [x] Cutting a stable release while changesets pre mode is active fails CI —
      and so does the mirror image, a beta-flagged channel with pre mode off.
- [x] Phase 4 has been rehearsed on the beta channel before its stable release.
      Rehearsed across `1.3.0-beta.1` and `1.3.0-beta.2`, 2026-08-30. Six of
      phase 4's seven criteria are now met; the seventh, `ariadnev.com/version`
      serving the new version, is the stable cut's by definition — the edge must
      not move to a prerelease. The rehearsal found two defects no test had:
      an orphan set with no receipt is invisible to `doctor`, and two providers
      resolving to one root claimed the same 1485 paths, so removing either
      broke the other. The second is fixed and shipped in `beta.2`.

## Risk Assessment

**Reopening phase 0's hole for beta users.** An unsigned beta channel is exactly
the vulnerability just closed, scoped to the users most willing to run unreviewed
code. *Signal:* a beta artifact exists that no key covers. *Response:* blocker —
the client refuses betas until signing covers them.

**Stuck in pre mode.** Changesets pre mode persists until explicitly exited; a
solo maintainer returning after weeks will not remember. *Signal:* a release cut
with an unexpected `-beta.N`. *Response:* the CI guard in step 6 is the mitigation
and must land with the mode, not after it.

**Building a channel that nobody uses.** "A few people have installed" is not the
same as "people will test betas." *Signal:* phase 4's beta ships and no external
install picks it up. *Response:* that is still a success — the rehearsal value for
phase 4 is the point, and it accrues even with an audience of one.
