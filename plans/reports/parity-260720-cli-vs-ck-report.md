# Parity: vcskill CLI v2 (receipt/doctor/uninstall/backups/update) vs ck CLI

Date: 2026-07-20 | Plan: `plans/260720-0116-vcskill-cli-v2-receipt-doctor-uninstall/`
Filled in across phases 1-4. `ck --help` + `ck doctor --help` + `ck uninstall --help` read for real capability lists.

## Phase 1: Install receipt (foundation)

No direct ck equivalent — ck has no single ownership manifest; its
"ownership-aware uninstall" (see below) implies per-file tracking but the
mechanism isn't user-inspectable. vcskill's `.vcskill/receipt.json` is a
plain, readable JSON file: every write records a portable path + sha256
content hash at install time.

**Why the hash matters (sets up the phase-3 parity claim)**: `ck uninstall`
docs state "Only CK-installed files that haven't been modified are removed.
User-created files and modified files are preserved" — i.e. ck already does
modification detection, just opaquely. vcskill's receipt makes the same
capability transparent and testable: phase 3's uninstall will compare a
file's current content hash against the recorded one and skip/warn on drift,
with a test proving it. The parity target isn't "ck has nothing here" — it's
"do the same job, but inspectable and machine-verified."

Evidence: `packages/cli/src/install/install-receipt.ts` +
`install-receipt.test.ts` (12 tests), sandbox install produced a real receipt
with 76 hashed files.

## Phase 2: Doctor (`vcskill doctor [--global]`, 4h)

| ck capability | vcskill doctor |
|---|---|
| `--check-only` (CI mode: no prompts, exit 1 on failure) | ✅ default behavior — doctor is always non-interactive with a scriptable exit code (0/1/2) |
| Health checks (files present, config sane) | ✅ receipt-based: every file doctor checks is one vcskill itself wrote, verified to exist + (for hooks) actually executable via a real spawn — not a heuristic scan of "does this look like our stuff" |
| `--fix` (auto-fix fixable issues) | ➡️ bỏ có lý do: v1 doctor is diagnose-only; auto-fix would mean re-running install/uninstall logic blind — safer to report and let the user run `vcskill install`/`update` explicitly |
| `--report` (shareable diagnostic report) | ➡️ bỏ có lý do: the plain-text summary IS the report; no separate artifact format needed for a CLI this size (YAGNI) |
| `--full` (extended priority checks) | ➡️ bỏ có lý do: no tiered check levels in v1 — one check pass covers files/hooks/bindings/version |
| `--json` | ➡️ bỏ có lý do: not requested by any consumer yet; the `DoctorHandlerResult` return shape is already structured, JSON output is a thin follow-up if needed |
| Skill-listing budget checks (ck-specific: 200k context floor, 512-char description cap) | ➡️ bỏ có lý do: no equivalent concept in vcskill's skill model — this is entirely a ck config-schema feature |

**Điểm vượt** (proven by test, not just claimed): `diagnose()` compares the
receipt's recorded file list against the real filesystem AND spawns each
recorded hook file to confirm it actually runs (`hookExecutable`), AND
verifies each `applied:true` hook binding is still present in
`settings.json` — three distinct failure modes ck's health check doesn't
enumerate. Real sandbox run confirms all three states (`not-installed` exit
2, `healthy` exit 0, `degraded` exit 1 naming the exact missing file).

Evidence: `packages/cli/src/doctor/diagnose.ts` + `diagnose.test.ts` (12
tests, all failure branches covered), `doctor-command.ts` +
`cli-commands.test.ts` (3 integration tests using a real install +
real file deletion), manual CLI run across all 3 states.

## Phase 3: Uninstall (`vcskill uninstall [--provider id,id] [--global] [--dry-run]`, 5h)

| ck capability | vcskill uninstall |
|---|---|
| `--dry-run` (preview, no deletion) | ✅ kept — plans and reports removed/preserved counts, zero fs writes |
| `-y/--yes` (skip confirmation) | ➡️ bỏ có lý do: v1 uninstall is always non-interactive (matches ck's `--yes` behavior by default) — an interactive confirmation prompt is a thin CLI-layer addition deferred, not a missing capability |
| `-l/-g/-A` (local/global/all scope) | ✅ `--global` kept (project is default, matching install's own scope flag); `--all` (both scopes in one call) not implemented — v1 requires two invocations, one per scope, which is the honest reflection of "each scope has its own receipt file" |
| `-k, --kit <type>` (uninstall one named kit, e.g. marketing) | ➡️ bỏ có lý do: no multi-kit concept in vcskill — one canonical `kit/`, filtering is by `--provider` instead |
| `--force-overwrite` (delete even user-modified files) | ➡️ bỏ có lý do (deliberately, not an oversight): v1 never force-deletes a modified file under any flag — the plan's stated risk mitigation ("rm nhầm file user" is the single highest risk) rules this out; a future `--force` could be added but was not requested |
| **Ownership-aware**: "Only CK-installed files that haven't been modified are removed. User-created files and modified files are preserved" | ✅ **matched and made verifiable**: every receipt file carries a sha256 recorded at install time; uninstall recomputes the hash and skips (preserves) any file that differs — proven by a real test that edits a file after install and confirms it survives uninstall untouched |

**Điểm vượt** (the central claim of this whole CLI plan, now proven):
1. **Modification detection is inspectable, not opaque.** ck's mechanism for
   "hasn't been modified" isn't documented; vcskill's is a plain sha256 in a
   JSON file anyone can read.
2. **Round-trip correctness proven byte-exact**, not just "preserves stuff
   generally": a real sandbox test installs claude-code into a project with
   pre-existing `settings.json` (user's `model` field + a foreign `Stop`
   hook), confirms the merge actually happened, uninstalls, and asserts the
   settings file is deep-equal to the original. Same for codex's `AGENTS.md`
   managed-block round-trip (string-exact, not just deep-equal). A live CLI
   run reproduced the same result outside the test suite.
3. **Bounded directory cleanup**: only removes a now-empty artifact directory
   and its own subdirectories, never the kind-root (`skills/`, `agents/`) or
   the provider directory (`.claude/`) itself — tested explicitly, since an
   unbounded cleanup was identified as a real risk during design.
4. **Path-traversal guard reused verbatim from install** (`assertWithinRoots`,
   extracted to `path-guard.ts` specifically so uninstall and install share
   one security boundary instead of two copies that could drift).

Evidence: `hook-settings-merge.test.ts` (+6 unmerge tests), `agents-md.test.ts`
(+3 round-trip tests), `uninstall-plan.test.ts` (9 tests),
`uninstall-execute.test.ts` (7 tests), `cli-commands.test.ts` (+5 integration
tests: nothing-to-do, claude-code round-trip, codex round-trip, modified-file
preservation, dry-run no-op), plus a live CLI smoke reproducing the
claude-code round-trip outside the test suite.

## Phase 4: Backups/update — TBD

No direct ck equivalent for `backups list/restore` (ck has no backup
mechanism in its help output). `update` vs ck's `update` (CLI-tool-only,
does not touch kit content) — vcskill's updates both the CLI and offers to
re-sync kit content, a broader scope stated explicitly as a difference, not
an oversight.

## Unresolved questions

None yet — updated per phase.
