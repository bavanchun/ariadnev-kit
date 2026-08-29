---
phase: 7
title: "content-search shards"
status: completed
priority: P3
effort: "3-4d"
dependencies: [6]
---

# Phase 7: `content-search` shards

## Overview

`av content-search enable|disable|status|search|rebuild|delete` — opt-in,
per-project full-text search over project content, backed by FTS5 shards.

The most privacy-sensitive command in the plan: **the searchable text is
plaintext at rest.** AgentKit says so in its own help output, and ariadnev must
say it just as plainly rather than burying it.

## Requirements

**Functional**
- `av content-search enable --project <id>` — opt one project in.
- `disable` — stop indexing and searching, keep the shard.
- `status --project <id>` — per-project opt-in state.
- `search --project <id> --query '<q>'` — bounded FTS query.
- `rebuild` — delete and recreate one shard.
- `delete` — preview, then remove one shard.

**Non-functional**
- **Per-project opt-in.** Never global, never implicit. Enabling one project
  never enables another.
- **The plaintext-at-rest warning is shown at `enable`**, not only in docs.
- Shards are 0600 and live under `~/.ariadnev/operational/content/`.
- Queries are bounded — result count and time — so a pathological query cannot
  hang the CLI.
- A shard is derived and disposable, like every other index in this plan.

## Architecture

**Oracle.** `ak content-search --help`: *"Manages opt-in per-project FTS5 content
search shards under `AGENTKIT_HOME/operational/content/`. Searchable text is
plaintext at rest."* Six verbs, every one taking `--project`. On this machine no
shard existed — the opt-in default is genuinely off.

### Oracle capture (step 1, recorded before any code)

Six verbs, each `--project string  canonical project UUID`, each with
`--json/--yes/--quiet/--verbose/--no-interactive` and an `Effects:` +
`Exit status:` block (`0 success, 1 command failure, 2 invalid flags`).

| verb | one-line | effects |
|---|---|---|
| `enable` | Opt a project into local plaintext content search | Creates `.../content/<project-id>.db` and sidecars |
| `disable` | Stop indexing/search without deleting the shard | Updates the lifecycle marker |
| `status` | Show opt-in content-search status for one project | Read-only |
| `search` | Run a bounded FTS query against one opted-in project | Read-only; `--limit int` **default 20**, `--query string` |
| `rebuild` | Delete and recreate one project content shard | Deletes and recreates shard files |
| `delete` | Preview and remove one project content shard | Removes DB/WAL/SHM under `operational/content/` |

Longer descriptions worth keeping verbatim: enable *"Creates one FTS5 shard for a
project after the owner accepts plaintext-at-rest disclosure"*; search *"Runs a
parsed, budgeted FTS5 MATCH against one opted-in project shard"*; delete
*"Previews shard bytes/docs, then with `--yes` removes …"*. The
plaintext-at-rest wording is the right warning and is reproduced, not weakened.

### Three deliberate divergences

**1. Shards live under `derived/content/`, not `operational/content/`.** The
phase's own non-functional list names the captured path, and its architecture
says a shard is derived and disposable — under this plan's layout those are the
same claim only if the shard sits under `derived/`. It is load-bearing rather
than cosmetic: step 9's rebuild-equivalence case deletes derived state and
rebuilds, and a shard outside `derived/` would survive that deletion and make
the case pass without ever testing anything. The opt-in marker goes the other
way — `operational/content-search-state.json`, outside `derived/` — for the
reason phase 6 kept `analytics-state.json` out: deleting derived state must
never silently switch someone's privacy decision back on.

**2. `--project` takes a name or a directory, not a UUID.** ariadnev's registry
(phase 4) identifies a project by `name` + absolute `dir`; there are no UUIDs to
accept. Resolution is `findProject`'s captured precedence — exact directory
first, then name. The shard *filename* is a sha256 prefix of the resolved
directory, so it is stable, filesystem-safe at any path length, and legible
through `status` rather than by reading the directory.

**3. `search` gains `--timeout`.** The captured surface bounds results
(`--limit`, default 20) but exposes no time bound. The phase's risk table treats
"a query without a timeout in any code path" as a defect signal, so the bound
exists and is a default rather than an option; `--timeout` only moves it.

**One shard per project, not one index for all.** This is a real design choice
and it follows from the opt-in model: a per-project file means `delete` is an
unlink, `disable` is a flag, and opting one project in cannot leak another
project's content into a shared table. It also means a shard's blast radius is
one project.

**FTS5 comes from phase 1's adapter.** `bun:sqlite` FTS5 is proven on macOS;
Linux and Windows compiled targets are phase 1's smoke gate. **If FTS5 turns out
unavailable on a target, this phase degrades to plain-scan over the same shard
files** rather than failing — slower, correct, and the same interface. That
fallback is named in phase 1's risk table and is why this phase is P3 and late.

**Bounding.** Two limits, both defaulted and both overridable: max results, and a
query timeout. An unbounded FTS query over a large corpus in a CLI that agents
invoke is a hang waiting to happen.

## Related Code Files

- Create: `packages/cli/src/content-search/shard.ts` + test — open, create, delete
- Create: `packages/cli/src/content-search/index-project.ts` + test
- Create: `packages/cli/src/content-search/query.ts` + test — bounded FTS
- Create: `packages/cli/src/content-search/plain-scan.ts` + test — the no-FTS5 fallback
- Create: `packages/cli/src/cli/content-search-command.ts` + test
- Modify: `packages/cli/src/storage/operational-paths.ts` — content root
- Modify: `packages/cli/src/storage/rebuild-equivalence.test.ts` — shard cases
- Modify: `packages/cli/src/cli/doctor-command.ts` — shard health
- Modify: `parity-manifest.json`

## Implementation Steps

1. **Oracle observation.** Capture `ak content-search <verb> --help` and a
   `status --json` envelope. Record the exact plaintext-at-rest wording — it is
   the right warning and there is no reason to weaken it.
2. Failing tests first: enabling project A does not index project B; searching a
   disabled project returns a clear "not enabled" rather than empty results.
   Empty-vs-disabled is the confusion that makes a search tool untrustworthy.
3. Implement `shard.ts` on phase 1's storage adapter. One file per project,
   0600, created only on `enable`.
4. Implement `index-project.ts`. Respect the project's ignore rules; never index
   `.env`, key material, or anything the repo ignores. A content index that
   quietly slurps `.env` into a plaintext file is a security incident.
5. Implement `query.ts` with both bounds and `--limit` / `--timeout` overrides.
6. Implement `plain-scan.ts` behind the same interface, selected when FTS5 is
   unavailable. Same tests run against both paths.
7. Implement all six verbs. `enable` prints the plaintext warning and requires
   confirmation (or `--yes`).
8. `delete` previews what will be removed before removing it.
9. Add shard cases to the rebuild-equivalence invariant: delete a shard, rebuild,
   same results.
10. Doctor check: per-project shard present / stale / corrupt / absent.

## Success Criteria

- [x] All six verbs work with `--json`
- [x] Opt-in is strictly per-project — asserted that A does not index B, with a
      positive control so the assertion cannot pass on an empty shard
- [x] The plaintext-at-rest warning appears at `enable`, not only in docs — on
      the path that refuses *and* the path that succeeds, and in the JSON
- [x] Searching a disabled project says so; it does not return empty. Three
      states are kept apart: never opted in, opted in but unbuilt, and genuinely
      no match
- [x] Ignored files and `.env` are never indexed — asserted against the stored
      rows, not only against the walk, and confirmed on the real repo
- [x] Queries are bounded by count and time; both are defaults, neither can be
      removed, and the query is parsed to plain tokens so FTS operators cannot
      reach `MATCH`
- [x] The plain-scan fallback passes the same tests as the FTS5 path — the whole
      query suite runs twice, once per engine, plus a case asserting the two
      agree hit-for-hit
- [x] Delete a shard → rebuild → same results, wired into the standing
      rebuild-equivalence invariant with a guard against a vacuous pass
- [x] Shards are 0600, and so are `-wal`/`-shm`
- [x] `pnpm test` green

## What was built

Seven new modules and three touched ones.

| file | role |
|---|---|
| `content-search/ignore-rules.ts` | the non-overridable denylist, plus a documented `.gitignore` subset |
| `content-search/shard.ts` | one shard per project: open, schema, 0600, stats, delete |
| `content-search/lifecycle.ts` | per-project opt-in, authoritative, outside `derived/` |
| `content-search/index-project.ts` | the walk, with every refusal counted rather than only made |
| `content-search/query.ts` | token parsing, both bounds, engine selection |
| `content-search/plain-scan.ts` | the no-FTS5 fallback and the line-finder both engines share |
| `cli/content-search-command.ts` | the six verbs |
| `storage/operational-paths.ts` | `contentRoot` |
| `storage/rebuild-equivalence.{ts,test.ts}` | the shard case, and `contentRoot` added to the consumer guard |
| `cli/doctor-command.ts` | a shard-health line per opted-in project |

**The rows are the same with or without FTS5.** `docs` is an ordinary table and
is the only place document text lives; the FTS5 virtual table is an index over
it. So the fallback is not a second storage format with its own bugs — it is the
same rows read a slower way, which is what lets one suite run against both
engines and what makes the deleted-and-rebuilt comparison meaningful across
them. `query.test.ts` runs its whole suite twice, once per engine, and a
separate case asserts the two agree hit-for-hit over one corpus.

**Two guards were added because the phase's own assertions could pass on
nothing.** The cross-project test now asserts alpha finds its *own* marker
before asserting it cannot find beta's; and the rebuild-equivalence case throws
rather than returning an empty result, because two empty answers compare equal.
Both are the vacuous-pass failure this plan has already hit twice.

**One pre-existing defect was not repeated.** Writing a literal NUL into a
source file — the `activity-command.ts` problem carried forward from phase 3 —
happened again here in a test fixture and was caught and rewritten as a byte
array. `activity-command.ts` itself is still untouched, still out of scope.

## Measured on the compiled binary

Against this repository, 2355 documents / 16.7 MB indexed:

| operation | result |
|---|---|
| `rebuild` | 2355 docs, 16,756,544 bytes, **308 ms** |
| refusals in that pass | denied 7, ignored 5, binary 59, too-large 4, skipped-directory 6 |
| shard on disk | 43.7 MB, `0600` — and `-wal`/`-shm` also `0600` |
| `search` (FTS5) | 1–6 ms |
| `search` (plain scan, same shard) | 42–156 ms |
| indexed paths matching the denylist | **zero** |

The seven denied files are this repo's `.env.example` files. That is
conservative — an example file holds no secret — and it is the intended
direction: the rule is "when in doubt, do not index", because a missing result
is recoverable and an indexed credential is not.

**The fallback is viable, not merely correct.** Both engines returned identical
hits for every query tried against the real shard, and the plain scan's 42–156 ms
sits comfortably inside the 2 s default budget. So the no-FTS5 path is a real
degradation in speed and not in usefulness — which is what the phase's risk table
wanted from it.

### Two defects the binary found that the suite did not

**`--yes` was accepted and ignored.** The disclosure gate refused every `enable`
even when `--yes` was passed. Commander resolves a flag to the outermost command
that declares it, and `--yes` is already a program-level flag here; a subcommand
that redeclares it gets a copy that is never populated. Reading `global.yes`,
the convention every other command in this tree already follows, fixes it. Unit
tests call the handlers directly and pass `yes` as a value, so no test could
have seen this — only the parser could.

**`doctor` printed no shard line on a root with no receipt.** The
`not-installed` path returned before the shard lines. That is precisely the
person most likely to be asking why their search is empty, and a shard belongs
to the home rather than to an install receipt — the same reasoning already
written next to the crypto and storage lines on that path. Now covered by a test.

A third divergence was corrected on the same pass: Commander exits **1** for a
missing `requiredOption`, but this tree's exit table reserves 1 for "the command
ran and the answer is no" and assigns 2 to a bad invocation. `--project` and
`--query` are therefore ordinary options refused by the handlers, which land on
2 and say which flag is missing and why.

## Risk Assessment

**A shard indexes secrets.** Plaintext at rest plus a naive walker equals `.env`
in a searchable file.
*Signal:* the step-4 assertion finds an ignored or secret-shaped file indexed.
*Response:* ignore rules are honored and the assertion is a success criterion.
When in doubt, do not index — a missing result is recoverable, an indexed
credential is not.

**FTS5 is unavailable on a compiled target.** Bun bundles its own SQLite off
macOS.
*Signal:* phase 1's smoke, or this phase's tests on a non-macOS runner.
*Response:* the plain-scan fallback, behind the same interface, tested by the
same suite. This is why the fallback is built in step 6 rather than promised.

**Opt-in leaks across projects.** A shared table, or a `--project` default that
guesses.
*Signal:* step 2's cross-project assertion.
*Response:* one shard per project, `--project` required with no default.

**An unbounded query hangs an agent.** Agents invoke CLIs non-interactively and
cannot Ctrl-C.
*Signal:* a query without a timeout in any code path.
*Response:* bounds are defaults, not options. `--limit`/`--timeout` raise or
lower them; there is no way to remove them.
