---
phase: 2
title: "workflow rename and run shim"
status: completed
priority: P1
effort: "1d"
dependencies: [1]
---

# Phase 2: `workflow` rename and `run` shim

## Overview

Free the `run` name. `av run` currently means the workflow harness; AgentKit's
`run <kit>/<skill> --target …` means single-skill dispatch. Every piece of ported
skill prose will reference the AgentKit meaning, so `run` has to become dispatch —
which means the harness needs a new name **before** any prose or dispatch work
references either.

Small, trivially revertable, and deliberately early.

## Requirements

**Functional**
- `av workflow run|resume|status|cancel` — the harness, renamed.
- `av run <arg>` with **no slash** in the positional falls through to the legacy
  workflow path, emitting a deprecation warning to stderr.
- `av run <kit>/<skill>` is reserved and errors with a message pointing at phase
  10, not silently misrouted.
- Existing `--json` envelopes unchanged in shape.

**Non-functional**
- The deprecation warning goes to **stderr**, so `--json` consumers piping stdout
  are unaffected.
- The shim is dated in its own comment with the release that removes it (1.4.0).
  It **ships in 1.3.0** — a deprecation warning no stable user sees is not a
  deprecation path.

## Architecture

Read off `register-harness-commands.ts`: `run` takes an optional `[workflow]`
positional plus `--runtime`, `--run-id`, `--initial-state`, `--validate`, and
carries three subcommands — `resume <run-id>` (`:218`), `status <run-id>` (`:231`),
`cancel <run-id>` (`:240`).

**The discriminator.** AgentKit's grammar is `run <kit>/<skill>` — a slash is
mandatory. ariadnev's workflow IDs do not contain slashes. So `positional
.includes("/")` cleanly separates the two meanings with no ambiguity and no flag.

Three cases after this phase:

| Invocation | Behavior |
|---|---|
| `av workflow run <id>` | the harness, canonical |
| `av run <id>` (no slash) | harness + deprecation warning on stderr |
| `av run kit/skill` | reserved; errors pointing at phase 10 |

The subcommands **move immediately** rather than being shimmed. They were nested
under `run`, and AgentKit's `run` grammar has no `resume`/`status`/`cancel`
subcommands to collide with — so `av run status <id>` can become an error stub
pointing at `av workflow status <id>` with no ambiguity at all. Only the bare
positional form needs the fallthrough.

## Related Code Files

- Modify: `packages/cli/src/cli/register-harness-commands.ts` — register under `workflow`; add the shim
- Modify: `packages/cli/src/cli/register-harness-commands.test.ts`
- Create: `packages/cli/src/cli/run-shim.ts` + test — the discriminator, isolated so its removal is one deletion
- Modify: `packages/cli/src/cli/command-surface.test.ts`
- **Modify: `packages/cli/src/cli/json-envelope.ts:38`** — `LEGACY_JSON_COMMANDS` contains `"run"`; the exemption belongs to the harness and must move to `workflow`
- **Modify: `packages/cli/src/cli/exit-codes.ts:27`** — `LEGACY_EXIT_COMMANDS` likewise
- Modify: `parity-manifest.json` — `run` still uncovered until phase 10
- **Modify: `packages/cli/scripts/smoke-binary.mjs:51-53,161`** — the release gate; see below
- **Modify: `packages/cli/scripts/smoke-binary.test.mjs`** — its fixtures encode the same grammar
- Modify: `README.md:107,112,113,139,148,149,150` — command-table rows, examples, **and the two legacy-exception lists at `:107`/`:139`**. `:149` is an `av --dry-run run …` example that a literal `av run` grep skips
- Modify: `docs/graph-execution-architecture.md:5,27,40,45,46,47` — `:5` sits outside the example block
- Modify: `kit/skills/av/SKILL.md:117` — the only kit-skill reference (`kit/skills/ariadnev/` has none)

## This phase breaks the release gate unless `smoke-binary.mjs` moves with it

This is the reason this phase cannot be treated as CLI-local.

`packages/cli/scripts/smoke-binary.mjs:51-53` asserts:

```js
for (const token of ["resume", "status", "cancel", "--runtime <provider>", "--validate", "--json"]) {
  if (!runHelpOut.includes(token)) failures.push(`run --help is missing ${token}`);
}
```

This phase moves `resume`/`status`/`cancel` off `run` *immediately* (they are
error stubs, not shims), so `run --help` stops containing the first three tokens
and the assertion fails. That assertion runs in the `build` job **and** in
`smoke-cross-platform`, both inside `release-candidate-build.yml` — so the
failure blocks **every release candidate**, including the blocker plan's.

Second hit at `:161`: `run(bin, ["run", "read-only-delivery", "--validate",
"--json"])`. No slash, so it survives on this phase's shim — and then breaks
outright when phase 10 retires the shim. Repoint it at `workflow` here rather
than leaving a landmine for phase 10.

The token list must become the `workflow --help` assertion, plus a new assertion
that `run --help` shows the reserved dispatch grammar. Both belong in this phase's
step 2, because a smoke that passes for the wrong reason is worse than one that
fails.

## Oracle observation — the dispatch grammar this phase reserves

Captured from the live upstream binary on 2026-08-28 (2.14.0). Recorded rather
than recalled, because phase 10 implements against it and this file is the only
place the shape is written down.

```
Usage:
  ak run <kit>/<skill> [args...] [flags]

Options:
      --json               Emit machine-readable JSON (implies --no-interactive)
      --kits-dir string    Kits directory
      --no-interactive     Disable interactive prompts (CI-safe)
  -q, --quiet              Suppress non-error output on stderr
      --target string      Adapter to dispatch to (default "claude-code")
      --timeout duration   Per-invocation timeout (e.g. 30s, 2m). Zero disables.
  -V, --verbose            Extra diagnostic output on stderr (loses to --quiet)
  -y, --yes                Assume yes for all prompts

Exit status:
  0 success  1 command failure  2 invalid flags  4 unmet dependency  5 kit or skill not found
```

Two things phase 10 inherits from this and cannot decide for itself: the slash
is **mandatory** in the grammar, which is what makes the discriminator sound
rather than a guess; and dispatch has its own exit codes, including 5 for a
missing kit or skill, which is outside this repository's own table and will
need deciding then.

## One correction to this phase, applied

The steps said the reserved-grammar error should name phase 10. It does not, and
must not: `review-audit-self-decision.md` forbids plan IDs and phase numbers in
shipped code, and a user reading `av run engineer/scout` has no access to this
plan. The message names the behavior instead — what the grammar is reserved for,
that this release does not implement it, and what to type today.

A second wording fix came out of running the built binary rather than the tests.
The message first suggested `av workflow run engineer`, derived from the kit
name. It reads as helpful and is not: a kit name is not a workflow ID, so the
advice sends a confused user to a second error. It now names the grammar,
`av workflow run <workflow>`, and a test asserts the derived form is absent.

## Implementation Steps

1. **Oracle observation.** Capture `ak run --help` verbatim into this phase file
   as the target grammar for phase 10. This phase does not implement dispatch,
   but it reserves the shape, so the shape must be recorded rather than recalled.
2. Failing tests first, three cases: `av workflow run <id>` works; `av run <id>`
   works **and** warns on stderr; `av run kit/skill` errors with a message naming
   phase 10.
3. Re-register the harness under `workflow`. The action bodies do not change —
   this is a registration move, and keeping the bodies untouched is what makes
   the phase revertable in one commit.
4. Add `run-shim.ts`: one function, positional in, route out. Isolated so phase
   10 deletes a file rather than untangling a conditional.
5. Point `av run status|resume|cancel <id>` at error stubs naming the `workflow`
   form. No fallthrough needed — no collision exists.
6. **Move the release smoke with the rename.** Repoint `smoke-binary.mjs`'s token
   assertion at `workflow --help`, repoint the `:161` graph-validate invocation at
   `av workflow`, add an assertion that `run --help` advertises the reserved
   dispatch grammar, and update `smoke-binary.test.mjs`'s fixtures. Do this in the
   same commit as the rename — a release gate that is briefly red is a release
   gate the maintainer cannot cut through.
7. **Move `run` out of both legacy-exemption lists and into `workflow`.** Those
   lists carve out commands whose pre-envelope JSON shape and exit codes are
   frozen for compatibility. The exemption was granted to the harness; if `run`
   stays in them, then after phase 10 the *dispatch* command silently inherits a
   compatibility carve-out it was never granted. Neither list has a test that
   fails on this, which is exactly why it is a step rather than a note.
8. Sweep every `av run` reference in README, docs, and `kit/skills/av/SKILL.md`,
   including the `--dry-run` example at `README.md:149` that a literal `av run`
   grep skips. A stale example is how a deprecation becomes permanent.
9. Assert the warning is on stderr and stdout stays byte-identical under `--json`.

## Success Criteria

- [x] `av workflow run|resume|status|cancel` all work
- [x] `av run <id>` still works and warns on stderr
- [x] `av run kit/skill` errors, naming what the grammar is reserved for (not a phase number — see the correction above)
- [x] `--json` stdout byte-identical to before the rename
- [x] The shim is one file, with its removal phase **and release (1.4.0)** named in a comment
- [x] **`run` no longer appears in `LEGACY_JSON_COMMANDS` or `LEGACY_EXIT_COMMANDS`; `workflow` does** — asserted
- [x] No `av run` examples left in README, docs, or skills
- [x] **`smoke-binary.mjs` updated in the same commit; the release smoke is green against the renamed surface** — asserted by running it against a locally built binary before the PR opens
- [x] `pnpm test` green — 580 tests across `src/cli` and `src/kit`, plus 19 in `smoke-binary.test.mjs`; `lint`, `check-brand-drift.mjs`, and `validate --check --strict` (0 errors) all clean

## Risk Assessment

**A user's script breaks silently.** The reason the shim exists — and the reason
1.3.0 can be a minor at all. A silent semantic change to an existing command in a
minor release is a lie, regardless of how few users are affected.
*Signal:* any path where the old invocation changes behavior without warning.
*Response:* step 2 asserts the warning fires. If a case cannot warn, it errors
instead. Never silently reinterpret.

**The shim outlives the plan.** Deprecation shims are famously immortal.
*Signal:* 1.3.0 release prep finds `run-shim.ts` still present.
*Response:* phase 13's release checklist has removal as a blocking item, and the
file carries its own removal date. One file, one deletion.

**`--json` consumers break on the warning.** A warning on stdout corrupts a JSON
envelope.
*Signal:* a `--json` output that no longer parses.
*Response:* stderr only, asserted by test.

**The rename lands while the maintainer needs to cut a release.** `pnpm test`
green is not sufficient here — `smoke-binary.mjs` is a script, not a vitest
target, and its failure appears only inside a candidate build.
*Signal:* a red `Smoke the built binaries` step on a release-candidate run.
*Response:* step 6 moves the smoke in the same commit, and the success criterion
requires running it against a locally built binary *before* the PR opens. This
phase also targets `dev`, never `main`, so a mistake here cannot reach a live
candidate build — see the branch rule in `plan.md`.
