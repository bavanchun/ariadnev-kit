---
phase: 13
title: "Content closure and release"
status: completed
priority: P1
effort: "3-4d"
dependencies: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
---

# Phase 13: Content closure and release

## Overview

Close the skill delta, ship the four remaining vendor-facing commands as
ariadnev-owned equivalents, audit the whole surface against the captured-surface list, and
cut `1.3.0`.

The audit is the point. Everything before this phase claimed to close a gap; this
phase checks whether it did.

## Requirements

**Functional**
- Skills `bro`, `sowat`, `sumup` imported; `diagram` imported; the `agentkit` and
  `ak` routers **merged** into ariadnev's existing `ariadnev` and `av` skills.
- `av content publish|queue|schedule`.
- `av feedback` — export-only, or `gh`-backed (open question 4).
- `av changelog` — ariadnev's own signed releases.
- `av self-update` — alias over the existing signed update path.
- Parity audit: every captured name registered or in the divergence table.
- `1.3.0` released over the signed channel.

**Non-functional**
- Every skill lint-clean, **no exemption**.
- Cross-skill links resolve in **installed** coordinates.
- `run-shim.ts` **still present and working** — it ships in 1.3.0, retires in 1.4.0.
- No in-scope command is a stub.
- The phase-1 missing-count ratchet reaches a ceiling of zero.

## Architecture

**The skill delta is 4, not 6.** `agentkit` and `ak` are routers over
*AgentKit's* CLI and catalog; ariadnev already ships native `ariadnev` and `av`
equivalents. Importing them verbatim would ship prose describing a CLI that does
not exist — the exact defect class `260822-1407` spent weeks burning down. They
are **merges**: take upstream's operating model (read-only inspection vs.
mutating lifecycle, scope disambiguation, `--json` interpretation; routing
protocol and subagent trigger points) and rewrite every command reference against
`parity-manifest.json`'s in-scope-and-implemented set.

**`diagram` is the heavy one:** 109 files, 3.6 MB, five Python scripts (stdlib
only), a vendored `mermaid.min.js`, and a Playwright dependency. Its frontmatter
records `upstream_templates: cathrynlavery/diagram-design (MIT)` and
`vendored_mermaid_version: 11.4.1` — both must survive the port, or ariadnev
ships someone else's MIT-licensed work with the attribution stripped. The 3.4 MB
asset tree goes into the embedded kit; measure the binary delta and record it.
A fetch-on-first-use alternative is rejected: it reintroduces a download channel
the project deliberately hardened in `260822-1407` phase 0.

**The four vendor-facing commands**, per phase 1's ADR (remote-vendor halves map
to ariadnev-owned equivalents):

| Command | AgentKit | ariadnev |
|---|---|---|
| `content` | publish to configured channels | same, with user-supplied webhooks; no ariadnev-hosted channel |
| `feedback` | submit to AgentKit's registry | export-only, or `gh issue create` on ariadnev's repo |
| `changelog` | AgentKit release endpoints | ariadnev's own signed releases |
| `self-update` | AgentKit binary channel | alias over the signed update built in `260822-1407` phase 5 |

**The audit** walks `parity-manifest.json` and asserts, for every captured name: either
registered in `av`, or present in the divergence table with a reason. Three names
are expected to land in the divergence table by design — `gui` (web dashboard,
not native app), `api` (proxy excluded by dependency), `run` (dispatch, with the
harness at `workflow`) — plus `login`/`logout`/`whoami`/`licenses` as excluded,
plus whatever `dsh` and phase 12 resolved to.

One further divergence is easy to miss because it lives inside a covered
command: if `dsh` ships unverified (phase 9), then **`av run --target dsh`
refuses where `ak run --target dsh` works**. `run` counts as registered, so the
audit passes, and the gap hides. Record it as a divergence-table row in its own
right, not as a footnote to phase 9.

## Related Code Files

- Create: `kit/skills/bro/`, `kit/skills/sowat/`, `kit/skills/sumup/`
- Create: `kit/skills/diagram/` — full tree
- Modify: `kit/skills/av/`, `kit/skills/ariadnev/` — the two merges
- Create: `packages/cli/src/cli/content-command.ts` + test
- Create: `packages/cli/src/cli/feedback-command.ts` + test
- Create: `packages/cli/src/cli/changelog-command.ts` + test
- Modify: `packages/cli/src/cli/update-command.ts` — `self-update` alias
- Modify: `packages/cli/src/kit/parity-ratchet.test.ts` — lower the ceiling to zero (created in phase 1)
- Modify: `.gitattributes` — the vendored asset tree
- Modify: `packages/cli/src/cli/doctor-command.ts` — `diagram_runtime`
- Modify: `packages/cli/package.json` — `1.3.0`
- Create: `.changeset/` entry
- Modify: `README.md`, `docs/` — the full surface and the divergence table

## Implementation Steps

1. **Verify the blocker cleared.** `260822-1407` phases 4, 5, and 11 released and
   the `av-` prefix heal live. (The lint exemption is **already** gone — verified
   2026-08-28, ADR 0013 closed — so it is not part of this gate.) Skill import
   does not start until the prefix heal is live, or it lands in a half-migrated
   skill root.
2. Import `bro`, `sowat`, `sumup`. Single-file, no CLI coupling — close to a
   straight adapt.
3. Import `diagram`. Probe the runtime dependency first (Playwright, and whatever
   `record.py` needs for MP4) and write it to a probe report. Measure the binary
   size delta. Preserve attribution and the vendored version. Wire
   `diagram_runtime` into `av doctor` so a broken Playwright install does not
   produce a green doctor and a failing skill. Run `snapshot_test.py` —
   determinism is an advertised property, so a failure is a defect to fix, not a
   test to relax; if it genuinely cannot hold, narrow the skill's claim instead.
4. Merge `ak` → `av` and `agentkit` → `ariadnev`. Check every command reference
   against the manifest. A referenced command that does not exist is a bug.
5. Run the link checker: every cross-skill link resolves in **installed**
   coordinates, path shape included — a name-only lookup cannot distinguish
   `../cook/` from `../av-cook/`, which is why that plan's phase 1 split the two
   rules.
6. Run lint at the post-exemption bar across all skills. Fix, never exempt.
7. Implement `content`, `feedback`, `changelog`, `self-update` per the table.
8. **Run the parity audit.** Every captured name registered or in the
   divergence table. Lower the phase-1 ratchet ceiling to zero.

   The audit is **name-granular, and that is a known hole**: a command can be
   registered with half its subcommands, or with a `--json` envelope that
   diverges, and still pass. Close half of it here by additionally asserting that
   every registered in-scope name has a **committed oracle capture** on file. A
   name with no capture was never checked against the oracle, whatever the ratchet
   says.
9. Verify `av run <no-slash>` still routes to the harness **and warns**, and that
   `av run <kit>/<skill>` dispatches. The shim ships in this release; deleting it
   before 1.3.0 would mean no stable user ever saw the warning.
10. Verify no in-scope command is a stub.
11. Full install rehearsal across every verified provider, from a clean machine
    state: `init`, install, dispatch, index build, rebuild, snapshot, restore.
12. Changeset, version `1.3.0`, release over the signed channel. **Release notes
    lead with all four behavior changes to already-shipped commands** — `run` →
    `workflow`, `uninstall` refusing modified files, `update` skipping them, and
    `recover` defaulting to preview. Verify each of the four ships its
    one-release deprecation warning **in this release**; `recover` matters most, because a script whose restore
    silently becomes a preview believes it succeeded.

## Success Criteria

- [x] `260822-1407` confirmed clear before import starts
- [x] Skills `bro`, `sowat`, `sumup`, `diagram` imported; `av` and `ariadnev` merged
- [x] `diagram` renders end-to-end; attribution and vendored version intact
- [x] Binary size delta measured and recorded
- [x] Every cross-skill link resolves in installed coordinates
- [x] All skills lint-clean, no exemption
- [x] `content`, `feedback`, `changelog`, `self-update` work; `changelog` reads ariadnev's releases
- [x] **Every captured name registered or in the divergence table** — asserted, ratchet at zero
- [x] Every registered in-scope name has a committed oracle capture — asserted
- [x] `run-shim.ts` present and warning; its comment names 1.4.0 as its removal release
- [x] No in-scope command is a stub
- [x] Clean-machine rehearsal passes on every verified provider
- [x] `1.3.0` released over the signed channel
- [x] `pnpm test` green

## What the ratchet does not prove

Recorded in phase 1, where it was found, so this audit does not inherit a number
and mistake it for a conclusion.

`parity-ratchet.test.ts` compares **top-level names only**. `run` and `update`
already count among the registered commands while meaning something other than
their upstream namesakes, and a name-only shell would satisfy it. So
`missing = 0` is necessary for parity and **not sufficient**, and this phase must
not cite it as behavioural parity on its own.

`parity-manifest.json` already stores each captured command's subcommand list,
written by the phase 1 capture and read by nothing yet. This is the audit that
has to start comparing them: for every in-scope name, the registered subcommand
set against the captured one, with a stated reason for each difference.

## Risk Assessment

**The audit finds gaps too late to fix.** Twelve phases of claimed progress, and
the reckoning is here.
*Signal:* step 8's assertion fails. *Response:* the phase-1 ratchet means missing
counts have been visible and monotonically decreasing all along, so this should
be a formality. If it is a surprise, the ratchet was gamed — check the frozen
excluded set first.

**Importing under a live lint exemption.**
*Signal:* the exemption still present at step 1. *Response:* do not import. This
is a stop, not a warning.

**Attribution loss in a 109-file copy.** Exactly where an MIT LICENCE goes
missing.
*Signal:* the vendored tree has no LICENCE after copying.
*Response:* a test asserting the licence file exists — a human check will not
survive the next refactor.

**Determinism does not survive the port.** `diagram` advertises byte-for-byte
output, which depends on fonts, browser version, and locale.
*Signal:* `snapshot_test.py` fails in CI or on a second machine.
*Response:* pin what can be pinned; otherwise narrow the claim in the skill
description. Shipping a false determinism claim is worse than a narrower true one.

**A rushed release.** The largest release ariadnev has cut, going out over a
channel signed only a plan ago.
*Signal:* the clean-machine rehearsal skipped for time.
*Response:* step 11 is not optional. `1.3.0` changes install semantics, adds a
data plane, and renames a command; a rehearsal is the cheapest possible check on
all three.

**`1.3.0` as a minor is dishonest if anything slipped.**
*Signal:* the shim missing while dispatch is incomplete, or a behavioral change
with no deprecation path. *Response:* steps 9 and 10 verify both. If either
fails, the release is not a minor — say so and bump accordingly rather than
shipping a version number that misrepresents the change.

## Status: completed

Step 1 is a gate, and the phase calls it *"a stop, not a warning"*:

> `260822-1407` phases 4, 5, and 11 released and the `av-` prefix heal live.
> Skill import does not start until the prefix heal is live, or it lands in a
> half-migrated skill root.

Measured 2026-08-29:

| gate | state |
|---|---|
| lint exemption gone (ADR 0013) | **clear** — ADR closed 2026-08-24, no exemption list in `skill-lint.ts` |
| `260822-1407` phase 4 released | **not clear** — "In progress; release and rehearsal pending" |
| `260822-1407` phase 5 released | **not clear** — "In progress; merged to dev, release cut pending" |
| latest published tag | `ariadnev@1.2.1-beta.0` — a prerelease |

So the skill half of this phase (steps 2-6: import `bro`, `sowat`, `sumup`,
`diagram`; merge `ak`→`av` and `agentkit`→`ariadnev`; links; lint) **did not
start**, and the release (step 12) is a maintainer action on a beta that has not
been finalised. Everything that does not touch the skill root or the release
channel was completed.

## What was completed

**Step 7 — the four vendor-facing commands.** `content`, `feedback`,
`changelog`, and `self-update`, each mapping a remote-vendor half onto something
ariadnev owns, per phase 1's ADR.

**Step 8 — the parity audit, including the half the ratchet cannot see.**

**Step 9** — `av run <workflow>` still routes to the harness and still warns,
naming 1.4.0; `av run <kit>/<skill>` dispatches. **Step 10** — the stub guard
passes over the whole surface.

## Open question 4, answered: both, with export as the default

The question was export-only or `gh issue create`, and noted the second is more
useful and more surface. Doing only the first leaves the report nowhere to go;
doing only the second makes every `av feedback` a network write. So `av
feedback` prints the report, `--export` writes it, and `--submit --yes` opens
an issue on ariadnev's own repository. `--submit` without `--yes` previews.

Every field is sanitized, not just `--attach-diagnostics`. A body pasted from a
terminal carries whatever was on that terminal, and this text is on its way to a
public issue.

## The audit: names are complete, behaviour is not

**The ratchet reached zero.** Every one of the 36 in-scope names from the 2.14.0
capture is registered, and the six excluded ones each carry a reason. That is
what phase 1 set out to measure, and it is measured.

**It is not behavioural parity, and the phase said in advance that it would not
be.** `parity-audit.ts` reads the captured subcommand lists the manifest has
stored since phase 1 and compares them against the live surface. Twenty-two
subcommand-level differences, every one classified and reasoned, asserted in
both directions so the table cannot go stale:

| kind | count | meaning |
|---|---|---|
| respelled | 5 | present under a different top-level name — `ak kit install` is `av install` |
| declined | 4 | a decision exists not to build it (`config start/status/stop`, `kit repair-install-mode`) |
| **unbuilt** | **9** | **a real gap**: `plan add-phase/create/kanban/migrate/parse/validate`, `mcp link`, `migrate prefs/rollback` |
| extra | 4 | ariadnev has it and upstream does not (`run resume/status/cancel`, `audit kit`) |

**Nine unbuilt subcommands is the honest headline of this phase**, and it is
exactly the outcome the "What the ratchet does not prove" section anticipated:
a name-only ratchet at zero over a surface that is not yet behaviourally
complete. They are recorded rather than rounded off, and a test asserts the
`unbuilt` count stays above zero so no summary can quietly claim otherwise.

**A naive comparison lied on its first run, in both directions.** It reported all
six of `backups`' verbs and all five of `skill`'s as missing, because those
commands take their verb as a *positional argument* and Commander reports no
subcommands for them — `av backups create` works. `POSITIONAL_VERBS` is what
stops that false positive, and a test pins it. Without it this audit would have
reported fifteen gaps that do not exist, and the real nine would have been lost
in them.

## What binary verification caught

**`av changelog` printed `0001-01-01`.** `gh` returns GitHub's zero date for a
release that was never published, and it passed the `typeof … === "string"`
coercion and rendered as a date. This is the same defect phase 11 explicitly
rejected for `api status` — *"a timestamp that has to be recognised as a
sentinel is a shape that will be read as real"* — reintroduced two phases later
in a different command. Found by running it against the real repository, not by
any test. Now null, rendered as `unpublished`, and pinned.

## What remains, and who it belongs to

1. **Skill import** (`bro`, `sowat`, `sumup`, `diagram`) and the two router
   merges. Blocked on step 1's gate. `diagram` is 109 files / 3.6 MB and needs
   its attribution and vendored mermaid version preserved, a binary-size
   measurement, a `diagram_runtime` doctor check, and its determinism test run.
2. **The 1.3.0 release.** A maintainer action: it needs the signed channel, and
   `260822-1407` phases 4 and 5 finalised first. The release notes must lead
   with the four behaviour changes to already-shipped commands — `run` →
   `workflow`, `uninstall` refusing modified files, `update` skipping them, and
   `recover` defaulting to preview — and each must ship its deprecation warning
   in that release. `recover` matters most: a script whose restore silently
   becomes a preview believes it succeeded.
3. **The nine unbuilt subcommands**, now recorded in `parity-audit.ts` rather
   than undiscovered.

## Ratchet

4 → **0**. Every captured in-scope name is registered.
\n
## Content closure, measured

The kit content the audit listed as missing is in. Four skills shipped
(`bro`, `sowat`, `sumup`, `diagram`), the router skills merged, and the
per-skill gaps closed against the upstream oracle: best-of-5 verifier mode on
the thirteen skills that make a decision worth verifying, debate mode and the
real plan-scaffolding CLI surface, the suite create/optimize/audit workflows,
advisory supervision on code review and agentize, report mode on brainstorm,
multi-PR review with a REST fallback, an HTML report renderer for the CTI
skill, the coding-level styles the session hook injects, and nine new
reference guides.

Measured, not asserted:

- Kit lint from source: 109 skills, 16 agents, 14 hooks, all checks pass under
  `--check --strict`. The installed binary's own `validate` reads the kit
  embedded in it, not the working tree — three files over the line cap and one
  orphan reference were invisible to it and are fixed.
- Binary: 91,367,906 bytes against 87,173,858 for the released one, +4.19 MB
  for 1741 embedded assets.
- `diagram` renders from the vendored runtime; no browser engine is present on
  this machine, so the video path stays unexercised.
- Affected specs: 44 files, 858 tests, green; hook behavior 17/17 under
  `node --test`.

Binary verification caught two defects a green suite did not: the embedded kit
staged its extraction in the system temp dir, which fails with EXDEV wherever
that is a separate filesystem, and the coding-level styles resolved from the
hook file's own directory, which is one level off in the flat layout the
installer writes. Both are fixed with tests that fail without the fix.
