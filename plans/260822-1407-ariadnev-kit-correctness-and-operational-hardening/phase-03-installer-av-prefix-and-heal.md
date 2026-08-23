---
phase: 3
title: "Installer av- prefix and heal"
status: completed
priority: P1
effort: "3-4d"
dependencies: [1]
---

# Phase 3: Installer av- prefix and heal

## Debt phase 1 handed you

Phase 1 rewrote the corpus to `(../)+av-<slug>/…` and gated new content on that
shape. Nothing produces that layout yet: `resolver.ts:239` returns
`join(base, cfg.skillDir, artifact.name)` with a bare slug, and `adaptText` does
not rewrite these paths. Measured against a real `install --provider claude-code`:
**0 of 105 installed skill dirs carry the prefix, and 0 of 28 prefixed links
resolve.**

Two of those links resolved before phase 1 — `find-skills/references/domain-routing.md`
and `preview/references/visual-explanation-routing.md` were unprefixed and
correct against today's layout. Converting them was required, because phase 3
would otherwise break them, but it means phase 1 nets **−2 working links** and
the balance is not paid until this phase lands.

The release cut in phase 5 happens **before** this one in the execution order. It
will ship a kit whose cross-skill links are uniformly unresolvable — 30 broken
rather than the 28 that were broken before phase 1. Marginal, and deliberate, but
do not describe that release as having fixed link integrity.

`av validate` says `all checks passed` throughout, by design: the shape rule
warns on the form that works today and passes the form that does not. That is the
staging the severity table chose, and it is only honest while this phase is
actually scheduled.

## Overview

Make the installer write `av-`-prefixed skill directories, so the 15 prefixed
cross-skill links resolve and ariadnev namespaces itself in the roots it
co-tenants. The resolver edit is one guarded line. **The heal is the phase.**

No renaming migration ships. See the plan index's "Corrections" — the draft's
enumeration design would have renamed 101 AgentKit directories and 30
third-party directories.

## Requirements

**Functional**
- `targetFor(skill)` returns `<base>/<skillDir>/av-<name>`; the empty-name root
  query still returns the bare root.
- `av install` heals a pre-prefix layout from the receipt, before overwriting it.
- Heal is safe: backed up, crash-recoverable, root-guarded, hash-respecting, and
  aware that four providers share one physical root.

**Non-functional**
- **Never touch a path not recorded in a receipt.** No directory enumeration.
- Heal must not delete a path another provider's record still claims.

## Architecture

### The one-line fix and its trap

`resolver.ts:239` is the only place a canonical name becomes an on-disk dir name.
But `targetPathFor` (`resolver.ts:172-180`) queries the skill *root* via
`mk("skill", "")`, powering the README matrix, `av contract --json`,
`av kit install-path`, and `e2e-install.test.ts:74-89`. A naive
`"av-" + artifact.name` renders the root as `.../skills/av-`. Guard it:
`artifact.name ? \`av-${artifact.name}\` : ""`.

### Prefix every provider

Under `--global`, codex/cursor/antigravity/generic all write the *same physical*
`~/.agents/skills`. Measured there: 131 entries, 101 `ak-*`, 30 unprefixed
third-party, 0 `av-*`. `~/.claude/skills` likewise holds `ak-*`, four Anthropic
built-ins, and 10 symlinks. Prefixing is the observed norm for every shared root,
and one rule beats six special cases.

### Why heal is necessary

`install-receipt.ts:174-176` replaces each provider's record **wholesale**. After
a fresh install under the new resolver, `files[]` holds only `av-cook/…`. The old
paths leave the record with nothing referencing them, and every diagnostic is
then structurally blind: `uninstall-plan.ts:131` iterates `install.files`;
`audit.ts:74-80` builds `ownedDirs` from dirnames of *tracked* files, so it never
visits the old dir; `diagnose.ts:72-81` only checks recorded files exist.
Orphaning is the default outcome, not a risk.

### Heal's five hard requirements

The draft specified "read prior receipt, remove no-longer-targeted paths by
recorded hash". Reviewers found five ways that loses data.

1. **Back up before deleting, into a directory rotation cannot reach.** The only
   slot where the prior receipt is still readable (`install-execute.ts:151`) is
   *after* `rotateBackups` (`:149`), and `applyOp` only backs up files that
   already existed at the destination — a new `av-cook/SKILL.md` backs up
   nothing. So the pre-prefix tree would be deleted with **zero recoverable
   copy**. Heal must back up the legacy directory explicitly, before rotation.
   **And the heal backup must be exempt from `rotateBackups(parent, keep = 3)`**
   (`backup.ts:64-70`, prunes by lexicographic sort): a heal backup left in the
   normal rotation set silently expires after three more mutating runs, which
   would quietly void phase 4's rollback recipe weeks after the rollout. Write it
   to a distinctly-named sibling directory the rotation glob does not match.
2. **Survive a kill.** Between deletion and `atomicWrite(rPath)` (`:158`) the
   on-disk receipt describes files that no longer exist and omits the ones that
   do. `readJournal`'s only consumer is `uninstall-command.ts:69`; nothing on the
   install or doctor path recovers. Order it: journal the intent → write the new
   receipt → delete → clear the journal.
3. **Guard the root.** This is the codebase's first receipt-driven *deletion*.
   `assertWithinRoots` currently guards writes only (`install-execute.ts:45`),
   and `fromPortablePath` passes absolute paths through verbatim. A receipt is
   parsed with a bare cast (`install-receipt.ts:165`) — unlike `uninstall-plan.ts:118-122`,
   which validates `schemaVersion`. Route every heal removal through
   `assertWithinRoots` and validate the prior receipt first. `path-guard.ts`
   moves from "no change" to "modify".
4. **Respect the shared root and provider subsets.** `av install --provider cursor`
   against a receipt that also has a codex record must not delete files the codex
   record still claims — they are the same physical files under
   `~/.agents/skills`. Compute the heal set against the **union of all** receipt
   records, not the reinstalled subset.
5. **Preserve on hash mismatch.** `uninstall-plan.ts:134-139` already preserves
   files the user edited. Heal must mirror that, and report rather than delete.

Additionally: after removing recorded files, `rmdir` and **report any directory
that survives**. Skills write into their own installed trees — `cti-expert`'s
installer git-clones into `vendor/sharetrace`, `excalidraw` builds a venv under
`references/` — so husks remain that no receipt knows about.

### Two name→path sites outside the resolver

- `kit/hooks/session-init/hook.cjs:80` restores shadowed skills with
  `dest = path.join(skillsDir, entry.name)` — a **bare** name. Post-prefix it
  resurrects an unprefixed dir that no receipt covers, recreating the exact
  orphan this phase prevents. Prefix the restore target, or make it refuse names
  that collide with a canonical kit skill.
- `kit/skills/chrome-profile/SKILL.md:72,73,82,83` hard-code four unprefixed
  installed paths. Verified as the only such literals in the corpus.

## Related Code Files

- Modify: `packages/cli/src/providers/resolver.ts` (line 239 + guard at 172-180)
- Modify: `packages/cli/src/install/install-execute.ts` (heal)
- Modify: `packages/cli/src/install/path-guard.ts` (guard the delete path)
- Modify: `packages/cli/src/install/install-receipt.ts` (validate prior receipt)
- Modify: `packages/cli/src/install/intent-journal.ts` (journal heal deletions)
- Modify: `kit/hooks/session-init/hook.cjs`, `kit/skills/chrome-profile/SKILL.md`
- Modify: `packages/cli/src/providers/resolver.test.ts` (6), `install/install.test.ts` (5),
  `cli/cli-commands.test.ts` (5)
- Create: brownfield e2e in `packages/cli/src/install/e2e-install.test.ts`
- Modify: `packages/cli/src/cli/validate-command.ts` (flip the unprefixed shape
  rule from warn to error)

## Implementation Steps

1. Apply the resolver prefix **with** the empty-name guard. Run
   `provider-matrix.test.ts`, `contract-command.test.ts`,
   `validate-command-policies.test.ts`, `e2e-install.test.ts` **unmodified** —
   if any fails, the guard is wrong. Do not edit those tests to pass.
2. Update the ~16 hard-coded assertions across the 3 test files.
3. Record the two open questions (cursor agent-shim at `resolver.ts:87`,
   `test-provider`). Lower stakes now that nothing renames.
4. Write the brownfield e2e **before** the heal: seed an unprefixed install plus
   an old-resolver receipt.
5. Implement heal with all five requirements plus husk reporting.
6. Fix `session-init/hook.cjs` and `chrome-profile/SKILL.md`.
7. Grep generated `AGENTS.md` (`install/agents-md.ts`) for embedded skill paths.
8. Verify empirically that a provider loads a skill from an `av-`-prefixed dir
   whose frontmatter is `av:<name>`. Before phase 4, not after.
9. Flip phase 1's unprefixed shape rule to error.

## Success Criteria

- [x] `av contract --json` and the README matrix still render bare skill roots.
- [x] `e2e-install.test.ts` passes without edits.
- [x] Brownfield e2e: install over an unprefixed layout leaves zero unprefixed
      recorded files, zero duplicates, a correct receipt; a second run is a no-op.
- [x] Brownfield e2e: process killed between delete and receipt write recovers on
      the next run with no unowned tree.
- [x] Brownfield e2e: reinstalling one provider against a two-provider receipt
      does not delete files the other record still claims.
- [x] Heal refuses a receipt path outside the scope root, and preserves a file
      whose hash drifted.
- [x] A surviving husk directory is reported, not silently left.
- [x] The heal backup still exists after **three** subsequent `av install` runs —
      proving it is outside the `keep = 3` rotation set.
- [x] No code path renames a directory ariadnev does not own — `renameSync`
      appears only in `fs-atomic.ts`, temp to destination.
- [x] A provider empirically loads a prefixed-dir skill by name.
- [x] `pnpm test` green — 1265 vitest, 153 node, typecheck and
      `validate --check --strict` clean.

## What landed

The resolver change is `installedSkillDirName` in `adapt/paths.ts`, guarded on
the empty name. The four "do not edit" test files passed unmodified, which is
how the guard was checked rather than by reading it.

**The heal is generic, not prefix-specific.** It removes what the previous
receipt claimed and the new one does not, so the next path change is already
covered. `installKit` returns `{ results, heal }` — the heal is a property of
the run, not of any one provider.

Every one of the five hard requirements has a test that fails when the guard is
removed; each was mutation-checked. Two of those tests passed for the wrong
reason first:

- The rotation-exemption test passed even with the exemption deleted, because
  `heal-` sorts after every digit and was simply the newest entry. It now also
  asserts the ordinary backups rotated to exactly three.
- The crash-recovery test hand-builds the post-crash state, so it exercised only
  the journal *read*. Dropping `healRemovals` from the *write* left it green.
  `install-heal-ordering.test.ts` kills the run at the receipt write and reads
  what the journal actually holds at that instant.

## Open questions, answered

**Cursor's agent shim** (`resolver.ts:87`) takes the prefix too. It installs
agents as skill-like dirs in the same shared `.agents/skills` root, so an
unprefixed `advisor/` there is indistinguishable from a third-party skill.
Zero of 105 skill names collide with an agent name, and a test holds that —
if one ever did they would share a directory, as they would have before.

**`test-provider`** takes the prefix like every other provider. It resolves
through the same `targetFor`, and a test provider that behaves differently from
the real ones is worth less than one that does not.

**The session-init hook** holds rather than restores. A `.shadowed/` entry whose
`av-` twin is installed is not restored (that would recreate the orphan) and not
deleted (it may be the user's only copy) — it stays in `.shadowed/` and is
reported. It is never renamed into our namespace; most entries there are
third-party skills that were never ours.

## Step 8: what the provider probe found

Against **codex 0.147.0**, `codex debug prompt-input` under a sandbox HOME:

- `~/.agents/skills` is declared as skill root `r0`.
- **104 of 105** skills load from `av-`-prefixed directories.
- Each is surfaced by its frontmatter name — `av:advise` from `av-advise/` —
  with **zero** name/directory mismatches.

The assumption held. The one skill that does not load,
`obsidian-second-brain-note`, fails identically from an unprefixed directory:
its frontmatter uses a folded scalar (`description: >-`) and `metadata: null`.
That is a content defect, not a path one, and it is pre-existing — three kit
skills use that shape. It belongs to phase 8's burn-down, not here.

Claude Code was not probed with a paid call. It does not need one: this
repository's own `~/.claude/skills` holds `ak-`-prefixed directories that the
running session loads by frontmatter name, which is the same mechanism.

## Risk Assessment

**Heal deletes something it should not.** The single highest-consequence risk in
the plan — it removes files from the user's home directory. *Signal:* any heal
test that asserts deletion without asserting the guard, the backup, and the
provider-union. *Pre-decided response:* all five requirements plus the three
brownfield e2e cases are merge blockers. No partial heal ships.

**The quiet half-land.** Shipping the resolver line without heal: `pnpm test`
stays green because nothing today installs with an old resolver and re-installs
with a new one. *Response:* the brownfield e2e is a merge blocker.

**The loud half-land.** Skipping the empty-name guard breaks the matrix,
`contract --json`, and the e2e root check at once. *Response:* step 1 forbids
editing those four test files.

**Assumption that may break:** every provider resolves a skill from a prefixed
dir. Step 8 verifies empirically. *If it breaks:* that provider gains a rename
ripple and the prefix decision is revisited for it specifically — replan.
