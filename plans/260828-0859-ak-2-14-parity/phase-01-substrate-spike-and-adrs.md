---
phase: 1
title: "Substrate spike and ADRs"
status: completed
priority: P1
effort: "3-5d"
dependencies: []
---

# Phase 1: Substrate spike and ADRs

## Overview

Prove the storage substrate works inside the shipped binary on every CI target,
and write the decisions every later phase inherits. Roughly ten of the new
commands sit on this substrate; discovering at phase 11 that it cannot be built
would invalidate half the plan.

Small in code, decisive in consequence. It splits into two gates:

- **Gate A — the cross-target smoke.** A `bun build --compile` artifact must be
  built *and executed* on Linux, macOS, and Windows with a SQLite/FTS5/WAL probe
  against it. Gate A is what phase 2 and everything after wait on.
- **Gate B — the adapter and the decisions.** The dual-driver storage adapter,
  the operational layout, the parity manifest and ratchet, and four ADRs.

The two are separated because the predictable failure is declaring the exit gate
"green on macOS, Linux pending" and proceeding — which would skip precisely the
risk this plan's own risk table ranks first (`bun:sqlite` off macOS). Gate A is
green on every executed target, or the plan does not advance.

**The harness already exists.** `release-candidate-build.yml:160` defines job
`smoke-cross-platform`, which downloads the compiled candidate and *executes* it
via `packages/cli/scripts/smoke-binary.mjs`. Execution coverage of the five
targets in `scripts/binary-targets.mjs`:

| Target | Executed in CI | Where |
|---|---|---|
| `linux-x64` | yes | `build` job, on its own runner |
| `darwin-arm64` | yes | `smoke-cross-platform`, `macos-latest` |
| `windows-x64` | yes | `smoke-cross-platform`, `windows-latest` |
| `darwin-x64` | no | header/arch bytes only |
| `linux-arm64` | no | deliberate and documented — paid arm runner; pure-JS fallback pre-approved |

So Gate A is **extend an existing harness**, not build one. `checkSmokeOutput` is
a pure function with its own unit test (`smoke-binary.test.mjs`) and `run(bin,
args)` spawns arbitrary subcommands — both clean extension points. Linux, macOS,
and Windows coverage comes for free from the existing matrix.

The one genuine gap: this lives on the **release-candidate** path, not per-PR
`ci.yml`, which is `ubuntu-latest`-only across all three jobs and never executes
a compiled binary. Adding a compiled smoke to every PR costs billed minutes
against an explicit maintainer constraint — that is a decision to put to the
maintainer, not a default. See open question 7.

## Requirements

**Functional**
- A storage adapter with two drivers behind one interface: `bun:sqlite` in the
  shipped binary, `node:sqlite` under vitest/dev.
- A compiled-binary SQLite smoke on every target CI actually executes
  (`linux-x64`, `darwin-arm64`, `windows-x64`), added to the existing harness.
- The `~/.ariadnev/operational/` layout defined and documented.
- The rebuild-equivalence invariant test, over an empty set of commands.
- `parity-manifest.json` — every name in the captured surface classified.
- Four ADRs (see Architecture).

**Non-functional**
- **The brand-drift gate applies to this plan's tooling.**
  `packages/cli/scripts/check-brand-drift.mjs` fails CI on any surviving upstream
  identifier — the product name, and a bare `ak` as a standalone word — across
  every tracked file except its allowlist. `plans/` is allowlisted ("dated plans
  and reports describe work as it was scoped"), which is why this plan's own
  prose passes; `docs/` and `packages/` are **not**. ADRs 0014-0017 say
  "upstream" throughout for this reason, matching ADR 0011's house style.

  This is a live constraint on phase 1's own deliverables, not a documentation
  footnote. `capture-upstream-surface.mjs` must invoke the upstream binary by
  name, and `parity-manifest.json` records the surface it captured. Decide the
  mechanism here, once, for every later phase: the gate offers a line-scoped
  `brand-drift-allow: <reason>` comment, or the binary name can come from an
  environment variable with a documented default. Note the wrinkle before hitting
  it: `parity-manifest.json` is JSON, so a line-scoped `brand-drift-allow:`
  comment has to ride inside a string value on the same line as each identifier —
  which argues for the manifest storing no upstream identifier at all. Do **not**
  add an allowlist prefix for `packages/` — the gate's own comment is explicit
  that entries must be historical records, "never a file that simply has not been
  renamed yet".
- Neither SQLite module may be resolvable at build time. **Measured during
  execution, and it corrects what this phase originally recorded:** a static
  `import "node:sqlite"` does *not* fail `bun build --compile` — it compiles
  cleanly and then kills the binary at module load, on every command. A build
  error would have been the kinder outcome. A dynamic import behind an opaque
  specifier survives the compile but is rewritten by vitest, whose vite predates
  `node:sqlite` and strips the prefix. `createRequire(import.meta.url)(spec)` is
  the one form that works under Node, Bun, the compiled binary, and vitest, so
  both drivers go through `storage/load-sqlite.ts`. No `external` entry in either
  build config turned out to be needed; a test enforcing the property is worth
  more than a flag that changes nothing.
- Runtime state path constants get their **own module**. `src/adapt/paths.ts`
  belongs to the adapt engine, which must stay pure (CLAUDE.md).
- CI Node bumped 20 → 24 so `node:sqlite` exists for the dev driver.

## Architecture

**Probed on this machine, 2026-08-28 — these numbers drive the design:**

| Probe | Result |
|---|---|
| `bun:sqlite` + FTS5, Bun 1.3.14 | works, including inside `bun build --compile` |
| `node:sqlite` under Bun 1.3.14 | **absent** — `No such built-in module` |
| static `import "node:sqlite"` + `--compile` | **compiles; the binary then dies at module load** — re-measured during execution |
| `node:sqlite` under Node 24.15.0 | works, FTS5 confirmed |
| CI `node-version` | **`20`**, in **five places across three workflows** — `ci.yml:174`, `ci.yml:262`, `release.yml:40`, `release-candidate-build.yml:55`, `release-candidate-build.yml:178` |

All five get bumped, though **the three release pins are inert with respect to
the storage work**: the release-candidate build runs no tests at all. Its steps
are verdict lookup
(`require-ci-verdict.mjs`, keyed by source SHA), `pnpm install`,
`build-binaries.mjs`, `smoke-binary.mjs`, attestation, staging, upload. Nothing
on that path imports `node:sqlite` — the shipped binary carries `bun:sqlite`
inside it, and `smoke-binary.mjs` only spawns that binary. The release pins are
inert with respect to the storage work.

The real reason to bump all five is **toolchain skew**: CI would verify the tree
on Node 24 while the release builds it on Node 20, which is the phase-13-surprise
class this phase exists to prevent. Splitting the bump also manufactures a second,
forgettable PR against a "one push per PR" constraint. One PR, five pins.

**Merge target is `dev`.** The release pins are only live once promoted to
`main`, and `main` is maintainer-only until blocker phase 11 closes — see the
branch rule in `plan.md`. Tell the maintainer explicitly: the Node bump and the
smoke change ride the first post-beta `dev`→`main` promotion, so the next
candidate build after that promotion is the first on Node 24.

`engines.node` in `package.json:6` and `packages/cli/package.json:33` both
declare `">=18"`, which becomes false the moment the dev driver lands. The floor
is **`>=22.13`**, not `>=22.5`: `node:sqlite` was added in 22.5 but required
`--experimental-sqlite` until 22.13.0 (and 23.4.0), so a contributor on 22.5-22.12
hits the same `No such built-in module` this plan documents for Bun. CI pins 24;
22.13 is the honest floor for a contributor. Both fields move in the same PR.

On the substrate itself: neither driver alone covers both runtimes, which is what
forces the adapter. `better-sqlite3` is rejected — a native addon fights
`--compile`. Moving the test suite to Bun to dodge the dual
driver is also rejected — vitest-under-Node is the established harness and
swapping it is a far larger change than an adapter.

```
storage/
  driver.ts             interface + the two normalisations, WAL rule, transactions
  load-sqlite.ts        the one door: createRequire over an opaque specifier
  driver-bun.ts         bun:sqlite
  driver-node.ts        node:sqlite
  select-driver.ts      typeof Bun !== "undefined" ? bun : node
  sqlite-self-test.ts   the capability doctor prints and the release smoke asserts
  operational-paths.ts  ~/.ariadnev/operational/ and its derived/ half
  rebuild-equivalence.ts  the standing invariant, empty and already binding
  conformance-cases.ts  one case array, no test-framework import
  conformance.test.ts   the Node runner (scripts/run-storage-conformance.ts is Bun's)
```

**Layout.** `~/.ariadnev/operational/` alongside the existing
`~/.ariadnev/runtime/` (precedent at `register-harness-commands.ts:75`) and
`~/.ariadnev/runs/` (`:116`). Authoritative sources are files; derived indexes
live in a `derived/` subdirectory that can be deleted wholesale at any moment.

**The four ADRs.**

1. **Derived-state doctrine.** Files authoritative, SQLite a disposable cache,
   rebuildable at any time. This is AgentKit's own doctrine, quoted from
   `ak analytics --help`: *"Session and activity sources remain authoritative;
   no remote analytics are sent."* Its lifecycle verbs
   (`enable/disable/rebuild/delete`) are the vocabulary of a cache.
2. **The backups verdict, reversed on new evidence.** `260822-1407`'s red team
   killed `av backups create`: it snapshots a database ariadnev does not have, so
   it ships dead surface. That was a claim about *the absence of a subject*, not
   a claim about databases. This plan creates the subject. Per the repo's own
   review rules a verified decision reverses only on new evidence — this is that
   evidence, and recording it here beside the original verdict is the difference
   between a reversal and a quiet contradiction.
3. **Parity definition, resolving the dependency contradiction.** The exclusion
   set is not closed under dependency: `api`'s proxy, `feedback send`, `gui`, and
   `changelog` all rest on excluded plumbing. Definition adopted: *parity = every
   AgentKit command exists with local-first semantics; remote-vendor halves map
   to ariadnev-owned equivalents.* Carries the divergence table.
4. **ADR-0011 amendment.** ADR-0011 says upstream is a one-time fork, not
   tracked, and diffability against AgentKit is explicitly not a constraint. The
   maintainer has now asked for behavioral parity at a named version. The
   amendment records what changed and what did not: ariadnev still does not track
   upstream commits — it cannot, `ak` is a closed Mach-O binary with no source
   anywhere on disk. It reimplements observable behavior against a live oracle.

## Related Code Files

- Create: `packages/cli/src/storage/driver.ts`, `driver-bun.ts`, `driver-node.ts`, `select-driver.ts`
- Create: `packages/cli/src/storage/conformance.test.ts`
- Create: `packages/cli/src/storage/operational-paths.ts` — runtime state constants, **not** `adapt/paths.ts`
- Create: `packages/cli/src/storage/rebuild-equivalence.test.ts` — the standing invariant
- Create: `parity-manifest.json`
- Create: `packages/cli/scripts/capture-upstream-surface.mjs` — regenerates the manifest. Every existing script lives here, not at the repo root
- Create: `docs/decisions/0014-…` … `0017-…` — four ADRs, continuing the existing sequence (latest is `0013-lint-exemption-is-a-shrinking-list.md`). **There is no `docs/adr/`** — the repo's ADRs live in `docs/decisions/`, which is also where `0011-upstream-is-a-one-time-fork.md` lives, and ADR #4 below amends it
- Create: `packages/cli/src/kit/parity-ratchet.test.ts` — the monotonic missing-count gate
- Modify: `.github/workflows/ci.yml:174,262` — Node 20 → 24
- Modify: `.github/workflows/release.yml:40` — Node 20 → 24
- Modify: `.github/workflows/release-candidate-build.yml:55,178` — Node 20 → 24
- Modify: `package.json:6`, `packages/cli/package.json:33` — `engines.node` `>=18` → `>=22.13`
- Modify: `CONTRIBUTING.md:22` — the prose "Requires **Node 20**", which no `node-version` grep finds
- Modify: `packages/cli/scripts/smoke-binary.mjs` + `smoke-binary.test.mjs` — the SQLite/FTS5/WAL assertion in `checkSmokeOutput`, riding the existing `smoke-cross-platform` matrix
- Modify: tsup + bun-build config — mark both sqlite modules external
- Modify: `packages/cli/src/cli/contract-command.ts` — parity section

## Implementation Steps

1. **CI Node bump 20 → 24 as its own PR — all five pins.** Small, separable, and
   it must land before the dev driver can be tested at all. Grep for
   `node-version` rather than editing the five known lines: a sixth added since
   this plan was written must not be missed. See open question 6.
2. Write the four ADRs. First, deliberately: later phases inherit rules rather
   than re-deciding them, and ADR 3 is what stops each phase re-litigating the
   dependency contradiction.
3. Build the storage adapter with both drivers and the conformance suite. Run it
   under Node (vitest) and under Bun. Same assertions, both runtimes.
4. **Extend the existing smoke with a SQLite probe — Gate A.** The harness
   already executes the compiled binary on Linux, macOS, and Windows (see the
   correction above), so the work is a probe, not a harness: add an assertion to
   `checkSmokeOutput` driven by a binary subcommand that opens a temp database and
   exercises FTS5 and WAL. It then rides the existing matrix. macOS is already
   proven by hand; Linux and Windows are the open ones, because Bun bundles its
   own SQLite off macOS.

   Iterate the probe on a **scratch workflow scoped to the spike branch**, then
   fold the finished job in as one clean PR. CI iteration is where "one push per
   PR" and the minutes budget die otherwise. Extend via the existing `changes`
   job-condition pattern — `ci.yml`'s header is explicit that the filter is a job
   condition and never a trigger-level `paths-ignore`.
5. Define `~/.ariadnev/operational/` and implement `operational-paths.ts`.
   Lazy creation only: `~/.agentkit/operational/` did not exist on this machine
   until something needed it, and a tool that materializes a database on an
   unrelated invocation is worse than one that does not.
6. Write `rebuild-equivalence.test.ts` over an empty command set — trivially
   green now, gaining a case per command later. **Writing it now is the point:**
   a gate added afterwards is shaped around what was already built.
7. Write `packages/cli/scripts/capture-upstream-surface.mjs` (shell out to the
   upstream binary's `--help` and
   each `ak <cmd> --help`, parse, emit JSON, retain raw text so a mis-parse is
   diffable). It is a maintainer tool — `ak` is not on CI, and the script header
   must say so, so nobody wires it into a build.
8. Run it; hand-classify every captured name as in-scope or excluded-with-reason;
   commit. Add a test asserting the **excluded set is frozen** — otherwise a
   later phase can improve the parity number by reclassifying instead of
   implementing.
9. **Build the missing-count ratchet** in `parity-ratchet.test.ts`. It reads
   `parity-manifest.json`, counts in-scope names absent from the live Commander
   surface, and asserts `missing <= ceiling`, where `ceiling` is a committed
   constant seeded at this phase's measurement. Every later phase that closes a
   gap lowers the ceiling in the same commit; phase 13 asserts zero.

   This must exist **here**. Phase 13's audit rests on the claim that missing
   counts "have been visible and monotonically decreasing all along" — a count
   that only becomes visible at the end is not a ratchet, it is a surprise, and
   it arrives during a release cut.
10. Add a `NotImplementedError` type and assert no in-scope command is a stub.
    Active from day one, or the ratchet can be gamed by registering empty
    commands.
11. Record current CI wall-clock as `ciBaselineSeconds` in the manifest so later
    phases report a delta against a number rather than a memory.

## Success Criteria

**Gate A — the cross-target smoke. Phase 2 and everything after wait on this.**
- [x] All five `node-version` pins bumped to 24, plus both `engines.node` fields — one PR, targeting `dev` (#83, merged)
- [x] **Compiled-binary SQLite smoke green on all three executed targets** (`linux-x64`, `darwin-arm64`, `windows-x64`) — FTS5 and WAL against a temp DB. Run 33142868098, all three green
- [x] `darwin-x64` and `linux-arm64` remain header-checked only — stated here and in open question 8
- [x] Nothing from this phase merged into `main` — all three PRs target `dev`

**Gate B — the adapter and the decisions.**
- [x] Conformance suite passes under both Bun and Node, same assertions — 12 cases, one array, two runners
- [x] Four ADRs committed in `docs/decisions/`, numbered 0014-0017 (#81)
- [x] `~/.ariadnev/operational/` defined; created lazily, never on an unrelated command
- [x] `rebuild-equivalence.test.ts` exists and runs in CI, and names the commands that will owe a case
- [x] `parity-manifest.json` classifies all 42; the six exclusions are frozen in the test, not the manifest
- [x] **The missing-count ratchet exists, is seeded at 22, and runs in CI** — and asserts equality, not just a bound
- [x] No-stubs assertion active and green
- [x] **`check-brand-drift.mjs` clean** with the capture script and manifest in the tree. Mechanism for later phases: the binary name comes from `ARIADNEV_UPSTREAM_BIN` with no default, raw help is written outside the repository, and the manifest carries no upstream prose. No allowlist entry, no inline opt-out
- [x] `src/adapt/` untouched
- [x] `pnpm test` green

## Risk Assessment

**`bun:sqlite` behaves differently on Linux or Windows compiled targets.** Bun
bundles its own SQLite off macOS, and the hand probe covered macOS only. The
existing smoke already executes on Linux and Windows, so this risk is now
*measurable here* rather than deferred — which is the point of putting the probe
on that harness.
*Signal:* step 4 fails on a non-macOS target. *Response:* this phase does not
pass, and no command phase starts. Fallbacks in order: pure-JS store; plain-scan
over shards for content-search. The single-binary distribution model is not
traded away for query speed.

**The Node bump breaks something unrelated.** Node 20 → 24 across a 143-file
suite.
*Signal:* unrelated test failures in the bump PR. *Response:* it is a separate PR
precisely so this is isolated and revertable without touching the parity work.

**The ADRs get written after the code.** The most common way a doctrine phase
becomes decoration.
*Signal:* a command phase starts while ADR 1 or 3 is still a draft.
*Response:* the ADRs are steps 2 of 10, before the adapter. Their absence blocks
the phase, and the phase blocks everything else.

**Reversing the red team on insufficient grounds.** ADR 2 reverses a verified
decision.
*Signal:* the ADR argues from AgentKit having the command rather than from the
subject now existing. *Response:* the ADR must state the original verdict, the
new fact, and why the fact changes the conclusion. If it cannot, the verdict
stands and `backups create` stays excluded.
