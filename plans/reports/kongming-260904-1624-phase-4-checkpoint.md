# Kongming checkpoint — after phase 4 (worktree.root bounded project setting)

Date: 2026-09-04 16:24 (+07). Model: Fable 5.1 (`claude-fable-5-1`).
Branch: `feat/runtime-parity-and-gap-closure`, HEAD `b4b6b62`.
Plan: `plans/260904-0956-runtime-parity-and-gap-closure/`.

## TL;DR

**Phase 4: GO**, with three pre-PR fixes (case-variant `.git` bypass on
case-insensitive filesystems, a false claim in ADR 0019, missing changesets).
**Phase 5 is already executing in this working tree** (72 templates, validators,
LICENSE, lock, embed all modified between 16:27 and 16:28 — after this checkpoint
was spawned). Its riskiest assumption has already materialised: the switch to a
commit-derived `imported_at` rewrote every template header and every
`sha256_12`, so acceptance criterion "all 72 `sha256_12` values byte-identical"
(`phase-05:393`) cannot pass as written. Amend the criterion, do not fudge the
script. Decisions: flip antigravity `hooksInstall` to `false`; fix the
usage-quota hook on this branch with a runtime-marker gate.

## Verified evidence (scouted this session)

| Claim | Evidence |
|---|---|
| Bound anchored on repo, `path.relative` containment, `.git` first-segment refusal | `packages/cli/src/config/filter-project-layer.ts:102-144`, anchor at `:182` |
| Presence via `lstatSync` (dangling symlink treated present → realpath throws → refused) | `filter-project-layer.ts:72-91` |
| CJS twin mirrors the rule | `kit/skills/worktree/scripts/worktree.cjs:383-440` (`refuseProjectWorktreeRoot`), `:445-479`, `:495-550` |
| Refusal rides the JSON `warnings` array, exit 0 | `worktree.cjs:894`; ADR 0019 §"A refusal warns" |
| Generated field table drift-tested and byte-identical in both consumers | `packages/cli/src/config/hook-config-table.test.ts:17-30` |
| `.GIT/worktrees` is **not** refused on APFS with JS `realpathSync`; `realpathSync.native` canonicalises to `.git` | scratch probe `scratchpad/case.cjs` (both twins use `realpathSync`, `filter-project-layer.ts:81,:130`; `worktree.cjs` same pattern) |
| ADR 0019 claims twin test cases "named identically and kept in the same order" | `docs/decisions/0019…md:123-127` — false: TS has 16 bound cases (`filter-project-layer.test.ts:96-209`), CJS has 14 (`worktree.test.cjs:979-1143`); CJS lacks tilde, control chars, sibling, `.`, empty/whitespace, non-string, null, non-dangling symlink escape, in-repo symlink kept |
| CI runs `pnpm exec vitest run` only in `unit`; root `pnpm test` (which now includes `test:worktree`) is not a CI step | `.github/workflows/ci.yml:221` vs `package.json` `test` script |
| Embedded kit at HEAD is stale relative to phase-4 kit edits; working tree now carries a regenerated blob | `git log -- kit-embedded.generated.ts` last regen `29024d3`; working-tree diff `EMBEDDED_DIGEST ff764bc1070bdb70 → 9b98366cdbb870c9` |
| No embed drift test exists | `packages/cli/scripts/generate-embedded-kit.test.mjs` tests the generator on a synthetic tree only; `embedded-kit.test.ts` extracts only |
| Changesets on branch cover phases 1–2 only | `.changeset/antigravity-gemini-root.md`, `antigravity-loadable-agents.md`, `codex-native-hooks.md`; none for output styles (3) or `worktree.root` (4) |
| Antigravity `hooksInstall: true` | `packages/cli/src/providers/resolver.ts:220`; invariant test `install/hooks-surface.test.ts:150-157` only forbids `hooksInstall` without a verified hook cell — the narrow direction (`false` with evidence) is explicitly legal (`:145-148` comment) |
| Kit hooks read snake_case stdin; antigravity emits camelCase protojson | `packages/cli/src/install/antigravity-hooks-merge.ts` (event shapes); plan phase-02 research |
| `usage-quota-cache-refresh` has no runtime gate; only env-override check | `kit/hooks/usage-quota-cache-refresh/hook.cjs`; `kit/hooks/_lib/usage-limits-cache.cjs:108-111` (`hasAnthropicRuntimeOverride`), keychain `:120`, credentials `:131`, fetch `:222` |
| Runtime marker helper exists and the session-state family already gates on it | `kit/hooks/_lib/runtime-state-identity.cjs` `readRuntimeMarker()`; `kit/hooks/README.md` "Layout" |
| Lock generator does **not** trip on `references/snapshot-requirements.txt` | regex `/(?:^|[/\\])requirements[^/\\]*\.txt$/` (`generate-skill-lock.ts:43`) needs the basename to start with `requirements`; `bun packages/cli/scripts/generate-skill-lock.ts diagram --check` → exit 0, silent (lock matches fresh resolution) |
| Phase 5 in flight | `git status`: 82 paths; 72 templates header-only (`0` non-header line changes), 147 `sha256_12` lines changed in `vendoring-metadata.yaml` (72×2 + 3 validators); `extra_vendors` mermaid block preserved; `vendor_from_upstream.py` now has `--sha`, `_checkout`, `_commit_date`; `LICENSE`, `scripts/validators/{self_check.py,verify-geometry.py,verify-motion.py,run-validators.sh}`, `scripts/ariadnev-lock.json` new; `plan.md` row 4 flipped to completed (uncommitted) |

## Q1 — Phase 4 go/no-go: GO, fix before PR

1. **Case-variant `.git` bypass (both twins).** On APFS/NTFS a committed value of
   `.GIT/worktrees` passes the first-segment check because JS `realpathSync`
   preserves caller case. Fix: use `realpathSync.native` for both the anchor and
   the probe (`filter-project-layer.ts:81` and `:130`; the same two calls in
   `worktree.cjs` `realpathOfPossiblyAbsent` / `refuseProjectWorktreeRoot`), and
   keep the segment compare exact (native realpath returns on-disk case, so
   `.GIT` → `.git`). Add one FS-conditional test per suite: create `.git`, probe
   `.GIT/x`, assert refused when `realpathSync.native(".GIT")` ends in `.git`,
   skip otherwise. Severity: low-medium (needs a hostile clone and a
   case-insensitive FS, and the consequence is a checkout inside `.git`), but it
   is exactly the case the ADR says is excluded.
2. **ADR 0019:123-127 is false.** Either make it true (port the nine missing
   cases into `worktree.test.cjs` — at minimum the non-dangling symlink escape,
   the sibling `../other-project`, and `.`) or rewrite the sentence to say the
   generated table is the shared part and the twin suites overlap on the
   refusal set. Recommend the former; the symlink-escape case is the one that
   actually differs in mechanics between the twins.
3. **Changesets.** Add a `minor` changeset for `worktree.root` and one for phase
   3 output styles. The two antigravity changesets need re-reading after Q3a.
4. **Embed.** Working tree already carries a regenerated blob (digest
   `9b98366cdbb870c9`), produced during phase 5. Land it as its own commit
   ("chore(kit): regenerate embedded kit") *after* phase 5's last `kit/` edit —
   the phase-0 doctrine is "regenerate after the last kit edit", and that is
   now phase 5's, not phase 4's. Tick phase-4 criterion by pointing at that
   commit.
5. **CI gap.** `test:worktree` runs only via root `pnpm test`, which CI does not
   invoke (`ci.yml:221` runs `pnpm exec vitest run`). ADR 0019:126-127 says the
   CJS suite "is now covered in CI" — it is not. Either add a CI step or move
   the claim. One-line fix in `ci.yml` next to `:221`.
6. Commit the plan status edits (`plan.md` row 4, `phase-04` frontmatter).

## Q2 — Phase 5 pre-read (now a mid-flight read)

**Why step 1 before step 2.** The pre-phase script vendored whatever HEAD the
source checkout happened to be at, stamped wall-clock `imported_at`, hashed the
stamped text, and rebuilt `vendoring-metadata.yaml` without `extra_vendors:`.
Running it first would have silently dropped the mermaid entry and re-hashed
everything against an unpinned upstream. The working tree shows the fix landed
first: `--sha`, `_checkout` with rev-parse verification, `_commit_date`,
`extra_vendors` preserved. Correct order was followed.

**Riskiest assumption — confirmed broken.** Criterion `phase-05:393` ("all 72
template `sha256_12` values are byte-identical to before the phase") assumed the
stamp would not change. Switching to a commit-derived stamp changes every header,
and `_digest` hashes the wrapped text, so every `sha256_12` changed. The tree
shows precisely that: 72 headers, 0 body lines, 147 hash lines.

Resolution (recommend A):
- **A. Amend the criterion, keep purity.** Rewrite 393 to: "template diff is
  header-only (`imported_at` line), template bodies unchanged, and a second run
  at the same sha is a no-op." Record in ADR 0020 that the one-time hash churn
  is the cost of making output a pure function of `(sha, target set)`.
  Verified achievable now.
- B. Hash the sanitized body instead of the wrapped text. Also churns all 72
  values once (the old values were computed over wrapped text), so it does not
  satisfy 393 either; only worth it if header-only re-stamps are expected to
  recur, which purity makes impossible.
- C. Preserve the existing header when the body is unchanged. Satisfies 393
  literally but breaks the "pure function" property the executor just built
  and the `--sha` re-run idempotency check would then depend on prior file
  state. Reject.

**Second risk — retired.** The two-requirements-files trap does not exist: the
lock generator's filename regex does not match `snapshot-requirements.txt`, and
`--check` for `diagram` passes against the new lock.

**Conflicts with phases 0–4.**
- Embed regen ownership: phase 4 deferred it, phase 5 regenerated it mid-phase
  (16:2x). Criterion `phase-05:404` "regenerated after the last `kit/` edit"
  needs a final regen after `SKILL.md`/routing edits settle — check
  `EMBEDDED_DIGEST` changes again in the last kit-touching commit.
- `plan.md` row 4 flip is uncommitted and phase-05 frontmatter still says
  `pending` while its files are modified; commit ordering must not interleave
  phase-4 bookkeeping with phase-5 content.
- Nothing in phase 5 touches `config-schema.ts`/`worktree.cjs`; no code
  conflict with phase 4.

**Things to check before phase 5 commits.**
- Second `vendor_from_upstream.py --sha 09df49d8… --dry-run` reports zero
  writes (idempotency, criterion 392).
- `check-brand-drift.mjs` after staging (criterion 403) — validators are
  upstream Python with upstream naming; confirm the ALLOWLIST does not need a
  validators entry.
- `SKILL.md` new section says `--all` finds nothing and default asset dirs do
  not exist — verify by running one validator against a rendered file once.
- The three validators are marked `rwxr-xr-x`; confirm the embed generator
  preserves mode bits or that `av skill run` does not depend on them.

## Q3a — Antigravity `hooksInstall`: flip to `false`, keep grade `convention`

- Evidence: kit hooks never fire usefully under agy (camelCase protojson vs
  snake_case readers), so `hooksInstall: true` writes `~/.gemini/config/hooks.json`
  entries that register dead hooks — and the plan's red-team finding #3 exists
  precisely to separate the write switch from the evidence grade.
- The invariant test (`hooks-surface.test.ts:150-157`) permits the narrow
  direction. Flip `resolver.ts:220` to `false`; `planHooks`
  (`install-plan.ts:114-118`) and `hookConfigTargets` (`providers/index.ts:64`)
  already skip. Adjust any test that asserts `true` for antigravity; rewrite the
  hooks paragraph of `.changeset/antigravity-loadable-agents.md` so it does not
  advertise hooks registering in `~/.gemini/config/hooks.json`.
- Do **not** open a "phase 2b" on this branch. An input adapter (camelCase →
  snake_case, matcher translation, `Stop`/`PostInvocation` semantics) is a plan
  of its own with its own observation pass.
- What flips it back: an observed agy startup that reports the named hooks
  loaded, plus one hook proven to receive a translated payload end-to-end.

## Q3b — `usage-quota-cache-refresh`: fix here

- It is a regression introduced by this branch: hooks were claude-only before
  phases 0–1 made codex install them. On codex it now runs on every
  `PostToolUse`/`Stop`/`UserPromptSubmit`, reads the Claude keychain entry and
  `~/.claude/.credentials.json`, and calls `api.anthropic.com` — for a
  statusline consumer that only exists on claude-code (`resolver.ts:369-374`).
- Fix: early exit in `hook.cjs` when `readRuntimeMarker() !== "claude-code"`,
  mirroring the session-state family (`kit/hooks/README.md` "Layout"). One test:
  marker `codex` → no fetch, no keychain spawn, exit 0. Regenerate embed after.
- Comment says why ("the cache feeds a statusline only claude-code renders"),
  not which phase.

## Q4 — Branch-level risks at PR time

1. Embed blob: no drift test; the last kit-touching commit must be followed by
   a regen commit and a reviewer must eyeball `EMBEDDED_DIGEST` moved.
2. Missing changesets (phases 3, 4, 5) and one misleading changeset (antigravity
   hooks).
3. ADR 0019 false claims (test mirroring; CI coverage of the CJS suite).
4. Case-variant `.git` bypass.
5. `EMBEDDED_VERSION = "1.4.0"` while the release line is 1.5.1 — the version
   comes from `packages/cli/package.json` (`1.4.0` on this branch); confirm the
   back-merge that bumped main did not leave `dev` behind before the PR
   targets it.
6. `pnpm coverage` (adapt ≥90%) not run this session; CI runs it (`ci.yml:347`).
7. Concurrent phase execution in one working tree: phase 5 started while the
   phase-4 checkpoint was open. Under `--auto --advice` that is by design, but
   any fix from Q1 now lands on top of phase-5 edits — stage by path, not `-A`.

## Assumptions

- Phase 5's working-tree edits were made by the orchestrator's executor, not by
  a human (high; mtimes 16:27–16:28, matches plan sequencing).
- Antigravity has no observed evidence of loading the `av` hooks (high; plan
  research reports and phase-02 grade `convention`).
- `readRuntimeMarker()` returns `codex` on a codex install (high;
  `hook-runtime-marker.ts` writes it; README documents it).
- The `.GIT` bypass matters to the user (medium; it is the ADR's own stated
  exclusion, so consistency alone justifies the fix).
- CI is the gate the user cares about for the CJS suite (medium; if release
  binaries are gated elsewhere, the ADR sentence is the fix, not `ci.yml`).
