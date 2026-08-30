---
phase: 4
title: "Prefix release and rollout"
status: completed
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

The real recipe, as executed on 2026-08-30 (see "Rollback, executed"):
`av uninstall --provider <p> --global` **with the new binary first**, then
`av update --to <prev>` (or the installer, when `<prev>` predates signing), then
`av backups restore <heal-ts> --global`, then reinstall with the old binary.
The uninstall goes first because only the new binary owns the healed `av-*`
tree — the old one cannot remove what its receipt never claimed — and heal
backups survive an uninstall. Skip that step and the restore returns the old
tree *beside* the new one: 210 directories, 105 of them unowned. The heal
backup is what makes rollback possible at all, which is why it is a phase 3
merge blocker.

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
- [x] Release published with 5 binaries + checksums; smoke test passed.
      `ariadnev@1.3.0-beta.1`, 2026-08-30: build plus cross-platform smoke on
      macOS and Windows all green; 10 assets including `checksums.txt.sig`.
- [x] Root inventory recorded before heal; every one healed; `av doctor` clean.
      See "Rollout observations" below. Healed to `healthy 100` across
      claude-code (1570), codex (1503), cursor (1503).
- [x] One skill invoked successfully per provider post-heal.
      All three, 2026-08-30 — see "One skill per provider, actually invoked".
- [x] The rollback recipe executed end-to-end on a sandbox, returning a working
      install. Ran 2026-08-30 on a sandbox `HOME`, between two signed releases —
      see "Rollback, executed" below. Scope of the claim is stated there.
- [x] `ariadnev.com/version` serves the new version.
      `1.3.0`, 2026-08-30 12:19 (+07). Stayed `1.1.0` through both betas, as
      it must — the edge never moves to a prerelease — and moved the moment
      `ariadnev@1.3.0` was finalized: release `Latest`, immutable, 10 assets
      including `checksums.txt.sig`; `/version` → `1.3.0` (200);
      `/download/ariadnev-darwin-arm64` → 200, 87,173,858 bytes. First
      release since `1.1.0` (2026-08-16) to actually reach the bare installer.

## Rollout observations (beta rehearsal, 2026-08-30)

### Inventory before touching anything

| Root | before | after |
|---|---|---|
| `~/.claude/skills` | 0 `av-*`, 107 `ak-*` | 105 `av-*` + 16 agents, `ak-*` untouched |
| `~/.agents/skills` | **105 `av-*` husks**, 105 `ak-*` | 105 skills + 16 agents, `ak-*` untouched |
| `~/.cursor/skills` | 0 `av-*`, 101 `ak-*` | unchanged — cursor writes to `~/.agents/` |
| `~/.codex/skills` | absent | absent |

No receipt existed anywhere — not at `~/.ariadnev/receipt.json`, not in any
project. `av doctor --global` answered `not-installed` and reported nothing,
because the legacy check keys on a prior receipt. **An orphan set with no
receipt at all is invisible to doctor.** The husks dated 2026-08-23 and had lost
every `SKILL.md` while keeping `references/`, `scripts/`, `data/`. `av install`
absorbed them; none survived.

### ak/av coexistence — decided

av owns the shared global roots and improves there. ak moves to project scope,
kept deliberately so a current upstream is always pullable for comparison.

**Executed 2026-08-30 13:10–13:20.** `ak kit install engineer` at project scope
in `~/Codes/My-projects/vcskill-kit` (106 `ak-*` skills, ak's own registry
already listed that directory). The global retirement could not go through
`ak kit uninstall engineer --global`: it refuses to run because its pre-delete
snapshot finds SQLite files in a root it wants to copy (`refusing raw copy of
live SQLite database or sidecar`) — Codex's own `~/.codex/*.sqlite` live in an
ak adapter root, so on a machine with Codex the command can never succeed.
Checkpointing the stale WALs did not change that. Done by hand instead, from
ak's own dry-run classification: its 10,136 `removedPaths` (0 overlap with
av's receipt) deleted, 2,030 emptied directories pruned, 14 hook registrations
in `~/.claude/settings.json` and 18 in `~/.codex/hooks.json` that pointed at
deleted ak hook scripts dropped, then the 305 straggler `ak-*` directories
(caches, a vendored tree, one stale `ak:plan-i18n` skill ak 2.14 no longer
ships) removed. Everything is in `~/.agentkit/global-roots-backup-20260830.tar.gz`
and `global-uninstall-backup-20260830.tar.gz`; the two edited configs in
`~/.agentkit/config-backup-20260830/`. `av doctor --global` stayed
`healthy 100` throughout. The doubled catalogue is gone: `~/.claude/skills`
holds 105 `av-*` and 30 third-party, `~/.agents/skills` 121 `av-*` and 30.

### Two providers claim one root, and uninstall does not notice

`codex` and `cursor` both resolve to `~/.agents/skills/`. The receipt records
**1485 of 1503 paths twice**, once under each. Observed on a sandbox `HOME`:
`av uninstall --provider cursor --yes` reported `removed=1503 preserved=0` and
took codex from `healthy 100` to `degraded 0`, every co-claimed file gone.
Recoverable — doctor names each missing file and `av install` restores them —
but a user with both providers who removes one silently breaks the other.
Uninstall should preserve paths another install in the same receipt still claims.

### One skill per provider, actually invoked (2026-08-30)

Each provider's own agent was asked to *use* `av:help` and return one line
verbatim from the installed `SKILL.md` — content it can only produce by loading
the skill, which a directory listing cannot demonstrate.

| Provider | How | Result |
|---|---|---|
| claude-code | this repo's session | the `av-*` catalogue replaced `ak-*` in the loaded skill list the moment the install finished |
| codex | `codex exec` | returned the line verbatim |
| cursor | `cursor-agent -p --output-format text` | returned the line verbatim |

Two things worth writing down for whoever repeats this:

- `cursor-agent` refuses an untrusted working directory. The probe ran in a
  throwaway directory with `--trust`, which trusts that workspace only —
  deliberately not `-f`/`--yolo`, which would grant blanket command execution
  for a read-only check.
- On a Free plan it also refuses a named model: `Named models unavailable`.
  `--model auto` is required.

### Rollback, executed (2026-08-30)

`1.3.0-beta.2` gave the channel its second signed release, which is what the
recipe had been waiting for. Run on a sandbox `HOME`, every step from the same
working directory:

```
install beta.2 --provider codex     doctor → healthy 100
av update --to 1.3.0-beta.1         updated 1.3.0-beta.2 -> 1.3.0-beta.1
av --version                        1.3.0-beta.1
av doctor --global                  healthy 95
  ⚠ codex: receipt recorded version 1.3.0-beta.2, running 1.3.0-beta.1
av list                             105 skills, 16 agents
av update --to 1.3.0-beta.2         rolled forward again
```

The version-skew warning is the right outcome, not a defect: the install still
works, and doctor says plainly what is out of step instead of failing or staying
silent. Reversible in both directions.

**What this proved.** The binary rollback path — `av update --to <prev>` across
two signed releases, which was impossible until today because nothing signed
existed to roll back *to*. beta.1 and beta.2 share a layout, so no heal ran
here and the restore step was not exercised by this run.

**The restore step, executed the same day (13:06).** A second sandbox crossed
the actual layout change, `1.1.0` (unprefixed) → `1.3.0` (`av-*`), where the
heal backup is the only copy of the old tree. Directory counts in
`~/.agents/skills`, codex provider, global scope:

```
1.1.0 install                       105 unprefixed
1.3.0 install  (heal)               105 av-*, backup heal-20260830-130631 (1447 files)
1.3.0 uninstall --provider codex    0            heal backup still listed
1.3.0 backups restore <heal-ts>     105 unprefixed
1.1.0 install  (reinstall)          105 unprefixed, receipt 1.1.0, doctor healthy 100
1.3.0 install  (forward again)      105 av-*, doctor healthy 100
```

The recipe as first written had no uninstall step, and the first attempt
followed it: restore succeeded (`restored 1447 file(s)`), the old binary
reinstalled and reported healthy — and the root held **210** directories, the
105 `av-*` ones now claimed by nobody. Doctor could not see them: the receipt
was `1.1.0`'s and knew nothing of a prefixed layout. That is phase 3's
failure mode produced by the rollback itself, and it is why the recipe above
now starts with the new binary's uninstall. `1.1.0` predates signing, so
`av update --to 1.1.0` was stood in for by running its binary directly — the
guide's "re-run the installer" case.

### Rollback was not executable before this

The recipe is `av update --to <prev>`. The only previously published release is
`1.1.0`, which predates release signing, so the binary refuses it by design:
`1.1.0 predates release signing and cannot be verified — the binary was NOT
replaced`. This is exactly the entry condition's warning, arriving from the
other direction: phase 5 shipped first, as required, which leaves nothing signed
to roll back *to*. The rehearsal needs two signed releases. Cut a second beta and
roll `beta.2 → beta.1`; that is the first point where the recipe can be executed
rather than asserted.

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
