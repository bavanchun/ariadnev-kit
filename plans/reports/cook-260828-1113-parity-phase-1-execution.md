# Phase 1 execution — substrate spike and ADRs

Plan `260828-0859-ak-2-14-parity`, phase 1. Executed 2026-08-28.

Everything below was measured on this machine or read out of a CI run. Where it
contradicts what the phase file said beforehand, the phase file has been
corrected in the same commit and the old claim is stated here so the correction
is auditable rather than silent.

## What shipped

| PR | What | Result |
|---|---|---|
| #82 | back-merge `main` → `dev` | merged; lag 12 → **0** |
| #83 | Node 20 → 24, `engines.node` → `>=22.13` | merged |
| #84 | the storage substrate and the parity gates | open |

Gate A ran separately on `gate-a/phase-1-substrate` across three runners,
because the only cross-platform harness in this repository lives on the release
path and that path triggers on a push to `main` and nothing else.

## Five things the plan had wrong

Each was found by executing, not by re-reading.

### 1. A static `node:sqlite` import does not fail the build

The phase file recorded, twice and marked "verified": *a static
`import "node:sqlite"` fails `bun build --compile` at build time.*

It does not. Measured on Bun 1.3.14:

```
$ printf 'import { DatabaseSync } from "node:sqlite";\n…' > stat.ts
$ bun build --compile stat.ts --outfile stat-bin
  [63ms] compile  stat-bin          # clean
$ ./stat-bin
error: No such built-in module: node:sqlite
```

It compiles and then kills the binary **at module load, on every command**. The
design consequence is unchanged, but the reason is now stronger, not weaker: a
build error would have been the kinder outcome, because the build would have
caught it.

A second measurement replaced the planned mechanism. A dynamic import behind an
opaque specifier survives the compile but is rewritten by vitest — vite 5.4
predates `node:sqlite`, strips the `node:` prefix, and then fails to resolve a
package called `sqlite`. `/* @vite-ignore */` does not help; the rewrite happens
first. `createRequire(import.meta.url)(specifier)` is the one form that works
under Node, Bun, the compiled binary, and vitest, so both drivers go through
`storage/load-sqlite.ts`.

The `external` entries the phase called for in the tsup and bun-build configs
turned out to change nothing, so they were not added. `no-static-sqlite-import.test.ts`
is the enforcement instead, and it proves itself against synthetic offenders so
it cannot rot into decoration.

### 2. `update` and `self-update` are a second name collision

The plan records one collision (`run`) and treats `update` as a command that
merely gains a file-safety rule in phase 4. Observed:

| Upstream | What it does | ariadnev today |
|---|---|---|
| `self-update` | signed binary update, nothing else | **this is what `av update` is** |
| `update` | binary step, then global/user kits, then project kits | unregistered |

So `av update` is upstream's `self-update` wearing the other one's name. Both
manifest entries now carry the resolution, the plan's semver-honesty table was
widened, and `plan.md` gained a section beside the `run` collision.

### 3. ariadnev's own command list was wrong by two names

The plan listed `prefs` (which is `av config prefs`, a subcommand) and omitted
`add-skill`. The count of 24 was right and two of the names were not — which is
the argument for `parity-manifest.json` being generated rather than written.

### 4. `main` was carrying a failing test, invisibly

The beta Version Packages PR moved `packages/cli/package.json` to `1.2.1-beta.0`
without rerunning `generate-embedded-kit.mjs`, so the committed
`kit-embedded.generated.ts` still stamped `1.2.0` and
`embedded-kit.test.ts`'s alignment assertion had been failing on `main` since
that merge.

It stayed invisible because only the **full** gate runs on a push to `main`, and
that gate runs `pnpm run build` and the build-binaries integration test *before*
the coverage step — both of which regenerate the file in place. The **unit**
gate that a PR into `dev` runs does not, so it reads what is committed. The
back-merge was the first PR into `dev` since, and it surfaced immediately.

Worth keeping: a generated file that a later step regenerates is only checked by
the gate that does not regenerate it.

### 5. `CONTRIBUTING.md` said "Requires Node 20" in prose

The phase's step 1 says to grep for `node-version` rather than edit five known
lines. That grep finds five workflow pins and misses this. It is now in the
phase's file list.

## Gate A — what the cross-target run actually found

Three runs. Final state: **`linux-x64`, `darwin-arm64` and `windows-x64` all
green**, which is phase 1's exit gate.

The risk table ranks `bun:sqlite` behaving differently off macOS first. It does
not. Windows passed **all twelve** conformance cases on the first attempt,
including FTS5 and WAL, and then failed on cleanup:

```
EBUSY: resource busy or locked, rm 'C:\...\Temp\ariadnev-storage-bun-OKkHKc'
```

**The first fix was wrong, and being wrong is what located the cause.** Reading
EBUSY as Windows being briefly slow to release a closed handle, run 2 added a
retry and a WAL checkpoint on close. Windows failed again, identically. A retry
that does not help means the handle is not transient — something really is still
holding the file.

That something was **prepared statements**. Each one holds a native handle on
the database file, and neither driver finalised them: `close()` does not release
what `prepare()` allocated. On POSIX nothing notices, because a file can be
unlinked while open. On Windows it cannot, so the directory stays busy no matter
how long the caller waits. Run 3, with both drivers finalising their statements
on close, is green.

Worth carrying forward: **on this platform a resource leak presents as a failed
delete, not as a leak.** Every later phase that opens a database in a
long-running command inherits that.

Three production changes came out of it, none of them test-only:

- both drivers cache statements by SQL text and finalise the set on close. The
  cache is not an optimisation bolted on — it is what bounds the set that has to
  be released, and re-preparing the same query was wasted work anyway;
- closing a database checkpoints the write-ahead log first, so the `-wal` and
  `-shm` sidecars go away with it. That bounds WAL growth on a long-lived index
  everywhere, independent of Windows;
- `removeStorageTree` retries, and `removeDerived(home)` expresses the ADR 0014
  operation once so no later caller rediscovers this. The retry is written out
  rather than delegated to `rmSync`'s `maxRetries`, which changed nothing under
  Bun on Windows and so cannot be relied on across both runtimes. On final
  failure it names what is still in the tree, because a bare EBUSY teaches
  nothing.

This is the whole argument for Gate A existing. None of it is reachable from a
developer's Mac, and without `storage-gate-a.yml` the first place it would have
appeared is a release.

## What review found that the conformance suite did not

The twelve cases proved the two drivers agree on everything they were asked
about. A review asked what they were not asked about, and the answer was four
divergences — each reproduced on Node 24.15.0 and Bun 1.3.14 before being
touched, each now carrying a case.

**The serious one ships silently.** Reading a column holding
`9007199254740993`:

| | result |
|---|---|
| `node:sqlite` | throws `Value is too large to be represented as a JavaScript number` |
| `bun:sqlite` | returns `9007199254740992` |

The dev runtime crashes loudly and **the shipped runtime corrupts the value
quietly** — the worst way round, and invisible to every existing case because
none of them stored a number that large. Both drivers now read integers
losslessly and narrow in one place: a value that fits comes back as a `number`,
one that does not stays a `bigint` rather than being rounded. `SqlValue` already
declared `bigint`; it just stops being a promise neither driver kept.

Three more of the same shape:

- `run(true)` threw on node and stored `1` on bun, while `SqlValue` declared
  boolean acceptable to both. SQLite has no boolean type; both bind `1`/`0` now.
- `close()` twice threw on node and no-opped on bun, so a `finally` close after
  an explicit one crashed under vitest and passed in the binary.
- `ParityCommand.phase` was declared in TypeScript and absent from all 42
  manifest entries. It had been written, then dropped by the very next
  recapture, because the capture script's merge preserved three field names and
  `phase` was not one of them. The merge now preserves the hand-written set by
  name, and the ratchet fails if a command loses its phase.

The lesson is not about SQLite. **A conformance suite proves agreement on the
questions it asks**, and the two drivers' disagreements clustered exactly where
nothing had thought to ask — the edges of the declared type. The four new cases
are all on `SqlValue`'s own boundary.

Two gate weaknesses were closed at the same time. `INDEX_TOUCHING_COMMANDS` is a
closed list and could not notice a command nobody added to it, so
`DERIVED_CONSUMERS` now requires anything reaching for a derived path outside
`storage/` to name the command it belongs to. And the ratchet's real limitation
— it compares top-level names only, so `run` and `update` already count as
registered while meaning something else — is now recorded in phase 13, which is
the audit that must not cite `missing = 0` as behavioural parity.

## The parity numbers, measured

42 captured, and the parser agrees with the plan's count exactly.

| | |
|---|---|
| captured | 42 |
| in scope | 36 |
| excluded | 6 — `login`, `logout`, `whoami`, `licenses`, `help`, `codex-agent-runtime` |
| registered today | 14 |
| **missing** | **22** — the seeded ratchet ceiling |

Two of the six exclusions were not in the plan's non-goals. `help` is the CLI
framework's own and present by construction. `codex-agent-runtime` is an internal
dispatch daemon of the upstream adapter architecture; ariadnev reaches the same
runtimes through its harness executors, which are not a command surface —
equivalent function, no equivalent name. Both are frozen in the test.

## The brand gate decided the capture's design

`check-brand-drift.mjs` forbids upstream identifiers anywhere under `packages/`,
and every line of upstream help text carries one. So:

- the capture script takes the binary name from `ARIADNEV_UPSTREAM_BIN` with
  **no default**;
- raw help is written outside the repository, and the script says so on every
  run;
- the manifest stores names, structure, and *our* classification prose — no
  upstream summaries.

No allowlist entry, no `brand-drift-allow` opt-out. This is the mechanism the
phase asked to be decided once for every later phase. A recapture over a
classified manifest is byte-identical, so the decision survives contact with
upstream 2.15.

## What is deliberately not done

- **`darwin-x64` and `linux-arm64` stay header-checked only.** Open question 8
  is the maintainer's, and it is a fourth runner on the release path.
- **The compiled smoke still does not run per-PR.** Open question 7 trades
  against the CI budget, which is an explicit maintainer constraint. The new
  `storage-gate-a.yml` is the cheap middle: on demand, three runners, each
  compiling only its own host target.
- **`ciBaselineSeconds` is 340**, from the green unit gate on PR #82.

## Unresolved

1. Open questions 1-8 in `plan.md` remain the maintainer's, 7 and 8 most
   pointedly since both are CI-budget calls.
2. The phase's success criterion "nothing merged into `main`" holds — all three
   PRs target `dev`. The Node bump and the smoke change go live on the first
   post-beta `dev`→`main` promotion, and the next candidate build after that
   promotion is the first on Node 24. That is a fact the maintainer should know
   before cutting it.
3. PR #80 (Version Packages beta) is still open. The embedded-kit fix in #82
   corrects a defect that beta carries; whether the beta should be recut on top
   of it is a release call, not an engineering one.
