# Operational Gaps Research (A-F)

Scope: research only, no source writes. All line numbers verified against current tree on 2026-08-22.

## A. Cross-skill link checking

### Evidence
- `checkReferenceIntegrity(body, referenceNames)` (`packages/cli/src/kit/reference-integrity.ts:30`) is pure: takes ONE skill's SKILL.md body + that skill's own `references/*.md` filenames. Regex `REFERENCE_MENTION` at line 19 deliberately excludes anything not preceded by `./` or by nothing (bare start) — cross-skill mentions (preceded by a dir segment) never match, by design (comment lines 11-18).
- Sole caller: `packages/cli/src/cli/validate-command.ts:152` — inside `runValidate`, which already loaded the FULL kit (`kit = loadKit(root)` at line 118, `kit.skills` = every skill). **A kit-wide view already exists at the call site** — it's just not threaded into the checker. No new data source needed, only new plumbing.
- `runValidate` already builds, per skill, a `sources` array (SKILL.md body + every reference file's body) for the *other* cross-skill check, `findUnresolvedSkillReferences` (skill-crossrefs.ts) at lines 170-179. That check validates bare `av:<slug>` mentions, NOT file-path links — different regex, different job, and it already scans reference-file content (dangling/orphan does not).
- **Critical gap beyond the regex**: `checkReferenceIntegrity` is only ever called with `skill.body` (SKILL.md content), never with reference-file content. Real broken cross-skill links live disproportionately inside `references/*.md` files (see below) — fixing only the regex without also scanning reference-file content would still miss ~half the broken links.

### Actual broken-link patterns found (read-only scan, not a fix)
Three distinct shapes exist in `kit/skills/`, none are literal-relative-path-correct:
1. **`../<slug>/references/x.md` with an `av-` prefix on slug** (15 occurrences) — e.g. `kit/skills/ariadnev/SKILL.md:103-105`, `kit/skills/handover/SKILL.md:60,99,104`, `kit/skills/handover/references/job-spec-template.md:9-11`, `kit/skills/handover/references/runtime-catalog.md:12,30`, `kit/skills/ariadnev/references/chaining-patterns.md:6,74,77`, `kit/skills/plan/SKILL.md:37`, `kit/skills/issue-to-plan/SKILL.md:33`. The written slug (`av-cook`, `av-handoff`, `av-orchestrate`, `av-find-skills`, `av-preview`) never exists as a directory — real dirs are `kit/skills/cook`, `kit/skills/handoff`, etc. (no `av-` prefix; that prefix mirrors the frontmatter `name: av:cook` written path-safe).
2. **Stale `kits/core/skills/<slug>/references/x.md` absolute-style root** (6 occurrences) — `kit/skills/git/references/workflow-merge-pr.md:105`, `kit/skills/ship/SKILL.md:89-90`, `kit/skills/ship/references/ship-workflow.md:197,259-260`. `kits/core/skills/` is a pre-rename repo layout that no longer exists (current root is `kit/skills/`, singular, no `core`).
3. Also present but NOT a link (out of scope for this checker): `kit/skills/team/SKILL.md:116,142,158,174` and `kit/skills/ship/references/ship-workflow.md:366` reference `kits/core/skills/av-journal/SKILL.md` / `.../scripts/post-social.cjs` — cross-skill links to non-`references/` paths. `reference-integrity.ts`'s own charter (its docstring) is `references/<name>.md` only; broadening it to SKILL.md-to-SKILL.md or scripts links is a different, larger check (see Open Questions).

Measured total: 21 candidate occurrences (15+6) vs. the 19 cited in the task — close enough to be the same underlying breakage; exact count will shift as content is edited. Do not treat 19 as a hard target.

### What the regex must become
Keep the existing same-skill regex untouched (backward compatible with 12 existing tests). Add two new regexes, each single-purpose:
```ts
// `../<skill>/references/<file>.md`, any `..` depth; `av-` prefix optional (stripped for lookup).
const CROSS_SKILL_RELATIVE = /(?:\.\.\/)+(?:av-)?([a-z][a-z0-9-]*)\/references\/([A-Za-z0-9._-]+\.md)/g;
// stale pre-rename root, still seen in prose links.
const CROSS_SKILL_STALE_ROOT = /kits\/core\/skills\/(?:av-)?([a-z][a-z0-9-]*)\/references\/([A-Za-z0-9._-]+\.md)/g;
```
Resolution is BY NAME against the kit-wide model (slug + filename lookup), not by literal `fs.existsSync(path.resolve(...))`. Rationale: the checker's job is "does this link's target exist anywhere resolvable in the kit," and literal-path resolution would require the checker to know the emitting file's on-disk depth for zero benefit — the failure mode being caught is "wrong slug / wrong root", which a by-name lookup catches exactly as well while staying pure (no fs calls inside the checker itself).

### What it must NOT flag
- Bare skill-name mentions with no `/references/` suffix (`av:cook`, "the cook skill") — regex requires the literal `/references/*.md` suffix, so these never match. Already handled correctly by the separate `skill-crossrefs.ts` check; do not conflate.
- A skill referencing itself via `../<own-slug>/references/existing-file.md` — resolves fine by construction (self is in the kit-wide map too).
- A skill referencing a name listed in `kit/skills-pending-port.json` (loaded via `pendingPortNames()`, `validate-command.ts:23`) — that skill isn't loaded yet, so its reference-file list is unknown. Skip (do not flag `unknown-skill` or `unknown-file`) — same "not yet ported, not yet checkable" logic already used for `skillref` findings at `validate-command.ts:140`.
- Bare mentions with NO `../` or `kits/core/skills/` prefix at all (e.g. `cook/references/workflow-routing.md` in `kit/skills/find-skills/references/domain-routing.md:13`) — these read as prose identifying a file, not a literal relative path (a real relative link from a sibling skill dir would require `../`). Deliberately out of scope; flagging them risks false positives on legitimate prose.

### Implementation spec
- **New function**, not an overload of `checkReferenceIntegrity` (different input shape — needs kit-wide data + reference-file content, not just one skill's body): `checkCrossSkillReferences(sources: {source: string; content: string}[], skillReferenceFiles: Map<string, Set<string>>, pendingSkillNames: Set<string>): CrossSkillFinding[]` in `packages/cli/src/kit/reference-integrity.ts` (or a sibling file `cross-skill-references.ts` if the file would exceed ~200 LOC — check current length first).
  - `CrossSkillFinding { source: string; raw: string; targetSkill: string; targetFile: string; reason: "unknown-skill" | "unknown-file" }`.
  - `skillReferenceFiles`: `slug -> Set("references/<file>.md")`, kit-wide, built once per `runValidate` call.
- **Caller change**, `validate-command.ts`:
  - Before the per-skill loop (or as a first pass), build `skillReferenceFiles: Map<string, Set<string>>` from `kit.skills` (reuse the same `readdirSync(refsDir)` logic already at lines 142-150, just also stash into the map).
  - Inside the loop, the `sources` array already built at lines 171-177 (for `findUnresolvedSkillReferences`) is exactly the right input — reuse it, call `checkCrossSkillReferences(sources, skillReferenceFiles, new Set(pendingPortNames(kit.root)))`.
  - Push findings with a new `kind: "cross-dangling"`. Message: `` `${finding.source}: ${finding.raw} -> ` `` + (`unknown skill "${finding.targetSkill}"` | `${finding.targetSkill} has no ${finding.targetFile}`).
- **`ValidateFinding.kind` union** (`validate-command.ts:36`): add `"cross-dangling"`.
- **Severity / `--strict`**: always `"error"` (no `level` override), same policy as same-skill `dangling` (only `orphan` is strict-gated for ported content, per the comment at lines 156-168 — a broken link is unconditionally wrong, not an editorial choice). No new `--strict` wiring needed; the existing `ok = !findings.some(error)` and `renderSummary` are generic and already handle any new kind.
- **Test cases** (new, in `reference-integrity.test.ts` or a new `cross-skill-references.test.ts`):
  1. relative + `av-` prefix, target skill+file exist → not flagged.
  2. relative, unknown slug (even after stripping `av-`) → `unknown-skill`.
  3. relative, known slug, missing file → `unknown-file`.
  4. stale `kits/core/skills/` root, resolves → not flagged.
  5. stale root, unknown slug → flagged.
  6. target slug is in `skills-pending-port.json` → not flagged (skip).
  7. mention lives inside a `references/*.md` file's content (not SKILL.md) → still caught — regression test for the "must scan reference-file content too" fix.
  8. bare `av:slug` mention, no `/references/` suffix → not flagged (negative/false-positive guard).
  9. self-reference to own skill's existing file → not flagged.
  - `validate-command.test.ts`: end-to-end fixture kit with one deliberately broken cross-skill link → `av validate` reports `cross-dangling` and `ok:false`; with a valid one → passes.

---

## B. `av recover`

### Evidence
- `ak recover --help`: "Top-level alias for `ak backups restore`... Manifest and restore authority are verified end-to-end before confirmation or mutation." Exit codes: 0/1/2/3(x2)/4(lock held)/5(snapshot not found). Flags: `--allow-root` (repeatable, authorizes project bundle roots), `--dry-run`, `--latest`, `--json`, `--yes`.
- `ak backups --help` confirms `ak recover` and `ak backups restore` are THE SAME OPERATION under two names — ak's own docs call `recover` "a top-level alias... so scripts, docs, and dashboard guidance can use the product verb without a separate recovery path." ak does NOT implement recover as separately-behaving code; it is a UX/discoverability alias, nothing more.
- av equivalent exists at `packages/cli/src/cli/backups-command.ts:52` (`runBackupsRestore`) plus `install/backup.ts` (`backupPath`, `rotateBackups`, manifest). Wired in `register-maintenance-commands.ts:50-67` as `backups restore <timestamp>`.
- The one thing ak's `recover` adds beyond bare `restore` is `--latest` (resolve newest snapshot without knowing its id) and `--allow-root` (multi-root project-bundle authorization — irrelevant to av, which has exactly two scopes, project/global, not arbitrary multi-root bundles per `command-registration-context.ts:3-8`).

### Recommendation: do NOT add a separate `av recover` command
Argued: ak's own docs describe `recover` as a pure alias for discoverability, not distinct behavior — copying the alias without copying ak's `--allow-root` multi-root model (which av's scope model doesn't have) would just be a second name for the same command with no behavioral delta, violating DRY for zero user benefit. The one missing piece worth having — restore-the-newest-snapshot without knowing its timestamp — is a **flag on `backups restore`**, not a new command.

### Implementation spec
- Add `--latest` flag to `backups restore` in `register-maintenance-commands.ts` (around line 50): when set and no `<timestamp>` positional given, resolve the newest dir under `backupsParentDir()` (same sort+reverse logic already in `runBackupsList`, `backups-command.ts:20-23`) and use it as `opts.timestamp`.
- No new `runRecover` function, no new file. Update `README.md`'s command table (`README.md` around the `ariadnev backups` line, exact line TBD at implementation time) to document `--latest`.
- Test: `backups-command.test.ts` — `backups restore --latest` with 3 backup dirs picks the lexicographically-last (timestamp-sortable dir names, confirmed by `backupRelPath`/`rotateBackups` convention in `backup.ts:64-72`); `--latest` with zero backups → same "not found" message path as an unmatched timestamp today (`backups-command.ts:55`).

---

## C. `av backups` full verb set

### Evidence — av's actual manifest shape (`install/backup.ts`)
```ts
interface BackupManifestEntry { originalPath: string; relPath: string; label: string }  // backup.ts:4-10
```
No checksums, no timestamps, no size, no schema version anywhere in the manifest. `readBackupManifest` (line 17) just parses the array; `backupPath` (line 47) appends an entry and rewrites `manifest.json` on every file backed up. `rotateBackups(backupsParent, keep=3)` (line 64) prunes by directory-name sort, fixed `keep=3`, no time-based option.

### ak's verb set vs. what it needs from av's manifest
| ak verb | ak behavior (from `--help`) | Fit against av's manifest |
|---|---|---|
| `create` | DB-aware VACUUM INTO snapshot of "operational.db" | **N/A** — av has no database; av's backups are copies of files (skills/settings/receipt) triggered automatically before a mutating op, not a user-invoked point-in-time DB dump. Do not port this verb; it targets a data model av doesn't have. |
| `list` | newest-first w/ counts | av has it (`runBackupsList`, `backups-command.ts:17`). |
| `prune` | delete by `--older-than` / `--keep-last` | av only has `rotateBackups(keep=3)` auto-called on write, no user-invoked verb, no age-based option. **Missing, portable.** |
| `restore` | restore a snapshot | av has it (`runBackupsRestore`, line 52). |
| `show` | print per-file manifest incl. sha256+size | av's manifest has NEITHER sha256 NOR size (`BackupManifestEntry` above) — `show` as ak does it needs a manifest schema change, not just a new command. **Missing, needs a manifest field addition.** |
| `verify` | recompute sha256 of every file, compare to recorded hash, `ok`/`corrupt` | Same blocker as `show`: **no hash is ever recorded today**. Cannot be implemented against the current manifest without first storing a hash per entry at backup time. |

### Implementation spec
1. **Manifest schema bump** (prerequisite for `show`/`verify`): add `sha256: string` and `size: number` to `BackupManifestEntry` (`backup.ts:4-10`), computed in `backupPath` (line 47) at copy time — for a directory entry (`cpSync(..., {recursive:true})`), hash the concatenation of `relative-path:sha256(bytes)` for every file under it (a single scalar hash for a whole SKILL.md-plus-references tree), not just top-level files. Bump `manifest.json` from a bare array to `{ manifestVersion: 2, entries: BackupManifestEntry[] }` so `readBackupManifest` can distinguish pre-hash manifests (return `[]`, same fail-open behavior it already has for "old layout" per line 16's comment) from post-hash ones — needed so `verify` can say "no hash recorded, cannot verify" instead of false-failing on backups made before this ships.
2. **`backups prune`** verb: new `runBackupsPrune(opts: {home, cwd, scope, olderThan?: string, keepLast?: number, dryRun})` in `backups-command.ts`. Reuse `rotateBackups`'s keep-newest-N logic for `--keep-last`; add age filtering by parsing dir-name timestamp (`YYYYMMDDTHHMMSSZ-<hash>` per `backupRelPath`'s sortable-timestamp convention, `backup.ts:34,64-69`) against `Date.now() - olderThan`. "Most protective wins" when both flags given, matching ak's documented rule.
3. **`backups show <id>`**: new `runBackupsShow(opts)` — read manifest, print each entry's `originalPath`, `relPath`, `label`, and (once schema bump lands) `sha256`/`size`; `--json` support from day one (see item D).
4. **`backups verify <id>`**: new `runBackupsVerify(opts)` — for every entry with a recorded hash, recompute and compare; `ok` only if ALL match AND all entries have a hash (manifests without hashes report a distinct status, e.g. `"unverifiable"`, not `"ok"` — silently passing a hash-less old backup as "ok" would be a false sense of safety).
5. **Do not add `backups create`** — no backing data model; would be dead surface area (KISS/YAGNI even without the flag, since nothing in av produces the point-in-time DB ak's `create` snapshots).
6. **Command wiring**: `register-maintenance-commands.ts`'s `backups` command currently dispatches on a positional `<action>` string (`action === "list"`/`"restore"`, lines 43-70) rather than Commander subcommands. Extend the same `if (action === "prune")` / `"show"` / `"verify"` pattern for consistency with the existing code (do not silently switch to nested `.command()` subcommands — that changes the CLI's argument parsing contract for existing scripts calling `av backups list`/`restore` positionally, which still works either way, but mixing styles inside one command is worse than staying consistent).
7. **Tests**: `backups-command.test.ts` — prune keeps N newest, prune by age, prune with both flags picks max-protective; show renders manifest incl. hash/size once schema bumped; verify reports `ok` for an untampered backup, `corrupt` for a tampered file, `unverifiable` for a pre-schema-bump backup with no hash.

---

## D. `--json` consistency

### Evidence — current `--json` support (grepped every `register-*-commands.ts` + command file)
| Command | `--json`? | Where |
|---|---|---|
| `plan *` (use/show/list/resolve/update/check/uncheck/…) | Yes | `register-tier1-commands.ts` (flag on every subcommand, e.g. line 112) |
| `journal *` | Yes | `register-tier1-commands.ts` |
| `kit install-path` | Yes | README.md:100 |
| `mcp list/show/add/remove/verify` | Yes | README.md:102 |
| `adapters regenerate` | Yes | README.md:103 |
| `config prefs resolve` | Yes | `register-config-commands.ts:14` |
| `validate` / `audit` / `skill` / `contract` / `eval` (harness) | Yes | `register-quality-commands.ts:32,60,88`; `register-harness-commands.ts:188` |
| `run` (graph execution) | Yes | README.md:128-137, "stable JSON envelopes" |
| **`install`** | **No** | `register-install-commands.ts:14-47` — no `--json` option registered at all |
| **`uninstall`** | **No** | `register-install-commands.ts:49-69` |
| **`update`** | **No** | `register-maintenance-commands.ts:72-99` |
| **`list`** | **No** | `list-command.ts` — `runList` returns a bare `string`, no structured result to serialize at all |
| **`migrate`** | **No** | `migrate-command.ts:38` — `runMigrate` returns `{moved, dryRun, summary}` (already structured, just not exposed as `--json`) |
| **`add-skill`** | **No** | `add-skill-command.ts:44` |
| **`backups`** | **No** | `register-maintenance-commands.ts:37-70` |
| **`doctor`** | **No** | `register-maintenance-commands.ts:14-34` — legacy exit-code command (see item F cross-ref), also lacks `--json` |

Confirms the task's "known gaps" list and adds `backups` and `doctor` as also-missing.

### Existing output-envelope helper: NONE
- `src/ui/style.ts` is terminal color/glyph styling only (`coral`, `teal`, `bar`, `shouldColor` — lines 27-70) — not an envelope.
- `src/cli/emit.ts` is the stdout/stderr sink + credential-sanitizer transform point (lines 19-25) — a print function, not a shape.
- No `schema_version`/`envelope` grep hit anywhere in `src/cli/` or `src/` for a *shared* JSON wrapper. `schemaVersion` DOES appear, but as a **domain data field** inside specific artifacts (`install-receipt.ts:69,166,169`, `intent-journal.ts:35,67`, `plan-pointer.ts:14,36,44,51`, `context-query.ts:17,45` etc.) — each artifact versions itself independently; there is no cross-cutting CLI-output contract.
- The closest existing precedent is **per-command, ad-hoc, and inconsistent**: `audit-command.ts:15` exports `AUDIT_PROTOCOL_VERSION = "1"` and emits `JSON.stringify({protocol_version: "1", target: "kit"|"scripts", ...result})` (lines 138-140, 150-151) — flat object, `protocol_version` as a **string**, no `kind` field, no `data` nesting. Every other `--json` command (plan, journal, mcp, config prefs) emits its own ad-hoc shape with no version field at all (not verified line-by-line for all, but none showed a `schema_version`/`protocol_version` pattern in the grep above except audit).

### ak's contract (verified via `ak --help` and live `--json` output)
- Root help: *"Scripted `--json` output is wrapped in a versioned success envelope (`schema_version` + `kind` + `data`)."*
- Confirmed live: `ak audit --json` → `{"schema_version": 1, "kind": "audit", "data": {...}}`; `ak backups list --json` → `{"schema_version": 1, "kind": "backups.list", "data": {"backups": [...]}}`. `kind` is dot-namespaced per subcommand (`backups.list`, presumably `backups.show`, `backups.verify`, etc.) — one envelope shape, one version counter, reused across every command.

### Recommendation: adopt an equivalent envelope, but do it as a NEW helper + migrate incrementally
- **Adopt.** Rationale: av already has 8+ independently-shaped `--json` outputs and zero shared contract; every new `--json` command (this task adds ~7) makes the inconsistency worse and each consumer (scripts, the ariadnev-web dashboard, CI) has to special-case every command's shape. ak's `{schema_version, kind, data}` is simple, already proven, and costs nothing to imitate (it's just a wrapper object).
- **Backward compatibility for `audit`'s existing ad-hoc shape**: `audit-command.ts`'s `{protocol_version, target, ...result}` is a **flat, spread** shape — consumers destructure top-level keys directly (e.g. `result.ok`, `result.entries` sit at the root next to `protocol_version`/`target`). Wrapping it in `{schema_version, kind: "audit", data: {...}}` moves every one of those keys one level deeper — a breaking change for any existing script parsing `av audit --json`. Two honest options, pick one and state it (do not silently ship it):
  1. **Breaking, versioned**: wrap `audit` into the new envelope and bump `AUDIT_PROTOCOL_VERSION` is retired/replaced by `schema_version`; document the shape change in `README.md`/CHANGELOG as a breaking change to `av audit --json` consumers. Justified since av is pre-1.0-in-practice for scripting consumers and the other `--json` commands are equally inconsistent already (nobody could have built robust tooling against ANY one unversioned shape as "the" av contract).
  2. **Non-breaking, dual-run**: keep `audit`'s current flat shape (it already self-versions via `protocol_version`), adopt the new envelope only for NEW `--json` surfaces (install/uninstall/update/list/migrate/add-skill/backups/doctor) and any FUTURE command. Document that `audit` predates the envelope the same way `doctor`/`validate`/etc. predate the new exit-code table (`exit-codes.ts:1-11`, `LEGACY_EXIT_COMMANDS`) — av already has this exact "old commands keep their contract, new ones use the new table" precedent for exit codes, so doing the same for JSON envelopes is consistent house style, not a new idea.
  - **Recommended: option 2.** It mirrors av's own established precedent (`LEGACY_EXIT_COMMANDS`) instead of introducing a one-off breaking change, and every other pre-existing `--json` command (plan/journal/mcp/config) is ALSO unversioned/ad-hoc today — singling out `audit` for a breaking migration while leaving the rest alone is inconsistent. If a full migration is wanted later, do it as one deliberate pass across every `--json` command, not piecemeal.

### Implementation spec
- **New file** `packages/cli/src/cli/json-envelope.ts`:
  ```ts
  export const JSON_ENVELOPE_SCHEMA_VERSION = 1;
  export function jsonEnvelope<T>(kind: string, data: T): { schema_version: number; kind: string; data: T } {
    return { schema_version: JSON_ENVELOPE_SCHEMA_VERSION, kind, data };
  }
  ```
- **`LEGACY_JSON_COMMANDS`** const (mirrors `exit-codes.ts:27`'s `LEGACY_EXIT_COMMANDS`) listing every command whose `--json` predates the envelope: `["plan", "journal", "kit", "mcp", "adapters", "config", "validate", "audit", "eval", "run"]` (i.e., everything currently shipping `--json`) — pin with a regression test the same way `exit-codes.test.ts` pins `LEGACY_EXIT_COMMANDS`.
- **Per-command changes** (all NEW `--json` surfaces, envelope from day one):
  - `install`: `register-install-commands.ts:14-47` — add `.option("--json", ...)`; `runInstall` already returns `{results, summary}` (`install-command.ts:27-30`) — emit `jsonEnvelope("install", {results})` when `--json`.
  - `uninstall`: same file, lines 49-69; `UninstallHandlerResult{outcomes, summary}` (`uninstall-command.ts:19-21`) → `jsonEnvelope("uninstall", {outcomes})`.
  - `update`: `register-maintenance-commands.ts:72-99`; `runUpdate` returns `{exitCode, summary}` only (`update-command.ts:84-87`) — needs a structured field added (e.g. `{currentVersion, target, updated: boolean}`) before it can emit anything useful as `data`.
  - `list`: `list-command.ts:20-45` — `runList` returns a bare string; needs refactor to return `{lines: string[]} `or a real structured shape (`{skills, agents, commands, rules, installState}`) alongside the rendered text, mirroring how `audit`/`install` already separate "structured result" from "summary string".
  - `migrate`: `migrate-command.ts:38` — already returns `{moved, dryRun, summary}`; just wire the flag + `jsonEnvelope("migrate", {moved, dryRun})`.
  - `add-skill`: `add-skill-command.ts:44` — `AddSkillResult{path, slug}` (lines 17-20) already structured; wire flag + `jsonEnvelope("add-skill", {path, slug})`.
  - `backups` (list/restore/show/verify/prune, item C): each `runBackupsX` return already-structured results; wire one shared `--json` option on the `backups` command and switch on `action` to choose the `kind` (`"backups.list"`, `"backups.restore"`, etc., matching ak's dot-namespacing).
  - `doctor`: currently a legacy-exit-code command with no JSON at all; lowest priority (health output is already consumed as text by CI per `exit-codes.ts`'s comment) — add if/when a consumer needs it, not required by this task's explicit gap list.
- **Tests**: one test per command asserting `--json` output parses and has `schema_version`/`kind`/`data` at the top level; a `json-envelope.test.ts` for the helper itself; extend `cli-commands.test.ts` (exists, `cli/cli-commands.test.ts`) if it already enumerates commands/flags.

---

## E. `update-command.ts` hardcoded domain

### Evidence
- `update-command.ts:10`: `const DOMAIN = "https://ariadnev.com";` — no env override. Used at:
  - `fetchLatestVersion` (line 176): `${DOMAIN}/version`
  - `fetchPinnedVersion` (line 181): `${DOMAIN}/version${versionQuery(version)}`
  - Binary download (line 240): `${DOMAIN}/download/${asset}${q}`
  - Checksums fetch (line 240, parallel call): `${DOMAIN}/download/checksums.txt${q}`
- `install.sh:10`: `BASE="${ARIADNEV_BASE_URL:-https://ariadnev.com}"`, used identically for the asset download (line 36) and checksums.txt fetch (line 37).
- Checksum verification is already fail-closed in `update-command.ts:248-252`: binary is REJECTED (`replaceBinary` never called) unless `sha256hex(bytes) === want`. This holds regardless of where bytes came from.
- Established project convention: every existing CLI env var is `ARIADNEV_<PURPOSE>` (`ARIADNEV_CACHE_DIR` — `kit/embedded-kit.ts:20`; `ARIADNEV_EMBEDDED` — same file:119; `ARIADNEV_TELEMETRY_DISABLED` — `register-catalog-commands.ts:39`; `ARIADNEV_BEHAVIORAL_CMD`/`ARIADNEV_BEHAVIORAL_HOME`/`ARIADNEV_EVAL_CMD` — `register-quality-commands.ts:119,140,147`; `ARIADNEV_RUN` — `index.ts:72`; `ARIADNEV_CLI` referenced from a shipped hook script). All of these are subject to `env-scope.ts`'s generic stripper (`stripCwdEnvAriadnevVars`, `env-scope.ts:45-58`), which deletes ANY `process.env` key matching `/^ARIADNEV_/` if that same key is also assigned in a project-local dotenv file — a security control against a hostile repo redirecting ariadnev's own config via a committed `.env`.

### Env var to adopt: `ARIADNEV_BASE_URL` (reuse install.sh's name, do not invent a second one)
Consistency argument: this is the exact same "which edge do I talk to" knob install.sh already exposes; using a different name in the compiled binary (e.g. `ARIADNEV_UPDATE_URL`) would mean the shell installer and the self-updater disagree about which env var controls the same concept, which is the exact inconsistency the task is asking to close.

### Security consideration
- Redirecting `BASE_URL` alone does NOT bypass checksum verification — an attacker who can only set the env var (not control the target server) still needs the redirected server's `checksums.txt` to match a malicious binary's hash, which they cannot forge without also controlling the binary being served (same trust boundary install.sh already accepts today: whoever controls `${BASE}/download/*` controls what gets installed, checksum-consistent or not). This is not a NEW risk class — it is the same one `install.sh` already ships with; extending it to `av update` does not lower the bar further.
- The one thing that DOES matter: `ARIADNEV_BASE_URL` gets automatic protection for free from `env-scope.ts`'s generic prefix-match stripper — no code change needed there, since it strips any `ARIADNEV_*` key, not a hardcoded list. Confirm this with a test (see below) rather than assuming.
- Do NOT read the env var mid-request-by-mid-request — read once at the top of `runUpdate` (or in `realUpdateDeps`) into an opts field, consistent with how `UpdateHandlerOpts` already threads config in explicitly (testability: tests construct `opts` directly today, an ad-hoc `process.env` read inside `fetchLatestVersion`/`fetchPinnedVersion` would break that pattern and make them untestable without env mutation).

### Implementation spec
- `update-command.ts`: replace module-level `const DOMAIN` usage with a `baseUrl` value threaded through `UpdateHandlerOpts` (new field `baseUrl: string`, populated by the caller as `process.env.ARIADNEV_BASE_URL ?? "https://ariadnev.com"`) — OR keep `DOMAIN` as the compiled-in default and add a `resolveBaseUrl(env): string` pure helper (`env.ARIADNEV_BASE_URL ?? DOMAIN`) called once in `register-maintenance-commands.ts`'s `update` action and passed into `runUpdate`. Prefer the latter: keeps `fetchLatestVersion`/`fetchPinnedVersion`/`downloadBytes`/`downloadTextAsset` (currently free functions closing over `DOMAIN` implicitly via string templates built by their callers) as pure functions of their arguments — needs those functions' call sites (lines 176, 181, 240) to interpolate `opts.baseUrl` / the resolved value instead of `DOMAIN`, which the existing `UpdateDeps` indirection already supports (they're invoked as `deps.fetchLatestVersion()` with no args today — **this signature has no way to receive baseUrl**, so `fetchLatestVersion`/`fetchPinnedVersion` need a `baseUrl` parameter, and `realUpdateDeps()` needs to accept/close over it).
- Concretely: `realUpdateDeps(baseUrl: string): UpdateDeps` (was `realUpdateDeps(): UpdateDeps`, line 145) closing over `baseUrl` instead of the module const; `fetchLatestVersion(baseUrl: string)`, `fetchPinnedVersion(version, baseUrl: string)` (lines 175, 180); the two `deps.downloadBinary`/`deps.downloadText` calls at line 240 already take a fully-formed URL string as their argument, so those two just need their URL template's `${DOMAIN}` swapped for the resolved `baseUrl` — no signature change needed there, only the caller inside `runUpdate` needs `opts.baseUrl` (or `deps` needs `baseUrl` baked in via a closure from `realUpdateDeps(baseUrl)`).
- `register-maintenance-commands.ts`'s `update` action (line 78): `realUpdateDeps(process.env.ARIADNEV_BASE_URL ?? "https://ariadnev.com")`.
- **Tests**: `update-command.test.ts` — (1) `ARIADNEV_BASE_URL` set → `fetchLatestVersion`/binary download/checksums all hit the overridden host (assert via injected `deps` spies, not real network); (2) unset → falls back to `https://ariadnev.com`; (3) checksum mismatch against an overridden host still aborts (`replaceBinary` not called) — proves fail-closed holds regardless of source host; (4) a project `.env` naming `ARIADNEV_BASE_URL` is stripped by `scopeProcessEnv()` before `update` runs — extend `env-scope.test.ts` (if it doesn't already generically cover any new `ARIADNEV_*` var, which per the prefix-match implementation it should without changes — write the test to confirm rather than assume).

---

## F. Install-lifecycle locking

### Evidence
- `grep` for lock primitives in `src/install/`: **zero** — confirmed empty, no `O_EXCL`, no `.lock`, no `flock` usage anywhere under `install/`.
- `src/skill-env/lockfile.ts` is **not a process/advisory lock** — it's a Python dependency-pin file format (PEP 508 marker validation, sha256-per-package, `lockDigest`, `toPipRequirements`; lines 1-149). Despite the filename, it shares nothing structurally or behaviorally with a filesystem mutex. **Not reusable.** Do not let the name mislead the implementer.
- Concurrency today is per-file only: `fs-atomic.ts:10-30`'s `atomicWrite` does temp-write + `renameSync`, which prevents a torn/partial WRITE to a single file but does nothing to prevent two concurrent `av install` processes from interleaving MULTIPLE file writes, backup rotation, and receipt updates — a classic multi-step-operation race, not a single-write race.
- Scope model is exactly two roots (`command-registration-context.ts` / used throughout): `scope: "project" | "global"`, root = `scope === "global" ? home : cwd`. No arbitrary multi-root bundles (unlike ak's `--allow-root`). This simplifies lock placement enormously: **one lock file per scope root**, not a registry of many.
- Existing `.ariadnev/` scope-root convention already used for backups (`backups-command.ts:11-14`, `<root>/.ariadnev/backups`) and the receipt (`audit-command.ts:57`, `<root>/.ariadnev/receipt.json`) — a `.ariadnev/locks/` sibling directory is the obviously consistent placement, not a new convention.
- README's exit-code table (`README.md:109-120`, mirrored in `exit-codes.ts:13-22`): `0` ok, `1` failed/negative-result, `2` usage, `3` unavailable. `UnavailableError` (`exit-codes.ts:37-43`) already exists for exactly "the command could not run because the environment is not ready" — a held lock is precisely that condition, not a usage error and not a negative-but-completed check. **Use exit code 3 / `UnavailableError`**, do not invent a new code (ak uses `4` for "another operation holds the lock", but av's table has no `4` slot defined — reusing `3` fits the existing table's own definition verbatim and avoids extending a table `exit-codes.ts:1-11`'s own comment says is deliberately narrow and documented).

### Design
- **Primitive**: `O_EXCL` exclusive-create lockfile containing `{pid, startedAt}` JSON, written via `fs.openSync(path, "wx")` (fails if the file exists — atomic create-if-absent, the standard cross-platform-safe primitive; works identically on darwin/linux/windows, unlike `flock()` which isn't portable to Windows without extra native deps — and av already ships 5 targets including windows-x64). Verified as the "usual answer" for this exact use case; no npm dependency needed (fits av's ship-as-single-binary, no-native-deps constraint the Bun-compile requires).
- **Location**: `<scopeRoot>/.ariadnev/locks/kit-lifecycle.lock`, where `scopeRoot` = `scope === "global" ? home : cwd` — same resolution every other scoped command already uses. One lock per scope (a project install and a `--global` install never contend, correctly — they touch disjoint file trees).
- **Commands that must take it**: `install`, `uninstall`, `update`, `migrate`, `backups restore` (and, once item C ships, `backups prune` — also mutates), `adapters regenerate`. Read-only commands (`list`, `doctor` without `--fix`, `validate`, `audit`, `backups list/show/verify`) do NOT need it.
  - `doctor --fix` DOES mutate (`doctor-command.ts:110`, re-merges hook bindings) — include it.
- **Stale-lock recovery**: on `wx` failure, read the existing lock's `pid`; if `process.kill(pid, 0)` throws `ESRCH` (process doesn't exist), the lock is stale — delete and retry acquisition once. Add a hard staleness ceiling too (e.g. lock older than N minutes by `startedAt`, even if the pid happens to be reused by an unrelated process) as a second, independent check — pid-liveness alone is not suffient on systems that reuse pids quickly.
- **Behavior when held (live process)**: **fail fast**, exit code 3, do not wait/poll. Rationale: these are short-lived, interactive, human-invoked commands (install/uninstall/update/migrate) — a silent wait risks a CI job or a script hanging with no feedback; ak's own `--help` text shows it ALSO fails fast (exit `4`, "another operation already holds the lock" — no wait/retry language anywhere in the `--help` output for `recover`/`prune`). Matches precedent, keeps the implementation trivial (no timeout/backoff logic to get wrong).
- **Release**: `finally`-block delete after the command's real work completes (success or thrown error) — must not leak on an exception. Wrap at the single point where all six commands already funnel through `program.opts()` + `context` (each command's `.action()` in its `register-*.ts` file) — no shared "run a mutating command" abstraction exists today, so the lock acquire/release has to be added at each of the 6 call sites individually, OR (cleaner, less repetition) as a small wrapper `withKitLifecycleLock(scope, home, cwd, fn)` used by all six.

### Implementation spec
- **New file** `packages/cli/src/install/lifecycle-lock.ts` (~60-80 LOC, fits the project's <200 LOC-per-file convention from CLAUDE.md):
  ```ts
  export interface LockHandle { release(): void }
  export class LockHeldError extends Error { readonly exitCode = EXIT.unavailable; ... }
  export function acquireLifecycleLock(scopeRoot: string, opts?: { staleMs?: number }): LockHandle; // throws LockHeldError if held and not stale
  export function withLifecycleLock<T>(scopeRoot: string, fn: () => T): T; // acquire, run, release in finally
  ```
  - Lock content: `JSON.stringify({pid: process.pid, startedAt: new Date().toISOString()})`.
  - Default staleness ceiling: propose 15 minutes (longest realistic install/update duration; confirm against any existing timeout constants in the codebase before finalizing — `update-command.ts`'s own network timeouts are 3s/15s/60s, so 15 minutes is generous headroom above the slowest single network call, times a few retries).
- **Wire into**: `register-install-commands.ts` (install, uninstall), `register-maintenance-commands.ts` (update, backups restore, doctor --fix), `migrate-command.ts` (migrate), `register-tier1-commands.ts` (adapters regenerate, line ~434-459). Each wraps its existing body in `withLifecycleLock(scopeRoot, () => { ...existing action... })`.
- **Tests**: new `lifecycle-lock.test.ts` — acquire twice in-process → second throws `LockHeldError` with `exitCode === 3`; stale lock (fake old `startedAt` + a pid confirmed not running, e.g. `999999` or a just-exited child) → second acquire succeeds after cleanup; release always removes the file even when `fn` throws. Integration: one test per wired command asserting a held lock produces exit code 3 and does NOT touch any target files (e.g. `install` with a pre-existing lock leaves the receipt untouched).
- **`--dry-run` interaction**: `--dry-run` runs already log-only (no writes) — decide whether dry-run still takes the lock. Recommend **no**: a dry-run makes no on-disk changes, so it cannot race with a concurrent real mutation in any way that matters, and forcing it to wait/fail behind a live lock would make `--dry-run` less useful as a "check what would happen right now" tool. State this explicitly in the PR/docs since it's a judgment call, not a fact derivable from the code.

---

## Phase ordering

**Independent** (any order, no shared files beyond `register-*-commands.ts` edits which don't collide across items since each touches different commands):
- **A** (cross-skill link checking) — touches `kit/reference-integrity.ts` + `cli/validate-command.ts` only.
- **E** (update domain env var) — touches `cli/update-command.ts` + `cli/register-maintenance-commands.ts` only.
- **F** (locking) — touches a new file + six `register-*.ts` action bodies (additive wrapping, low collision risk).

**Sequenced**:
1. **C before B**: B's only real change (`--latest` flag on `backups restore`) is trivial either way, but C changes the manifest schema (adds `sha256`/`size`, bumps to `{manifestVersion: 2, entries: [...]}`) which `runBackupsRestore` (item B's target) reads via `readBackupManifest` — do C's schema bump first so B is written against the final manifest shape, not against a shape that changes under it a phase later.
2. **C before D** (for the `backups` subset of D): D wires `--json` onto whatever verbs exist; adding `--json` to `list`/`restore` now and then to `show`/`verify`/`prune` later (once C ships them) is fine and doesn't require re-sequencing, but the ENVELOPE HELPER (`json-envelope.ts`) should exist before either C's or D's command wiring lands, since C's new verbs (`show`, `verify`, `prune`) will want `--json` immediately per ak parity — do the helper first, then C's verbs with `--json` built in from the start (cheaper than retrofitting).
3. **D's envelope helper before D's per-command rollout** — obviously; listed for completeness since D is one item with an internal two-step order (helper, then 7+ call sites).
4. **F should land last** among the mutating-command items (B/C install-adjacent bits), since F wraps the ACTION BODY of `install`/`uninstall`/`update`/`migrate`/`backups restore`/`adapters regenerate` — landing F after B/C/E's command-body changes are in avoids rebasing the lock-wrapper around a body that's still being edited by three other in-flight items.

Recommended sequence: **A, E** (parallel, independent) → **json-envelope helper (part of D)** → **C** (manifest bump + new verbs, with `--json` built in) → **B** (`--latest` flag, trivial) → **D remainder** (install/uninstall/update/list/migrate/add-skill `--json`) → **F** (lock-wrap everything, last, since it touches every mutating command surface all the other items just finished changing).

## Open questions
1. Item A: should `reference-integrity.ts`'s charter widen to catch cross-skill links to `SKILL.md` itself and to `scripts/*` (found at `kit/skills/team/SKILL.md:116,142,158,174` and `ship/references/ship-workflow.md:366`, both using the same stale `kits/core/skills/` root)? Currently out of scope per the module's own stated purpose (`references/<name>.md` only) — flagging here since it's the same root cause and an implementer may reasonably want to fix all of it in one pass.
2. Item C: exact hash strategy for directory-shaped backup entries (whole-skill-dir copies) — one hash over a canonical manifest-of-file-hashes (git-tree-hash style) vs. per-file hash entries (changes `BackupManifestEntry` from one entry per top-level target to one per physical file, a bigger schema change). Needs a decision before implementing `verify`.
3. Item D: which option for `audit`'s envelope (breaking migrate vs. leave as legacy) — recommended option 2 above (leave as legacy) but this is a judgment call the user/maintainer should confirm, not something derivable from the code alone.
4. Item F: exact staleness timeout value (15 min proposed) and whether `--dry-run` should skip the lock — both are judgment calls flagged above, not facts.
5. Did not verify: whether `ariadnev-web` (the dashboard) already consumes any `--json` output and would be affected by envelope changes — out of scope for this CLI-only research pass but relevant before shipping D.

Status: DONE
Summary: Researched all six operational gaps (cross-skill link checking, av recover, backups verb set, --json envelope consistency, update-command domain override, install-lifecycle locking) with file:line evidence and concrete per-item implementation specs; report written to plans/reports/researcher-260822-1400-operational-gaps.md.
Concerns/Blockers: none — five open judgment calls listed at report end need a maintainer decision before implementation, not blocking further research.
