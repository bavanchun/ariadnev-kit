---
title: "ak-2-14-parity"
description: "Cleanroom behavioral parity with AgentKit 2.14.0 for everything except auth, remote telemetry, and licensing: an operational data plane, ~21 new commands, a nine-provider matrix, and the ak-only skills — shipped as 1.3.0."
status: in-progress
priority: P1
effort: "45-76d"
tags: [cli, parity, adapters, storage, kit]
created: 2026-08-28
blockedBy: [260822-1407-ariadnev-kit-correctness-and-operational-hardening]
---

# ak-2-14-parity

## Overview

The maintainer's instruction is direct: ariadnev must be **"tối thiểu y chang"**
AgentKit at 2.14.0 — at minimum, identical — excluding auth, remote telemetry,
and licensing. AgentKit 2.14.0 exposes **42 top-level commands**; ariadnev
registers **24**, and one of the 24 (`run`) means something entirely different
from AgentKit's command of that name.

**This is not a port.** `~/.local/bin/ak` is a closed Mach-O arm64 binary; there
is no AgentKit source on this machine or in any checkout. What this plan
describes is **cleanroom behavioral reimplementation against a live oracle** —
AgentKit is installed, its `--help` is authoritative, its `--json` envelopes are
observable, and `~/.agentkit/` can be inspected. Every phase therefore opens with
an *oracle observation* step: capture the real command's help text and a sample
`--json` envelope into the phase file as the behavioral contract, **then** write
the failing test. Guessing at behavior and calling the result parity is the
failure mode this plan is shaped to avoid.

Parity is a claim that has to be *true*. A command that exists and returns "not
implemented" is worse than an absent one, because it converts a known gap into a
support ticket. Every phase ships working behavior or does not ship.

## Contract

**Outcome** — `av --help` lists every AgentKit 2.14.0 command outside the
excluded domains, each doing what AgentKit's command of that name does under
local-first semantics; the provider matrix covers nine providers with per-cell
evidence at the standard `spec-verified.ts` already enforces; the ak-only skills
are installed and lint-clean. Released as `1.3.0`.

**Constraints**
- CI green on every merge; no phase may leave `pnpm test` red.
- Every phase independently revertable.
- `src/adapt/` stays **pure** — no fs, no network, ≥90% coverage (CLAUDE.md).
  Adapt-engine path constants stay in `src/adapt/paths.ts`; **runtime state paths
  do not go there** and get their own constants module. Precedent already exists:
  `register-harness-commands.ts:75` uses `~/.ariadnev/runtime/`.
- **No unverified provider cell.** `spec-verified.ts`'s evidence ladder
  (`observed` / `convention` / `none`) is not relaxed to make a matrix look full.
- **Derived state is never authoritative.** SQLite is a rebuildable cache; files
  are the truth. Enforced by a standing CI invariant, not by convention.
- All writes atomic; back up prior target. Ownership from the receipt, never from
  a directory listing — carried from `260822-1407`, whose red team found a
  migration that would have renamed 30 third-party directories in a shared root.
- Version stays on `1.x` → `1.3.0`. **This is only honest if every behavior
  change to an already-shipped command is announced.** A silent semantic change
  in a minor release is a lie. Four commands are affected, not one:

  | Command | Change | Where | Mitigation |
  |---|---|---|---|
  | `run` | becomes skill dispatch | phase 2 | one-release fallthrough shim + deprecation warning |
  | `uninstall` | refuses to delete user-modified files | phase 4 | warn on the changed path for one release |
  | `update` | skips user-modified files, **and widens from binary-only to binary-then-kits** | phase 4 | warn on the changed path for one release; `self-update` keeps the binary-only path under its own name |
  | `recover` | preview becomes the default | phase 8 | warn when an invocation that used to write now previews |

  `recover` is the sharpest of the three additions: a scripted `av recover <id>`
  silently becoming a no-op preview is a worse surprise than the `run` rename,
  because the user believes a restore happened. All four go in the 1.3.0 release
  notes, not just `run`.

**Non-goals**
- `login`, `logout`, `whoami`, `licenses`.
- Remote telemetry egress. The local analytics index is in scope; shipping data
  anywhere is not.
- `api`'s LLM proxy — excluded by dependency, see below.
- Bit-level output matching. Parity is behavioral, not textual.
- `ariadnev-web` feature work. Phase 11 *serves* it; it does not rebuild it.

**Acceptance criteria**
1. Every one of the 42 names in the captured surface is either registered in `av` or
   listed in the ADR divergence table with a reason.
2. No in-scope command is a stub — asserted by test.
3. `av contract --json` reports 9 providers × 9 artifacts, every `verified: true`
   cell carrying evidence with a provider version and a date.
4. Delete the derived index → rebuild → equivalent output. Standing CI test.
5. The `run` fallthrough shim **ships in 1.3.0 and retires in 1.4.0** — see
   "The `run` collision". Removing it before 1.3.0 would mean no stable user ever
   saw the deprecation warning this plan calls its semver honesty.
6. `1.3.0` released over the signed channel built in `260822-1407` phase 5.

## The exclusion set is not closed under dependency

Stated plainly because it changes what "y chang" can mean. Four AgentKit
commands *depend on* the excluded auth/licensing/remote plumbing, so a literal
"everything except those three" is unimplementable as written:

| Command | What it depends on | Resolution |
|---|---|---|
| `api`'s LLM proxy | `login` credentials, licensed routing | Ship the local API half (health/status/version/dashboard). Proxy documented as excluded-by-dependency |
| `feedback send` | AgentKit's feedback registry | Export-only, or open an issue on ariadnev's own repo via `gh` |
| `gui` | AgentKit's hosted desktop-app download | Start the local API and open `ariadnev-web` |
| `changelog` | AgentKit's release endpoints | Read ariadnev's own signed releases |

Phase 1's ADR resolves this once: **parity = every AgentKit command exists with
local-first semantics; remote-vendor halves map to ariadnev-owned equivalents.**
Every phase inherits that definition instead of re-deciding it.

## Why this plan is blocked on 260822-1407

**Two** hard couplings, not a scheduling preference:

1. **Its phase 4 renames skill directories on live installs** and calls itself
   "the point of no return". Adding skills and 21 commands into a half-migrated
   skill root multiplies an already irreversible blast radius.
2. **Its phase 5 ships the signed update channel.** `1.3.0` is a large release
   and should not be the one that goes out unauthenticated. The installer RCE
   closed in that plan's phase 0 was live for real users.

A third coupling — the lint exemption — **is already satisfied and is not a
blocker.** Verified 2026-08-28: `kit/skills-lint-exempt.json` no longer exists,
`isPorted()` has no non-test occurrences, and ADR
`0013-lint-exemption-is-a-shrinking-list.md` is closed. That 8-15 day burn-down
is spent. Recorded here because leaving it in the blocker list would inflate the
apparent cost of waiting, and would make phase 13 gate on a condition that is
already true.

`260822-1407`'s remaining phases (4, 5, 11) are pending maintainer *release cuts*
rather than engineering. It records this plan in `blocks:`, and its
commercial-surface non-goals are marked superseded — binding there, owned here.

## The stopping line, and the branch rule

**Phases 1-9 and 11 may proceed under the open blocker. Phase 10 may not.**
Phase 10's own requirements include `av skill install|remove|repair|upgrade`,
`av agents install|remove`, `av commands install|remove`, and
`av skills install|remove` — writes to the live install surface, which is
precisely what blocker phase 4 is renaming and calls "the point of no return".
"Install semantics" is not a judgement call there; it is the verb list. Phase 12
is transitively blocked (depends on 10); phase 13 is blocked twice over (skill
import needs blocker phase 4; the 1.3.0 cut needs blocker phase 5).

**Re-verify at the gate, do not assume:** before phase 10 starts, confirm blocker
phase 4 is `completed` and the prefix rollout shipped in a *stable* release, not
merely a beta. Before phase 13, confirm blocker phases 4 and 5 are both
`completed`. The blocker is 1-2d of release work against this plan's several
weeks, so these checks will most likely be formalities — which is exactly why
they must be written down rather than remembered.

**The branch rule.** `release.yml` triggers only on `push: branches: [main]`
(verified), and it invokes `release-candidate-build.yml` through `workflow_call`,
whose YAML resolves at the *caller's* ref. So the live release pipeline is
`main` HEAD at trigger time, and `concurrency.cancel-in-progress: false` means
runs queue rather than cancel.

Therefore: **every PR in this plan targets `dev`. `main` is maintainer-only until
blocker phase 11 closes.** A merge to `main` mid-cut retriggers `release.yml` in
changesets pre mode, churns the open Version Packages (beta) PR, and swaps
workflow YAML under a queued candidate build — while the maintainer is debugging
that pipeline with direct pushes (`6de25d2`, `725e643` carry no PR number, unlike
their neighbours). No test enforces this rule, which is why it is stated here.

### `dev` must be resynced before phase 1 opens a PR

Measured 2026-08-28: `origin/dev` is **12 commits behind `origin/main` and 0
ahead**. All twelve are beta-cut plumbing that has not been back-merged. Two of
them land in files this plan must edit:

| File | dev vs main | Who needs it |
|---|---|---|
| `packages/cli/scripts/smoke-binary.mjs` | 18 lines behind (absolute-path fix `c9f5c8e`, cross-target sibling lookup `61a358f`) | phase 1 Gate A probe, phase 2 rename |
| `.github/workflows/release.yml` | 5 lines behind | phase 1's `release.yml:40` Node pin |

Branching off `dev` today therefore edits stale copies of exactly the two files
at issue, and guarantees a conflict in `smoke-binary.mjs` on the eventual
back-merge — in a script that gates every release, whose failures appear only
inside a candidate build.

**So the true start condition is not "the blocker closes" but "`main` is
back-merged into `dev`".** That happens naturally once the beta finalizes.
Starting before it trades a few days of waiting for a merge conflict in the
release gate, which is a bad trade at any schedule pressure.

## What was measured, not assumed

Observed on this machine, 2026-08-28, against `ak 2.14.0`.

**Command surface.** ariadnev registers 24 top-level commands: `adapters
add-skill audit backups config contract doctor eval install journal kit list mcp
migrate plan query recover run skill telemetry uninstall unlock update validate`.
AgentKit registers 42 — confirmed by the phase 1 capture, which parsed exactly 42
off the live `--help`.

Read off the running program rather than off `register-*.ts`: an earlier
hand-read of the sources listed `prefs`, which is `av config prefs`, and missed
`add-skill`. The count was right and two of the names were not, which is the
argument for `parity-manifest.json` being generated rather than written.

**AgentKit's local store is far lighter than its command list suggests.** This
finding decides the storage design:

- `ak sessions list` reads **Claude Code's own JSONL files**. No store — a reader
  over files another tool owns.
- `~/.agentkit/projects.json` — plain JSON plus a `.lock`.
- `~/.agentkit/backups/` — directories with manifests. Files.
- Two SQLite files in normal operation — `plans/plans.db` and
  `analytics/analytics.db` (7 MB) — plus transient recovery copies under
  `plans/plans-recovery/`. **All derived and rebuildable.** (Phase 8's snapshot
  logic must not assume the enumeration is exactly two.) AgentKit's own doctrine, quoted from
  `ak analytics --help`: *"Session and activity sources remain authoritative; no
  remote analytics are sent."* Its lifecycle verbs are
  `enable/disable/rebuild/delete` — the vocabulary of a cache.

**The substrate risk, burnt down early.** Probed directly:

| Probe | Result |
|---|---|
| `bun:sqlite` + FTS5 in Bun 1.3.14 | **works**, including inside a `bun build --compile` binary |
| `node:sqlite` under Bun 1.3.14 | **absent** — `No such built-in module`; a static import fails `--compile` at *build* time |
| `node:sqlite` under Node 24.15.0 | works, FTS5 confirmed |
| CI `node-version` | **pinned to `20`** in five places: `ci.yml:174,262` (jobs `unit`, `ci`), `release.yml:40` (`version-pr`), `release-candidate-build.yml:55,178` (`build`, `smoke-cross-platform`). Re-grepped 2026-08-28: exactly five, no sixth |

Consequence: **one storage adapter, two drivers** — `bun:sqlite` in the shipped
binary, `node:sqlite` under vitest/dev, dynamic imports only, both marked
external in the tsup and bun-build configs, with a conformance suite run under
both runtimes. Plus a CI Node bump 20 → 24, separable as its own small PR. Do
**not** use `better-sqlite3` (a native addon fights `--compile`), and do not move
the test suite to Bun to dodge the dual driver — vitest-under-Node is the
established harness.

**Providers.** Union of ariadnev's 6 and AgentKit's 6 = 9. Probed:

| Provider | Evidence available today |
|---|---|
| `grok` | `~/.grok/{agents,hooks,rules,skills}` populated, Claude-shaped layout |
| `omp` | `~/.omp/agent/{agents,skills,rules,extensions}` populated; `omp/18.0.4` on PATH |
| `dsh` | **no binary, no `~/.dsh`, absent even from `~/.agentkit/adapters/`** |

`dsh` ships as `none` → installer skips, README says skipped. See open question 1.

**Skills.** AgentKit-only: `agentkit`, `ak`, `bro`, `diagram`, `sowat`, `sumup`.
But `agentkit` and `ak` are routers over *AgentKit's* CLI and catalog, and
ariadnev already has native `ariadnev` and `av` equivalents — importing them
verbatim ships prose describing a CLI that does not exist, the exact defect class
`260822-1407` spent weeks burning down. **The real skill delta is 4**, and the
two routers are merges, not imports. `ak-diagram` is 109 files / 3.6 MB with a
Playwright dependency — a phase's worth of work on its own.

**Scale.** 204 source files, ~27k LOC, 143 test files. `@clack/prompts ^0.8.2`
already a dependency, so `av setup`'s wizard needs no new one.

## Two name collisions

`av run` today is the workflow harness (`run`/`resume`/`status`/`cancel`,
`register-harness-commands.ts`). `ak run <kit>/<skill> --target …` dispatches a
single skill through an adapter. Same name, unrelated semantics.

**Resolution: `run` goes to skill dispatch; the harness becomes `av workflow`.**
The harness is ariadnev's own innovation and reads better under the new name
(`av workflow status <run-id>`); `ak run <kit>/<skill>` is what "y chang" means
and what every piece of ported skill prose will reference.

Semver honesty comes from a one-release shim: `av run <arg>` with **no slash** in
the positional falls through to the legacy workflow path with a deprecation
warning. AgentKit's grammar requires `<kit>/<skill>`, so the discriminator is
unambiguous.

**The shim ships in 1.3.0 and retires in 1.4.0.** It cannot retire earlier: the
version a 1.2.x user actually upgrades to is the one that has to carry the
warning, or the deprecation path exists only on `dev`. Keeping the fallthrough
through 1.3.0 costs nothing — dispatch requires a slash, so the no-slash
discriminator stays unambiguous indefinitely — and it puts `run` on the same
one-release footing as `uninstall`, `update`, and `recover`.

### `update` and `self-update` — found by the phase 1 capture

The second collision, and it was not in this plan until the oracle capture went
looking. `av update` today is a **binary-only signed self-update**, which is
upstream's `self-update`. Upstream's `update` is the wider refresh: the binary
step first, then global/user kits, then project kits.

So the pair does not map across by name:

| Upstream | What it does | ariadnev today |
|---|---|---|
| `self-update` | signed binary update, nothing else | **this is what `av update` is** |
| `update` | binary step, then kit content, wizard on a TTY | unregistered |

Resolution, on the same footing as `run`: register `self-update` as the
binary-only path, and widen `update` into the orchestrated refresh. A scripted
`av update` keeps working — the binary step is still the first thing the wider
command does — but it now does more afterwards, so it belongs in the semver
table above rather than arriving unannounced. Both entries carry it in
`parity-manifest.json`, so no later phase re-decides it.

## Where "y chang agentkit" is a trap

Three places where copying the surface would ship something worse. Each is a
recorded divergence in phase 1's ADR — parity of function, not of chrome.

**1. `gui`.** AgentKit's is a native desktop app it builds and hosts. Cloning it
means a second product and a webview-native-dependency swamp inside a Bun binary,
against a download endpoint ariadnev does not operate. Instead: `av gui` starts
the local API and opens the browser at **`ariadnev-web`** — a dashboard that
already exists and just completed a seven-phase UI plan.

**2. `api`'s LLM proxy.** It exists to serve AgentKit's licensed routing and
depends on `login` credentials that are explicitly out of scope. Porting it ships
a credential-handling daemon with no possible client. Local API half only.

**3. The `agentkit` and `ak` skills, and the vendor-remote verbs.** Covered
above: merges, not imports. Same pattern for `feedback send` (remote telemetry in
a trench coat → export-only) and `changelog` (must read *ariadnev's* signed
releases, not AgentKit's endpoints).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | An operational data plane whose derived half is provably disposable | P1 |
| 2 | Every AgentKit 2.14.0 name registered or in the divergence table | P1 |
| 3 | Nine-provider matrix, every cell carrying real evidence | P1 |
| 4 | Skill delta closed; all skills lint-clean with no exemption | P1 |
| 5 | Semver honesty — the `run` shim ships and then retires | P2 |
| 6 | `1.3.0` released over the signed channel | P2 |

## Phases

| # | Phase | Depends on | Size | Status |
|---|-------|------------|------|--------|
| 1 | [Substrate spike and ADRs](./phase-01-substrate-spike-and-adrs.md) | — | **M-L** | **Completed** |
| 2 | [`workflow` rename and `run` shim](./phase-02-workflow-rename-and-shim.md) | 1 | S | Completed |
| 3 | [Activity event log](./phase-03-activity-event-log.md) | 1 | M | Completed |
| 4 | [projects, init, new, setup](./phase-04-projects-init-new-setup.md) | 1, 3 | M | Completed |
| 5 | [sessions reader](./phase-05-sessions-reader.md) | 4 | M | Completed |
| 6 | [analytics and data](./phase-06-analytics-and-data.md) | 3, 5 | **L** | Pending |
| 7 | [content-search shards](./phase-07-content-search-shards.md) | 6 | M | Pending |
| 8 | [backups, recover, diagnostics, versions](./phase-08-backups-recover-diagnostics-versions.md) | 6 | M | Pending |
| 9 | [Provider union](./phase-09-provider-union.md) | 1 | M-L | Pending |
| 10 | [Skill dispatch and catalog](./phase-10-skill-dispatch-and-catalog.md) | 2, 9 | **L** | Pending |
| 11 | [api, config, gui](./phase-11-api-config-gui.md) | 6, 8 | **L** | Pending |
| 12 | [watch and orchestrate](./phase-12-watch-and-orchestrate.md) | 10, 11 | **L** | Pending |
| 13 | [Content closure and release](./phase-13-content-closure-and-release.md) | all | M | Pending |

**Execution order: 1 → 2, 3 → 4 → 5 → 6 → (7, 8 in parallel) → 11 → 12 → 13.**
**Phase 9 depends only on 1 — fit it anywhere after 1; 10 needs 2 and 9.**

Phase 1 alone and first: it proves the substrate (dual-driver SQLite in a
compiled binary on the CI matrix) and writes the ADRs every later phase inherits.
Roughly ten of the new commands sit on that substrate; discovering at phase 11
that it cannot be built would invalidate half the plan.

Phase 1 splits internally into Gate A (bump all five Node pins plus both
`engines.node` fields, add a SQLite/FTS5/WAL probe to the compiled-binary smoke,
green on every executed target) and Gate B (the adapter, the manifest and
ratchet, the ADRs). **Phase 2 and everything after wait on Gate A.** The
predictable failure is calling the gate green on macOS with Linux pending, which
skips exactly the risk the table below ranks first.

Gate A extends the cross-target harness that already exists
(`release-candidate-build.yml`'s `smoke-cross-platform`, executing on Linux,
macOS, and Windows) rather than building one. Details in the phase file.

Phase 2 is early and trivially revertable: it frees the `run` name *before* any
ported prose or dispatch work references it.

Phase 3 is the first authoritative source and the plane's proof-of-life —
instrument the existing install/update/workflow paths to emit events, so the log
has a real producer and a real consumer before anything depends on it.

Phase 6 is the heaviest single phase: the dual-driver adapter's first real load,
and where the rebuild-equivalence invariant lives.

Phases 11 and 12 are last because they are daemons — long-running processes with
the widest failure surface, and in phase 12's case a prompt-injection surface.

## Risks

| Risk | Signal it broke | Pre-decided response |
|---|---|---|
| `bun:sqlite` behaves differently on Linux/Windows compiled targets than on macOS (Bun bundles its own SQLite off-macOS) | Phase 1's compiled-binary smoke fails on a non-macOS CI target | That smoke is phase 1's exit gate. Fallback for content-search is plain-scan over shards; the distribution model is never compromised for query speed |
| The derived index silently becomes authoritative | The rebuild-equivalence test fails for one command | The test is written in phase 1 over an empty set and gains a case per command, so it can never be retrofitted around what was already built |
| `dsh` is unverifiable, so "9 providers" is really "8 + 1 skipped" | Phase 9's install attempt finds no binary and no home | Ship 8 verified, 1 skipped, stated in README and `av contract`. Never guess a path. Escalate as a scope question — `spec-verified.ts` treats skip-and-log as correct, not as failure |
| `260822-1407` slips; work starts against a half-migrated skill root | Its phase 4 still in progress when phase **10** wants to write to the install surface | Phases 1-9 and 11 can proceed. **Phase 10 is the stopping line, not 13** — see "The stopping line" below |
| A silent `run` semantic change ships in a minor release | `av run <legacy-arg>` behaves differently with no warning | Phase 2's shim, and a test asserting the deprecation warning fires. This is what makes 1.3.0 honest rather than merely convenient |
| `watch` auto-responds to public GitHub issues — a prompt-injection surface | — | Default off, explicit repo allowlist, dry-run first. Phase 12 is last for this reason |
| Parallel agents exhaust RAM — already happened once here (4 agents × full vitest rebooted a 16 GB Mac) | Memory pressure during a parallel phase | Cap: **one** test-running agent, **two** agents total, `--maxWorkers=2`, reconcile orphans between phases |
| Behavior is guessed rather than observed, and "parity" is asserted from a help string | A test encodes an assumption no oracle capture supports | Every phase opens with the oracle-observation step; the captured help and `--json` envelope live in the phase file as the contract |

## Success Criteria

- [x] Phase 1's compiled-binary SQLite smoke green on every executed CI target — `linux-x64`, `darwin-arm64`, `windows-x64`
- [ ] All 42 AgentKit names registered or in the divergence table
- [ ] No in-scope command is a stub — asserted by test
- [ ] Rebuild-equivalence invariant standing and green
- [ ] `av contract --json` shows 9 providers with per-cell evidence; `dsh`'s real status stated
- [ ] The `run` fallthrough shim ships in 1.3.0, warns, and names 1.4.0 as its removal release
- [ ] All skills lint-clean with no exemption
- [ ] `pnpm test` green on `dev` at every phase merge — `main` is maintainer-only under the branch rule
- [ ] `1.3.0` released over the signed channel

## Open questions

1. **`dsh`** — not installed, no home directory, absent from `~/.agentkit/adapters/`.
   Installable here, or does it ship as a documented skipped provider?
2. **`ariadnev-web` as the `gui` target** — it exists, but its data contract to
   the new local API is unbuilt. Acceptable that `av gui` degrades to the API
   status page if that binding cannot be made in phase 11?
3. **`ak orchestrate` is Darwin-only.** Match the restriction, or ship
   cross-platform? Matching means CI cannot exercise it on Linux runners.
4. **`av feedback`** — export-only, or open an issue on ariadnev's own repo via
   `gh`? The second is more useful and more surface.
5. **Marketing kit.** AgentKit's release stream carries `kit-engineer` **and**
   `kit-marketing`; ariadnev ports only the engineer surface. Engineer-only
   parity, or both?
6. **CI Node bump 20 → 24** — separable PR before phase 1, or inside it?
   *Partly resolved 2026-08-28:* one PR, all five pins plus both `engines.node`
   fields, targeting `dev`. The open half is purely timing — whether it opens
   before or after the maintainer finalizes the beta.
7. **Should the compiled-binary SQLite smoke also run per-PR in `ci.yml`?**
   *Decided 2026-08-28: no.* Four layers already cover the substrate on every
   PR or on demand — the vitest conformance cases under Node, the Bun
   conformance step in the unit gate, `storage-gate-a.yml` across three targets
   on dispatch, and the release-candidate smoke. What per-PR compiled coverage
   adds over that is narrow: a Bun-compile regression specific to a non-host
   target. Gate A already catches exactly that, at zero standing cost, and the
   thing it trades against — macOS and Windows runners on every PR, Windows at
   2× — is a recurring bill for a rare failure. **Working rule instead:** run
   Gate A before merging any PR that touches `packages/cli/src/storage/`.
8. **Should `darwin-x64` join the executed set?** *Decided 2026-08-28: no.*
   The reason is what Bun links, not what the runner costs. Bun uses the
   **system** SQLite on macOS and bundles its own on Linux and Windows, and
   `darwin-arm64` already executes that system-SQLite path. Architecture does
   not change which library is linked or whether FTS5 was compiled into it, so a
   fourth runner would re-prove what the third already proved. Header check
   stays. Revisit only on an actual macOS-specific failure — a real signal, not
   a hypothetical one.

## Release decisions carried by this plan

**PR #80 (Version Packages beta) — hold, and recut after the first promotion.**
Not merged, for two reasons that point the same way. The branch rule above makes
`main` maintainer-only until blocker phase 11 closes, and merging a Version
Packages PR publishes artifacts, which is not a step to take on inference. More
concretely, the beta carries the defect PR #82 fixed: it bumped
`packages/cli/package.json` without regenerating `kit-embedded.generated.ts`, so
that beta stamps a kit version that does not match the binary. Cutting it as it
stands would ship that mismatch. The clean order is: promote `dev` → `main`
once the parity phases reach a stopping point, then cut the beta on top.

<!-- slug: ak-2-14-parity -->
