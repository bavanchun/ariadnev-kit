# Parity: `vcskill validate` vs ClaudeKit CLI

Date: 2026-07-20 | Plan: `plans/260720-1207-vc-kit-v3b-anti-bloat-infra/`

## Baseline

`ck` has **no `validate` command**. ClaudeKit lints its kit only implicitly, at
install time — there is no standalone, CI-runnable "is my kit well-formed" check
a contributor can run before committing. `vcskill validate` is a net addition,
not a parity match.

## What `vcskill validate` does

Reuses the exact `loadKit` lint the installer runs (frontmatter, name==slug,
sizes, duplicate names, hook manifests) **plus** a check `loadKit` does not do:
reference integrity across every skill —

- **dangling**: a `references/x.md` linked in `SKILL.md` with no such file
- **orphan**: a `references/x.md` file that exists but no `SKILL.md` links

Exit 0 clean / 1 on any finding. Read-only. Wired as a CI gate (`.github/
workflows/ci.yml`, after build).

## Điểm vượt (proven, not claimed)

1. **Catches a real defect class automatically.** On its very first run against
   the real kit, `validate` found three orphans and one false-styled reference
   that manual review had missed:
   - `obsidian`: `vault-conventions.md` + `course-to-cluster-pipeline.md` existed
     but were unlinked (both valuable — now linked).
   - `git`: it would have flagged v3a's `workflow-pr-per-change.md` orphan that
     was found *by hand* in v3a — the whole motivation for this command.
   - `predict`: a bare `references/risk-lanes.md` that actually meant cook's
     file — fixed to the unambiguous `../cook/references/` form.
2. **Cross-skill aware.** A mention like `../cook/references/risk-lanes.md`
   (another skill's file) is correctly ignored — not a local orphan/dangling —
   via a negative-lookbehind on the path separator. Tested.
3. **Pure, tested core.** The dangling/orphan logic is a pure module
   (`reference-integrity.ts`, 9 unit tests) with no fs/network; the command
   layer adds 5 integration tests including a live real-kit-is-clean assertion.
4. **CI-enforced.** A future orphan/dangling fails the build, so this class of
   drift cannot silently re-enter — the automated form of the v3a lesson.

## Scope cuts (deliberate, documented)

- `validate --fix`: no auto-repair in v1 — report, let the author fix. Same
  stance as `doctor` (diagnose-only).
- Validating installed *targets*: that is `doctor`'s job (receipt-based);
  `validate` checks the kit *source*.
- Deep cross-skill link resolution (does `../cook/references/x.md` actually
  exist in cook?): v1 only checks each skill against its own `references/`. A
  reasonable future addition; not needed to catch the orphan class.

## Unresolved questions

None.
