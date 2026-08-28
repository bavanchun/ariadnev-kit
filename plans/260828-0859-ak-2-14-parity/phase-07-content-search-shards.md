---
phase: 7
title: "content-search shards"
status: pending
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

- [ ] All six verbs work with `--json`
- [ ] Opt-in is strictly per-project — asserted that A does not index B
- [ ] The plaintext-at-rest warning appears at `enable`, not only in docs
- [ ] Searching a disabled project says so; it does not return empty
- [ ] Ignored files and `.env` are never indexed — asserted
- [ ] Queries are bounded by count and time
- [ ] The plain-scan fallback passes the same tests as the FTS5 path
- [ ] Delete a shard → rebuild → same results
- [ ] Shards are 0600
- [ ] `pnpm test` green

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
