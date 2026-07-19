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

## Phase 2: Doctor — TBD (filled when phase 2 lands)

ck capabilities to address: `--report`, `--fix`, `--check-only` (CI mode,
exit 1 on failure), `--full`, `--json`; skill-listing budget checks specific
to ck's own config format (not applicable to vcskill — no skill-listing
budget concept in this kit).

## Phase 3: Uninstall — TBD

ck capabilities to address: `--local`/`--global`/`--all`/`--kit <type>`
scope options, `--dry-run`, `--force-overwrite`, `-y/--yes`, ownership-aware
preservation of user-modified files.

## Phase 4: Backups/update — TBD

No direct ck equivalent for `backups list/restore` (ck has no backup
mechanism in its help output). `update` vs ck's `update` (CLI-tool-only,
does not touch kit content) — vcskill's updates both the CLI and offers to
re-sync kit content, a broader scope stated explicitly as a difference, not
an oversight.

## Unresolved questions

None yet — updated per phase.
