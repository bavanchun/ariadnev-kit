---
phase: 6
title: "JSON envelope and backups verbs"
status: completed
priority: P2
effort: "3-4d"
dependencies: [5]
---

# Phase 6: JSON envelope and backups verbs

## Overview

Pure feature work, split out of the original phase 5 so it does not drag ~10
`--json` surfaces into the security-critical release path. Depends on phase 5
only because every new backups verb makes the restore path easier to reach, and
phase 5 is what hardens it.

Zero urgency. This is where schedule pressure should vent first.

## Requirements

**Functional**
- `--json` on all 10 missing surfaces, through **one extracted** envelope helper.
- `backups` gains `show|verify|prune`; `restore` gains `--latest`; `recover` is
  a thin alias.
- Manifest v2 records `sha256` and `size` so `verify` means something.

**Non-functional**
- No new verb lands on an unhardened restore path (phase 5 gates this).

## Architecture

### The envelope already exists five times — extract it

The earlier draft asserted "no shared envelope helper exists". False. Five
commands already emit the exact target shape, each with a private `envelope()`
and its own `*_SCHEMA_VERSION`, with `kind` already dot-namespaced:

| File | Line |
|---|---|
| `plan-command.ts` | 68 (`plan.use`, `plan.list`) |
| `journal-command.ts` | 46 |
| `kit-command.ts` | 38 (`kit.install-path`) |
| `mcp-command.ts` | 67 (`mcp.show`) |
| `adapters-command.ts` | 75 |

So `json-envelope.ts` **extracts** the existing shape and those five swap a
private function for the import, output byte-identical. The draft would have
built a sixth copy and frozen the five conformant ones as "legacy" — permanently
forbidding the consolidation.

`LEGACY_JSON_COMMANDS` covers only the ones that genuinely differ: `contract`
(`PROTOCOL_VERSION = "2"`), `config` (camelCase `schemaVersion`), `audit` (flat
`protocol_version` spread), `run`, `eval`, `validate`. Mirror
`LEGACY_EXIT_COMMANDS` (`exit-codes.ts:27`) and pin it by test.

Surfaces actually missing `--json`: install, uninstall, update, list, migrate,
add-skill, backups, doctor, **query, telemetry** — **10**, not the 7 first quoted.

### Backups verbs

av's manifest is `{originalPath, relPath, label}` (`backup.ts:4-10`) — no hash,
no size, no version. `show` is thin without a bump and `verify` is impossible.

| Verb | Status |
|---|---|
| `list`, `restore` | exist |
| `prune` | **new** — `rotateBackups(keep=3)` is auto-only, no age option |
| `show` | **new** — needs the schema bump to beat `list` |
| `verify` | **new** — needs the schema bump to exist |
| `create` | **non-goal** — snapshots a DB ariadnev does not have |

Bump `manifest.json` to `{manifestVersion: 2, entries: [...]}` so `verify` can
report `unverifiable` for a pre-bump backup rather than a false `ok`.

### `av recover`

AgentKit's own help calls `recover` a top-level alias for `backups restore`, not
distinct behavior; its only real addition is `--latest`. So: `--latest` on
`restore`, plus a thin alias delegating to the same function. No second code path.

`recover` is a new top-level command, so `KNOWN_COMMANDS` and `CAPABILITIES`
(`contract-command.ts:32-79`) must be updated deliberately — that list exists to
force review when a command is added, and `contract-command.test.ts:40-44` fails
otherwise.

## Related Code Files

- Create: `packages/cli/src/cli/json-envelope.ts` + test
- Modify: the five existing emitters (swap private helper for the import)
- Modify: `packages/cli/src/install/backup.ts` (manifest v2)
- Modify: `packages/cli/src/cli/backups-command.ts` (new verbs, `--latest`)
- Modify: `packages/cli/src/cli/contract-command.ts` + test (`recover`, capability)
- Modify: `register-{install,maintenance,tier1,catalog}-commands.ts`
- Modify: `packages/cli/src/cli/list-command.ts` (structured result, not a string)
- Modify: `packages/cli/src/cli/exit-codes.ts` (`LEGACY_JSON_COMMANDS`)
- Modify: `README.md`

## Implementation Steps

1. Extract `json-envelope.ts` from the five copies; prove byte-identical output
   with the existing command tests. Define and pin `LEGACY_JSON_COMMANDS` as the
   six that actually differ.
2. Manifest v2. Decide the directory-entry hash strategy first — one tree-hash
   over `relpath:sha256` per file is the smaller change. `readBackupManifest`
   fails open on v1.
3. `backups show|verify|prune`, each with `--json` from the start, following the
   existing positional-`action` dispatch (`register-maintenance-commands.ts:43-70`).
4. `--latest` on `restore`; `recover` alias; update `KNOWN_COMMANDS` and
   `CAPABILITIES` deliberately.
5. Remaining `--json` surfaces. `list` needs a real refactor — `runList` returns
   a bare string with nothing structured to serialize.
6. `doctor --json`, `query --json`, `telemetry --json`.
7. README command table.

## Success Criteria

- [x] The five existing `--json` commands emit byte-identical output after
      extraction — their own tests pass unchanged, which is the proof.
- [x] All missing surfaces support `--json`; new ones use the envelope.
- [x] `LEGACY_JSON_COMMANDS` pinned by test; `av audit --json` shape unchanged.
- [x] `backups verify` reports `ok` / `corrupt` / `missing` / `unverifiable` —
      the tamper test mutates a file **nested inside** a backed-up directory.
- [x] `backups prune` honours `--older-than` and `--keep-last`; most-protective
      wins when both are given.
- [x] `backups restore --latest` picks the newest.
- [x] `av recover` and `av backups restore` reach the same dispatch.
- [x] `contract-command.test.ts` passes with `recover` registered.
- [x] `pnpm test` green — 1293 vitest, 153 node, lint and validate clean.

## Corrections to this phase's own counts

**Eleven surfaces were missing `--json`, not ten, and the legacy list is five,
not six.** `validate` was named as a command whose JSON "genuinely differs" — it
emitted no JSON at all, so it had nothing to grandfather, and listing it would
have permanently exempted it from an envelope it had never used. Measured
against the real Commander tree rather than the draft's prose:

| | commands |
|---|---|
| legacy shape, preserved | `contract`, `audit`, `config`, `run`, `eval` |
| gained the envelope | `install`, `uninstall`, `update`, `doctor`, `backups`, `list`, `query`, `telemetry`, `migrate`, `add-skill`, `validate` |

`eval` is in both columns: `--suite` already emitted its own JSON document
unconditionally, while the tier-1/tier-3 path had no machine form at all. It
gained one.

## What needed more than a flag

Most handlers already returned structured results beside their summary. Two did
not:

- **`list`** built its strings directly. `listData()` now computes the answer
  and `runList` renders it, so the two forms are the same values rather than two
  computations of them. This was the only real refactor.
- **`eval`**'s tier-3 loop now collects each skill's outcome as it prints it,
  from the same values.

Three payload decisions worth keeping: `doctor` carries its exit code *inside*
the payload because 0/1/2 predates the shared exit table and a reader should not
have to know that; `validate` carries `heldFindings` in full where the text
prints only the count; `update` carries its lines, because its output is the
reasoning and a status code would be strictly less informative.

Coverage is asserted against the real command tree, so a new command without
`--json` fails — a written-down list is what a command's own commit forgets.

## Open question 3, answered

**Directory-entry hash strategy: a tree digest.** Every file below the target,
sorted by its path relative to it, folded in as `relpath\0<sha256 of bytes>`.
Paths are part of the digest, so a file moved inside the tree without an edit
still changes the answer — hashing contents alone would call a rearranged tree
identical. Both that and the nested-tamper case are mutation-checked.

`hashTarget` runs per `backupPath` call, and `backupPath` rewrites the whole
manifest each time, so a full-tree backup is O(n²) in manifest writes. Measured
at ~1500 entries it is under a second and pre-existing; noted rather than fixed,
because fixing it means batching the writer and that is not this phase.

## Risk Assessment

**`verify` that always says ok.** If directory entries are hashed but never
recomputed, `verify` becomes theatre — worse than absent, because it is trusted.
*Signal:* the tamper test only mutates a top-level file. *Pre-decided response:*
the test must mutate a nested file.

**Envelope churn.** Retrofitting `--json` onto the new verbs after building them
is rework. *Response:* step 1 is the helper; step 3 builds verbs with `--json`
already wired.

**Scope honesty, recorded:** `kongming` rated blanket `--json` low-ROI twice —
nothing parses av output today, and it is contract surface maintained forever.
The maintainer chose full coverage with that stated. The real count is 10
surfaces, not 7.

**Unverified:** whether `ariadnev-web` consumes any av `--json`. One grep before
pinning `LEGACY_JSON_COMMANDS` — it is a permanent contract surface.
