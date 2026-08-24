---
handoff: ariadnev-kit hardening — remaining work
plan: plans/260822-1407-ariadnev-kit-correctness-and-operational-hardening
created: 2026-08-24 13:09 +07
generated_by: ak:handoff
---

# Ariadnev-kit hardening — remaining work handoff

## Mission and current status

**Desired outcome.** Close plan `260822-1407-ariadnev-kit-correctness-and-operational-hardening`:
`av validate` is a true statement about the entire kit — every cross-skill link
resolves in installed coordinates, every skill/agent meets the house authoring
bar with **no** exemption, the update channel is authenticated independently of
its transport, and mutating commands are safe to run concurrently and scriptable
as JSON.

**Done (merged to `dev`).** Phases 0, 1, 2, 3, 5, 6, 7, 10, 11 code-complete.
Phase 4 pending. Phases 8 + 9 in progress. Overall plan.md progress: **71/106**
checkboxes.

**Remaining, in execution order.**

1. **Phase 5 — cut the actual release.** Merged to dev, but no signed release
   published yet. All of phase 4 blocks on this being *published*, not merged.
2. **Phase 11 — edge deploy + beta cut.** Merged to dev; the beta channel is
   not live yet. Phase 4 stable rollout depends on a real beta rehearsal.
3. **Phase 4 — prefix release and rollout** (7 open items, "point of no return").
4. **Phase 8 — skill content burn-down** (8 success-criteria items open; content
   backlog: Tier A 69 of 84 remaining, Tier B 9 of 10 remaining, 6 reference
   files >800 lines to split; second-reader review 100% mandated).
5. **Phase 9 — agent lint close-out** (3 items open; blocks on phase 8 emptying
   the ratchet before deleting the exemption machinery).

**Priority.** P1 for phases 4/5/8/11. Phase 9 is P2 but is the final gate that
lets `kit/skills-lint-exempt.json` and `isExempt()`/`isPorted()` be deleted.

**Urgency.** No unresolved P0. The live installer RCE that this plan uncovered
was phase 0, already shipped 2026-08-22. The remaining work is largely
maintainer-serialized: release cuts, live rehearsal, and content authoring.

## Scope and guardrails

**Workspace.** `/Users/vchun/Codes/My-projects/vcskill-kit/ariadnev-kit`
(Node/TypeScript monorepo, dev tooling). Independent from `ariadnev-web` — do
not cross-edit.

**Permitted.**
- Continue phase 8 content authoring, one skill or small batch per PR into
  `dev`; keep `kit/skills-lint-exempt.json` shrinking monotonically.
- Split the 6 reference files that exceed the 800-line cap.
- Author phase 4 doctor check, docs, and rollback rehearsal artifacts.
- Cut phase 5 release, then phase 11 beta channel, only when the maintainer
  approves — release cutting is maintainer-owned.
- Delete `isExempt()`/`isPorted()` and empty `skills-lint-exempt.json` **only**
  after phase 8 lands zero exemptions.

**Prohibited.**
- Do not touch `ariadnev-web`.
- Do not add new skill-lint exemption entries anywhere (the whole plan exists
  to remove them).
- Do not rename directories ariadnev does not own. Shared skill roots are
  multi-tenant; ownership is proven by the receipt, never inferred from a
  directory listing. See `plan.md` "Corrections adopted from the red team" #1.
- Do not retro-sign or backfill signatures onto past releases — bind version
  into a composed signed payload, per phase 5 architecture.
- Do not ship phase 4 to stable without a real beta rehearsal (phase 11) and
  without phase 5's release already **published**.
- Do not weaken tests, lint, typecheck, build, or `av validate`. `pnpm test`
  must stay green at every merge.
- Do not add plan IDs, phase numbers, or audit codes to code comments,
  migration names, test names, or commit messages.

**House rules.** TDD, kebab-case, files <200 LOC, `os.homedir()`/`path.join`
only, atomic writes with 3-backup rotation, adapt engine pure with ≥90%
coverage, path constants only in `src/adapt/paths.ts`. See
`ariadnev-kit/CLAUDE.md`.

## Current state

- **Repo root:** `/Users/vchun/Codes/My-projects/vcskill-kit/ariadnev-kit`
- **PR branch:** `hardening/complete-lint-exemption-syncback`
- **HEAD:** `6a473b5` (followed by this handoff refresh commit)
- **PR:** https://github.com/bavanchun/ariadnev-kit/pull/69 → `dev` (draft;
  CI in progress when this handoff was refreshed).
- **Working tree:** clean after this handoff commit and push.
- **Plan directory:**
  `plans/260822-1407-ariadnev-kit-correctness-and-operational-hardening/`
- **Skill-lint exemption ledger:** deleted. `av validate --strict --check`
  reports 0 errors; the existing invocation allowlist leaves three warnings.
- **Live install baseline:** `~/.agents/skills` = 131 entries (101 `ak-*`, 30
  third-party, 0 `av-*`); `~/.ariadnev/` holds `history.jsonl` only, zero
  `av-*` dirs. There is no global ariadnev install to migrate — receipt-driven
  heal-on-install is the sole mechanism.

## Decisions and rationale

Locked decisions carried forward from the plan — do not re-litigate without
new evidence:

- **No enumerating rename migration.** Shared roots are multi-tenant; a
  canonical-name allowlist collides (`excalidraw`, `graphify`,
  `obsidian-second-brain-note` are simultaneously kit and third-party); heal
  is receipt-driven only.
- **`REFERENCE_MAX_LINES` raised 300 → 800** (single deliberate loosening);
  distribution justifies it (380/463 already <300; only 6 >800).
- **Phase 5 signs locally, `finalize-release.yml` verifies.** Version is bound
  into a composed signed payload `${tag}\n${checksums}`, not by editing
  `checksums.txt` (would trip inventory + format assertions and force keys into
  Actions secrets).
- **Phase 5 release must be *published* before phase 4 releases**, so
  `av update --to <prev>` can find a signed previous `checksums.txt`.
- **Phase 4 must be beta-rehearsed via phase 11 before its stable release.**
  Real users exist on the curl installer (confirmed 2026-08-22).
- **Phase 1 checker enforces two rules:** target existence *and* path shape
  `(../)+av-<slug>/`. Name-only would be a no-op.
- **`av doctor` legacy-dir check keys on interrupted-heal journal entries, not
  directory names or `SKILL.md` presence.** This avoids third-party collisions
  and reports only an incomplete heal that ariadnev itself recorded.
- **`ariadnev-web` does not consume `av --json`** (grepped; every `--json` hit
  in web is docs text or unrelated `schemaVersion`). No cross-repo consumer
  gate on JSON envelope changes.
- **Tree digest** (`relpath\0<sha256>` folded, sorted) is the backup-entry
  hash strategy (phase 6, shipped).
- **Tier A calibration → 100% second reads.** Sample of 15 exceeded the
  tripwire; every remaining Tier A + Tier B skill and every fix-diff gets a
  second read.
- **Agents have no `references/` escape hatch** (loader reads only top-level
  `.md`); over-long agents must be *cut*, not extracted.

**Q4 resolved:** retain `metadata.origin: ported` as provenance only. ADR 0013
records that it has no lint-severity effect.

## Work performed

Session-visible history (from plan.md + memory
`ariadnev-hardening-plan-progress-2026-08`):

- **2026-08-22.** Phase 0 shipped and confirmed live (PR #23 pinned installer
  checksums to hardcoded domain; four additional installer defects fixed in
  the same file). Plan restructured after four-lens red team + advisory pass
  (phase 5 split, phases 10/11 added, execution order rewritten).
- **2026-08-23.** Dev at `fbe5aca`, 289 findings held / 80 skills touched;
  Tier A calibration batch of 15 completed with 100% second reads; Tier A
  batch 2 + Tier B batch 1 + calibration-tail + av-lint agents were in flight
  under maintainer supervision. Release cut deferred.
- **Between then and now (2026-08-24 13:09 +07):** dev advanced to `f8efbea`
  with phases 1, 2, 3, 5 (merge), 6, 7, 10, 11 (merge) marked completed;
  working tree currently clean; no release cut yet.
- **2026-08-24 follow-up:** removed the exemption mechanism and ledger, added
  journal-backed doctor reporting, regenerated the embedded kit, refreshed
  docs and plan sync-back, and opened PR #69 to `dev`.

## Verification

**Verified for PR #69.**
- `pnpm test` completed successfully.
- `pnpm lint`, `pnpm build`, `git diff --check`, and focused doctor/validate
  suites passed.
- `node packages/cli/dist/index.js validate --strict --check` reports 0 errors
  (three existing invocation warnings).
- `gitleaks git --staged --redact` found no leaks before commit.

**Maintainer must verify before release.**
- PR #69 CI reaches green and the draft is ready for review.
- A signed phase-5 release is published with `checksums.txt.sig`.
- Beta channel state and `ariadnev.com/version` after deployment.

**Known failure modes to preserve.**
- Retro-signing a past release is impossible by design (releases asserted
  `immutable`). Sequencing is the recovery, not a backfill.
- Heal-on-install must survive a kill between the delete step and the receipt
  write. Success criterion 4 requires an e2e proving this.
- Second concurrent mutating command must exit 3 without touching any file,
  including codex home-rooted writes (success criterion for phase 7 lock).

## Open risks and blockers

- **Release cutting is maintainer-owned.** Phase 5 published release and phase
  11 beta cut both need the maintainer to sign and publish. An autonomous
  agent must not attempt this.
- **Phase 4 rollback must be *executed* on a sandbox**, not merely documented,
  before phase 4 stable release. This is a live-user step.
- **Second-reader review is 100% mandated** for phase 8. If a single agent
  drives both authoring and review, invalidate the reviewer's independence
  and log it — do not silently self-review.
- **Beta users are unknown.** Anyone who installed via curl before phase 0 is
  unmeasured. Beta channel + heal-on-install is the only mitigation.

## Exact next actions

Ordered, executable, safe. Sequence matters — do not reorder without maintainer
approval.

1. **Review PR #69 and wait for CI green.** Preserve phase 8's unchecked
   independent-second-reader and per-merge-proof criteria until evidence exists.
2. **Maintainer-gated release sequence** (do not execute unattended):
   - **Cut phase 5 release** (signed `checksums.txt.sig` asset). Verify with
     a fresh `av update` from `${DOMAIN}` against a compiled-in public key.
   - **Deploy phase 11 edge + beta cut** so `-beta` version is installable by
     explicit opt-in without polluting the bare-installer stream.
   - **Phase 4 rehearsal on beta.** Prove heal-on-install: zero unprefixed
     dirs, zero duplicates, correct receipt, survives kill between delete and
     receipt write. Prove one skill invocation per provider post-heal.
   - **Phase 4 rollback rehearsal.** Execute `av update --to <prev>`
     end-to-end on a sandbox, returning a working binary and no drift.
   - **Phase 4 stable release** only after all above green. Record inventory
     before heal; heal every maintainer install; `av doctor` clean;
     `ariadnev.com/version` serves the new version.
3. **Plan close-out.**
   - Re-run sync-back guard across all phase files; backfill checkboxes; flip
     `plan.md` `status: pending → completed` only when every phase file's
     `status:` is `completed` and every success criterion checkbox is `[x]`.
   - Update memory `ariadnev-hardening-plan-progress-2026-08` with the final
     dev SHA + release tags.

## Source pointers

**Plan and phases (read in this order):**

- `plans/260822-1407-ariadnev-kit-correctness-and-operational-hardening/plan.md`
- `.../phase-04-prefix-release-and-rollout.md`
- `.../phase-05-security-hardening-and-signed-channel.md`
- `.../phase-08-skill-content-burn-down.md`
- `.../phase-09-agent-lint-and-close-out.md`
- `.../phase-11-beta-release-channel.md`

**Code touchpoints referenced above:**

- `packages/cli/src/cli/update-command.ts` (signed update channel; ~line 176
  `/version`, 239-241 fetch site)
- `packages/cli/src/cli/update-version.ts:1-2` (version parser)
- `packages/cli/src/adapt/paths.ts` (path constants — single source of truth)
- `packages/cli/src/providers/spec-verified.ts` (provider gating)
- `packages/cli/src/…/diagnose.ts` (:22-28 pure dep interface; :57 empty-list
  short-circuit)
- `packages/cli/src/…/doctor-command.ts:50-52` (dep construction site)
- `packages/cli/src/…/agent-lint.ts` (:46 `ported` computation; :53, :62, :65,
  :81, :85 the five gated rules)
- `packages/cli/src/…/load-kit.ts:68-71` (skill non-recursion) and `:104-110`
  (`loadFlat` agents)
- `packages/cli/src/…/resolver.ts:64` (agent single-file resolution),
  `:87` (cursor agent-as-skill shim), `:127-137` (test provider)
- `packages/cli/src/…/execute-migrations.ts:28` (`rmSync` before rename — the
  reason the enumerating migration was killed)
- `install.sh`, `install.ps1` (phase 0 fix — pinned; do not add `${DOMAIN}`
  override back)
- `.github/workflows/finalize-release.yml` (:124-125 inventory,
  :127 format, :132 post-publish inventory, :143 immutable) — phase 5
  verification site
- `kit/skills-lint-exempt.json` (ratchet ledger — must monotonically shrink,
  deleted at end of phase 9)
- `kit/skills/**/SKILL.md` and `kit/agents/*.md` (content authoring surface)

**Memory continuity (background context, not authoritative):**

- `~/.claude/projects/-Users-vchun-Codes-My-projects-vcskill-kit/memory/ariadnev-hardening-plan-progress-2026-08.md`
- `~/.claude/projects/-Users-vchun-Codes-My-projects-vcskill-kit/memory/ariadnev-known-defects-2026-08.md`
- `~/.claude/projects/-Users-vchun-Codes-My-projects-vcskill-kit/memory/ariadnev-installer-rce-fixed-2026-08.md`
- `~/.claude/projects/-Users-vchun-Codes-My-projects-vcskill-kit/memory/ram-exhaustion-parallel-agents-2026-08.md`
  (cap to 1 test-running agent, 2 agents total, `--maxWorkers=2` — enforce
  in phase 8 parallelism)
- `~/.claude/projects/-Users-vchun-Codes-My-projects-vcskill-kit/memory/ci-minutes-git-workflow-discipline-2026-08.md`
  (one push per PR; laptop runs light checks only; full suite on CI)

**Repo context:** `ariadnev-kit/CLAUDE.md`, `ariadnev-kit/AGENTS.md`,
`ariadnev-kit/README.md`, `ariadnev-kit/docs/`.
