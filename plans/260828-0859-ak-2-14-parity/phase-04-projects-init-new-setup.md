---
phase: 4
title: "projects, init, new, setup"
status: pending
priority: P1
effort: "3-5d"
dependencies: [1, 3]
---

# Phase 4: `projects`, `init`, `new`, `setup`

## Overview

ariadnev has no `init`. AgentKit's `init`, `new`, `projects`, and `uninstall` are
one system held together by an **ownership manifest**: `init` records what was
written, `update` refreshes only unmodified files, `uninstall` deletes only what
it owns, `projects` indexes the initialized directories. Porting any one alone
gives a command that cannot make its central safety guarantee.

`setup` joins them here because it writes the config those commands read.

## Requirements

**Functional**
- `av init [dir]` — idempotent, tracking managed files. `--dry-run`, `--force`,
  `--plans-dir`, `--docs-dir`, `--project-id`, `--no-backup`.
- `av new <name>` — scaffold a fresh project, then `init` it.
- `av projects list|add|remove|show|prune` over a global registry.
- `av setup` — first-run wizard writing enabled adapters, default kit, defaults.
- `av uninstall` extended to be ownership-aware.

**Non-functional**
- **Ownership comes from the receipt, never a directory listing.** The constraint
  `260822-1407` adopted after its red team found a migration that would have
  renamed 30 third-party directories. It binds hardest here, because `uninstall`
  deletes files.
- A snapshot before any deletion, `--force` included.
- Preview by default. Nothing written or deleted without `--yes` or an
  interactive confirmation.
- Registry writes atomic and locked, reusing `260822-1407` phase 7's lifecycle
  lock rather than a second locking scheme.
- `setup` writes **no** auth material — out of scope.

## Architecture

**Oracle.** `~/.agentkit/projects.json` is plain JSON with a sibling
`projects.json.lock`; `ak projects list` printed two projects with name, dir,
registered date, updated date. No database. `ak init --help` states it "tracks
managed files under project `.agentkit/`, `kits/`, and `.claude/` subtrees".
`ak uninstall --help` gives the classification verbatim — reproduced below.

**`init` vs `install`.** AgentKit has both: `init` sets up a project's managed
files, `kit install` places kit content. ariadnev's `install` currently does both.
Resolution: **`av init` wraps the existing install internals — it does not fork a
second installer.** `install`'s semantics are unchanged and its tests stay
untouched and green; `init` is additive and delegates.

**The classification table**, from the oracle:

| State | Definition | `update` | `uninstall` |
|---|---|---|---|
| clean | in manifest, hash matches | overwrite | delete |
| modified | in manifest, hash differs | skip unless `--force` | refuse unless `--force` |
| orphan | in dir, not in manifest | ignore | **report only, never delete** |
| missing | in manifest, gone | recreate | skip |

The orphan row is the one that matters. It is what stops ariadnev deleting a file
it did not create, in a root already measured at 131 entries of which 30 belong
to other tools.

**`setup`** uses `@clack/prompts ^0.8.2` — already a dependency. Its `--step`
surface lets a single field be updated without re-running the wizard; match that,
minus every auth-related step.

## Related Code Files

- Create: `packages/cli/src/cli/init-command.ts` + test
- Create: `packages/cli/src/cli/new-command.ts` + test
- Create: `packages/cli/src/cli/projects-command.ts` + test
- Create: `packages/cli/src/cli/setup-command.ts` + test
- Create: `packages/cli/src/install/ownership-manifest.ts` + test
- Create: `packages/cli/src/install/file-classification.ts` + test
- Modify: `packages/cli/src/cli/uninstall-command.ts` — ownership-aware
- Modify: `packages/cli/src/cli/update-command.ts` — respect classification
- Modify: `packages/cli/src/cli/register-install-commands.ts`
- Modify: `packages/cli/src/install/install-receipt.ts` — reconcile with the manifest
- Modify: `packages/cli/src/activity/event-types.ts` — project lifecycle events
- Modify: `parity-manifest.json`

## Implementation Steps

1. **Oracle observation.** Capture `ak init|new|projects|setup|uninstall --help`
   and a `ak projects list --json` envelope into this phase file.
2. Read the existing receipt and intent-journal implementations end to end.
   The ownership manifest **extends** them; two competing records of what
   ariadnev owns is strictly worse than one.
3. Failing tests first for `file-classification.ts`, all four states, with the
   orphan case asserting **no deletion under any flag combination, `--force`
   included**. That is the phase's safety property — write it before the code
   that could violate it.
4. Implement `ownership-manifest.ts`: content hashes, atomic write, versioned
   schema so a format change is detectable rather than silent.
5. Implement `av init`: idempotent, preview-by-default in non-TTY, snapshot
   before mutation, honoring the four path/id flags. Delegates to install
   internals.
6. Implement `av projects` over a locked `projects.json`, reusing the phase-7
   lifecycle lock.
7. Implement `av new` as scaffold-then-`init`. Keep it thin — a divergent second
   scaffolding path is a maintenance trap.
8. Implement `av setup` with `@clack/prompts`, `--step`, `--no-interactive` +
   `--config`. Adapter list comes from phase 1's provider set; no auth steps.
9. Make `av uninstall` ownership-aware. Snapshot before deletion,
   unconditionally — `--force` changes *what* is deleted, never *whether* a
   snapshot was taken.
10. Wire `av update` to the classification so user-modified files survive.
11. Emit activity events for init, uninstall, and registry mutations.

## Success Criteria

- [ ] `av init` idempotent — a second run changes nothing
- [ ] All four classification states behave per the table, asserted
- [ ] **Orphan files never deleted, under any flag combination**
- [ ] A snapshot exists before every deletion, `--force` included
- [ ] `av projects` full lifecycle against a locked registry
- [ ] Concurrent `av init` runs do not corrupt the manifest
- [ ] `av setup --no-interactive --config` writes config without a TTY
- [ ] `setup` writes no auth material
- [ ] Existing `av install` **behavioral** tests untouched and green. Receipt-schema
      tests may gain cases; they must not lose assertions
- [ ] `pnpm test` green

## Risk Assessment

**`uninstall` deletes the wrong file.** The highest-consequence code in the plan.
This project has already had one live installer RCE and one migration design that
would have renamed 30 third-party directories.
*Signal:* any test where a file absent from the manifest is deleted.
*Response:* step 3 writes that test first. Beyond it: preview default, snapshot
always, orphans reported and never touched. Ambiguity means refuse and tell the
user — refusing is recoverable, deleting is not.

**Two ownership records drift.** The existing receipt and a new manifest
disagreeing about the same file.
*Signal:* a file classified clean by one and orphan by the other.
*Response:* step 2 merges them. If they genuinely cannot merge, the receipt is
authoritative and the manifest is a projection — decided now, not discovered
during an `uninstall`.

**Registry corruption under concurrency.** Two `av init` runs writing
`projects.json` at once.
*Signal:* malformed JSON or a lost entry.
*Response:* reuse the existing lifecycle lock; the concurrency test is a success
criterion, not an afterthought.

**`init` changes `install` behavior for existing scripts.**
*Signal:* an existing `av install` invocation behaves differently.
*Response:* `init` delegates; install semantics unchanged. Proven by leaving the
existing install **behavioral** tests untouched — if one of those needs editing,
the delegation is wrong. Receipt-schema tests are a separate matter: this phase
extends the receipt, so those may legitimately gain cases. The line is that they
never *lose* an assertion, since that is how a safety property disappears while
the suite stays green.

**`uninstall` and `update` change behavior for existing users, in a minor
release.** Both are already-shipped top-level commands, and this phase makes
`uninstall` refuse modified files and `update` skip them. Correct changes, but
they are exactly what the plan's semver-honesty constraint covers.
*Signal:* either behaves differently with no warning on the changed path.
*Response:* emit a one-release deprecation-style warning when the new
classification actually changes the outcome, and list both in the 1.3.0 release
notes. They are not free just because they are safer.
