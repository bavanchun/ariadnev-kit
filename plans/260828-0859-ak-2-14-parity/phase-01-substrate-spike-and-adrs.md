---
phase: 1
title: "Substrate spike and ADRs"
status: pending
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

**Corrected 2026-08-28.** An earlier draft of this phase claimed the harness
"does not exist today — release smoke runs host-only", and sized Gate A at
roughly half the phase on that basis. **That was false.** Verified:
`.github/workflows/release-candidate-build.yml:160` defines job
`smoke-cross-platform`, added by commit `05dce94`, which downloads the compiled
candidate and *executes* it via `packages/cli/scripts/smoke-binary.mjs`.
Execution coverage of the five targets in `scripts/binary-targets.mjs` today:

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
  prose passes; `docs/` and `packages/` are **not**. Discovered the hard way on
  2026-08-28: the four ADRs failed this gate on their first push with 27 hits and
  were rewritten to say "upstream" throughout, matching ADR 0011's existing house
  style.

  This is a live constraint on phase 1's own deliverables, not a documentation
  footnote. `capture-upstream-surface.mjs` must invoke the upstream binary by
  name, and `parity-manifest.json` records the surface it captured. Decide the
  mechanism here, once, for every later phase: the gate offers a line-scoped
  `brand-drift-allow: <reason>` comment, or the binary name can come from an
  environment variable with a documented default. Do **not** add an allowlist
  prefix for `packages/` — the gate's own comment is explicit that entries must
  be historical records, "never a file that simply has not been renamed yet".
- Dynamic imports only for both drivers; both marked external in the tsup and
  bun-build configs. A static `import "node:sqlite"` fails `bun build --compile`
  at *build* time — verified.
- Runtime state path constants get their **own module**. `src/adapt/paths.ts`
  belongs to the adapt engine, which must stay pure (CLAUDE.md).
- CI Node bumped 20 → 24 so `node:sqlite` exists for the dev driver.

## Architecture

**Probed on this machine, 2026-08-28 — these numbers drive the design:**

| Probe | Result |
|---|---|
| `bun:sqlite` + FTS5, Bun 1.3.14 | works, including inside `bun build --compile` |
| `node:sqlite` under Bun 1.3.14 | **absent** — `No such built-in module` |
| static `import "node:sqlite"` + `--compile` | fails at build time |
| `node:sqlite` under Node 24.15.0 | works, FTS5 confirmed |
| CI `node-version` | **`20`**, in **five places across three workflows** — `ci.yml:174`, `ci.yml:262`, `release.yml:40`, `release-candidate-build.yml:55`, `release-candidate-build.yml:178` |

All five get bumped, but **not for the reason an earlier draft gave.** That draft
said leaving the release pins on Node 20 would fail at phase 13 because
`node:sqlite` does not exist there. Verified 2026-08-28: **the release-candidate
build runs no tests at all.** Its steps are verdict lookup
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
declare `">=18"`, which becomes false the moment the dev driver lands
(`node:sqlite` arrived in 22.5). Both are bumped in the same PR.

On the substrate itself: neither driver alone covers both runtimes, which is what
forces the adapter. `better-sqlite3` is rejected — a native addon fights
`--compile`. Moving the test suite to Bun to dodge the dual
driver is also rejected — vitest-under-Node is the established harness and
swapping it is a far larger change than an adapter.

```
storage/
  driver.ts          interface: open, exec, query, close, transaction
  driver-bun.ts      dynamic import("bun:sqlite")
  driver-node.ts     dynamic import("node:sqlite")
  select-driver.ts   typeof Bun !== "undefined" ? bun : node
  conformance.test.ts  one suite, run under BOTH runtimes in CI
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
- Create: `scripts/capture-upstream-surface.mjs` — regenerates the manifest from `ak --help`
- Create: `docs/decisions/0014-…` … `0017-…` — four ADRs, continuing the existing sequence (latest is `0013-lint-exemption-is-a-shrinking-list.md`). **There is no `docs/adr/`** — the repo's ADRs live in `docs/decisions/`, which is also where `0011-upstream-is-a-one-time-fork.md` lives, and ADR #4 below amends it
- Create: `packages/cli/src/kit/parity-ratchet.test.ts` — the monotonic missing-count gate
- Modify: `.github/workflows/ci.yml:174,262` — Node 20 → 24
- Modify: `.github/workflows/release.yml:40` — Node 20 → 24
- Modify: `.github/workflows/release-candidate-build.yml:55,178` — Node 20 → 24
- Modify: `package.json:6`, `packages/cli/package.json:33` — `engines.node` `>=18` → `>=22.5`
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
7. Write `scripts/capture-upstream-surface.mjs` (shell out to `ak --help` and
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
- [ ] All five `node-version` pins bumped to 24, plus both `engines.node` fields — one PR, targeting `dev`
- [ ] **Compiled-binary SQLite smoke green on all three executed targets** (`linux-x64`, `darwin-arm64`, `windows-x64`) — FTS5 and WAL against a temp DB
- [ ] `darwin-x64` and `linux-arm64` remain header-checked only, and that is stated rather than silently implied
- [ ] Nothing from this phase merged into `main` — see the branch rule

**Gate B — the adapter and the decisions.**
- [ ] Conformance suite passes under both Bun and Node, same assertions
- [ ] Four ADRs committed in `docs/decisions/`, numbered 0014-0017
- [ ] `~/.ariadnev/operational/` defined; created lazily, never on an unrelated command
- [ ] `rebuild-equivalence.test.ts` exists and runs in CI
- [ ] `parity-manifest.json` classifies every captured name; excluded set frozen by test
- [ ] **The missing-count ratchet exists, is seeded, and runs in CI**
- [ ] No-stubs assertion active and green
- [ ] **`node packages/cli/scripts/check-brand-drift.mjs` clean** with the capture script and manifest in the tree, and the mechanism recorded for later phases
- [ ] `src/adapt/` untouched and still ≥90% covered
- [ ] `pnpm test` green

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
