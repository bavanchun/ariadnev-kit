---
phase: 4
title: "Prefix release and rollout"
status: in-progress
priority: P1
effort: "1-2d"
dependencies: [3]
---

# Phase 4: Prefix release and rollout

## Overview

Cut the release carrying the prefix change and heal the live installs. Separate
from phase 3 on purpose: **this is the point of no return.** Before live heal,
reverting is a clean code revert.

## Entry condition

**Phase 5's release must already be published.** Not merged — *published*. Phase
4's rollback recipe is `av update --to <prev>`, and once signature verification
ships, the binary demands a `.sig` on the previous release's `checksums.txt`. If
phase 5 lands between phase 4's release and its rollback, `--to <prev>` finds no
signature and aborts — discovering that mid-rollout of the declared point of no
return. Sequencing avoids it; retro-signing prior releases is the fallback.

## Requirements

**Functional**
- One released binary that both writes prefixed dirs and heals unprefixed ones.
- `av doctor` reports leftover unprefixed skill dirs — keyed on the receipt.
- Every install on the maintainer's machines healed and verified.
- A rollback recipe that has been **executed**, not merely written.

**Non-functional**
- The binary that writes the new layout and the one that heals the old must be
  the same binary. They cannot ship in different releases.

## Architecture

### The doctor check cannot be built where the draft put it

`diagnose()` is pure over an injected 3-method dep interface — `fileExists`,
`readSettingsJson`, `hookExecutable` (`diagnose.ts:22-28`). It has no
directory-listing capability, no resolver access, and returns `[]` outright when
there is no receipt (`:57`). The check needs a fourth dep and provider/scope
resolution, so `doctor-command.ts` (where deps are constructed, `:50-52`) and
`diagnose.test.ts` join the file list.

**Key it on the prior receipt, not on `SKILL.md` presence.** The draft's filter
was "(c) matches a canonical kit skill name" plus a `SKILL.md` — both fail:
`excalidraw`, `graphify` and `obsidian-second-brain-note` are simultaneously kit
skill names and third-party directories, so the name filter reports someone
else's skill as ariadnev's orphan; and `SKILL.md` is precisely the file heal
deletes, so a husk is invisible to it.

### The README matrix does **not** change

The draft claimed "provider matrix rows now show prefixed skill paths". False,
and it contradicts phase 3's Success Criterion 1: the matrix renders
`dir(mk("skill",""))`, the bare root, which the empty-name guard preserves.
Editing it would put `checkMatrixDrift` at odds with `targetTemplate` and turn
`av validate --check` red on `main`. Delete the claim.

### Rollback is not "reinstall with the old binary"

Traced: the old binary's resolver writes unprefixed paths, `buildReceipt`
replaces each provider record wholesale, and the old binary has no heal — so the
`av-*` tree becomes unowned. That is phase 3's failure mode run backwards, and
the original content is gone because heal already replaced it.

The real recipe: `av update --to <prev>`, then **restore from the heal backup**
that phase 3 requirement 1 creates, then reinstall. That backup is what makes
rollback possible at all, which is why it is a phase 3 merge blocker.

## Related Code Files

- Modify: `packages/cli/src/doctor/diagnose.ts` (+ a `listDir` dep)
- Modify: `packages/cli/src/cli/doctor-command.ts` (construct the new dep)
- Modify: `packages/cli/src/doctor/diagnose.test.ts` (dep shape)
- Create: `.changeset/*.md` (minor — install layout is user-visible)
- Modify: `README.md` (heal behavior + rollback recipe; **not** the matrix rows)
- Modify: `docs/migration-from-the-old-name.md` or a new release note

## Implementation Steps

1. Add the doctor legacy-dir check, keyed on prior-receipt paths, with tests.
   It must ship in the release that can create the condition.
2. Update `README.md` with heal behavior and the rollback recipe. Run
   `av validate --check` — it gates matrix drift, so a wrong edit fails CI.
3. Write the changeset naming **both** the resolver change and the heal.
4. Cut the release. Verify 5 binaries + `checksums.txt`; `smoke-binary.mjs` green.
5. Inventory the roots that exist before touching anything. Note: `~/.ariadnev/`
   currently holds only `history.jsonl` and there are zero `av-*` dirs, so there
   may be **no global install at all** — confirm before assuming one needs heal.
   **Decide the ak-coexistence question here.** After this phase the shared roots
   hold 101 `ak-*` skills *and* ~105 `av-*` skills — two forks of substantially
   the same corpus, with near-duplicate descriptions, both visible to every
   provider reading that root. `description-collision.ts` only scores ariadnev's
   own kit, so the cross-product collisions are invisible to it while being
   exactly the routing degradation it exists to prevent, at double scale. Either
   retire the `ak-*` install from the shared roots, or record acceptance of the
   doubled catalogue. Do not leave it undecided.
6. Heal each root by running `av install`. Then `av doctor`. Zero legacy findings
   is the gate.
7. Invoke one skill per provider post-heal. A file listing is not proof.
8. **Execute the rollback recipe** on a sandbox install and confirm it returns a
   working state. Writing it down is not enough.

## Success Criteria

- [x] `av doctor` reports unprefixed dirs recorded by an interrupted heal
      journal, and does **not** report third-party skills sharing the root —
      unit coverage in `packages/cli/src/doctor/diagnose.test.ts`.
- [x] The README provider matrix is unchanged and `av validate --check` is green
      (final local verification, 2026-08-24).
- [ ] Release published with 5 binaries + checksums; smoke test passed.
- [ ] Root inventory recorded before heal; every one healed; `av doctor` clean.
- [ ] One skill invoked successfully per provider post-heal.
- [ ] The rollback recipe executed end-to-end on a sandbox, returning a working
      install.
- [ ] `ariadnev.com/version` serves the new version.

## Risk Assessment

**A root nobody remembered.** *Signal:* a stale project loads duplicate skills.
*Pre-decided response:* heal repairs it the next time `av install` runs there,
and the doctor check reports it if the user looks. This is why heal is a phase 3
merge blocker rather than a phase 4 nice-to-have.

**Shipping the resolver and the heal in different releases.** Catastrophic, and
easy if phase 3 splits across PRs. *Signal:* a changeset mentioning one and not
the other. *Response:* step 3 names both.

**Rollback that does not roll back.** The draft's recipe manufactured a
mirror-image orphan set with no recoverable content. *Response:* step 8 executes
it. An unexecuted rollback recipe is a guess.

**The heal is one-directional, and the rollback recipe crosses it backwards.**
Named as the single biggest risk of this phase by the phase 3 advisory review.
`av update --to <prev>` restores a binary that has no heal: its next `install`
writes unprefixed dirs and replaces the receipt wholesale, at which point the
whole `av-` tree leaves the record with nothing referencing it — the exact
orphan class phase 3 eliminated, recreated by the rollback path, and with no
backup, because `applyOp` only backs up files already sitting at its own
destinations. *Pre-decided response:* step 8 runs the recipe on a machine that
has already healed and records the observed end state, or the recipe becomes
"uninstall with the new binary first, then roll back". Do not publish a recipe
whose cost has not been observed.

**Cross-scope claims are invisible to the heal.** Codex writes `ctx.home`
regardless of scope, so a *project*-scope codex install records
`~/.agents/skills/…` claims in that project's receipt. A later *global* install
computes its union from the global receipt alone and will remove legacy files
the project receipt still claims. Bounded — hash-identical kit content, present
in the heal backup, converges on the next project-scope install — but that
project's `doctor` and `uninstall` report missing files until then. Not fixable
in general: nothing can enumerate every project receipt on a machine.
*Pre-decided response:* say so in the rollout note, and have `doctor` suggest
reinstalling at this scope when a recorded file is missing.

**`.DS_Store` makes `survivingDirs` look like an error.** Any legacy skill dir
the user ever opened in Finder survives the heal and gets reported. That is
correct behavior, and it will read as a failure unless the rollout note says
what the line means before anyone sees it.

**A case-only rename makes the heal delete what it just installed** (latent
defect, found by the phase 9 advisory review on 2026-08-23; fix before any
release that renames an artifact by case alone). `claimed()` in
`install-heal.ts` keys receipts by the exact absolute path string. If a prior
receipt claims `agents/Explore.md` and the new one claims `agents/explore.md`,
the planner sees a removal, because `after.has("…/Explore.md")` is false. On a
case-insensitive filesystem — macOS by default, Windows — those are one file,
which this run has just written. `executeHeal`'s sha256 guard compares the
file's current bytes with the *previous* receipt's hash, so when the rename
did not change content the guard passes and `unlinkSync` removes the fresh
install. No trigger exists today: phase 9 kept `explore.md`'s name and the
`av-` prefix rename added characters rather than changing case. *Signal:* a
kit change whose only effect on a path is case. *Pre-decided response:* the
planner must never emit a removal whose case-folded path equals one the new
receipt claims when the two resolve to the same inode (probe the filesystem,
do not assume); case-folding `claimed()` itself is wrong, because on Linux the
two names are genuinely different files. Add the fixture — prior receipt with
`Explore.md`, new receipt with `explore.md`, identical content — to
`install-heal.test.ts` before changing the planner.
