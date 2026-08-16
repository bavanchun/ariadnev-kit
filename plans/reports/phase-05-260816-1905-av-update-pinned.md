# Phase 5 report: pinned downgrade for `av update`

## What changed

- **`packages/cli/src/cli/update-version.ts`** (new, 15 LOC) — pure module:
  `isValidVersion(v)` and `versionQuery(version)`. Extracted per the phase's
  200-LOC guidance once `update-command.ts` grew past the threshold.
- **`packages/cli/src/cli/update-command.ts`** (262 LOC, was 226):
  - `UpdateHandlerOpts.to: string | null` — the `--to` value, unvalidated at
    the boundary (validation happens inside `runUpdate` itself).
  - `UpdateDeps.fetchPinnedVersion(version)` — hits the edge's
    `/version?version=<x.y.z>` selector; null on 404/timeout/failure. Shares
    a new internal `fetchVersionTag(url)` helper with the existing
    `fetchLatestVersion` (DRY, same 3s timeout, same never-throws contract).
  - `UpdateHandlerResult.exitCode` widened from the literal `0` to `0 | 1` so
    a rejected version can signal failure to the caller.
  - `runUpdate`: validates `opts.to` with `isValidVersion` **before any**
    `deps` call and returns `exitCode: 1` immediately on a bad shape. When
    `--to` is set, resolves via `fetchPinnedVersion` instead of
    `fetchLatestVersion`; skips the "up to date" short-circuit (a pin is
    always installed/reported, including a downgrade); appends
    `versionQuery(opts.to)` to both the asset and `checksums.txt` download
    URLs. Checksum verification and the atomic download-to-temp-then-rename
    (`atomicReplaceBinary`, untouched) are reused unchanged on both paths.
- **`packages/cli/src/cli/register-maintenance-commands.ts`**: added
  `--to <version>` option, wired to `opts.to`; `process.exitCode` now set
  from `runUpdate`'s result (previously ignored) so a malformed/unknown
  version exits non-zero from the CLI too; `context.record("update", …)`
  now gated on `exitCode === 0` so a rejected `--to` isn't logged as a
  completed update.
- **`packages/cli/src/cli/update-command.test.ts`**: added `isValidVersion`
  unit tests (direct import from `update-version.js`) and 6 new `runUpdate`
  cases under `describe("--to (pinned)")`. All pre-existing tests updated
  only to add `to: null` / `fetchPinnedVersion` defaults to the `baseOpts`/
  `deps` helpers — assertions unchanged.

## Version-validation rule

`isValidVersion`: `/^\d+\.\d+\.\d+$/` — exact `x.y.z`, digits only, fully
anchored (rejects a trailing newline, since JS `$` without the `m` flag
matches only the true end of string — confirmed by the `"1.0.0\n"` test
case). Rejects `1.0`, `v1.0.0`, `latest`, `^1.0.0`, `~1.0.0`, `>=1.0.0`,
`1.0.0-beta`, `1.0.0+build.1`, empty string, and injection-ish strings like
`1.0.0; rm -rf /` and `1.0.0/../../etc`. Runs synchronously inside `runUpdate`
before any `deps` call, so no network request is issued for a bad value —
verified by the malformed-version test tracking every `deps` call into an
array and asserting it stays empty.

## Test results

```
✓ packages/cli/src/cli/update-command.test.ts (22 tests) 7ms
Test Files  1 passed (1)
     Tests  22 passed (22)
```

`pnpm lint` (`tsc -p packages/cli/tsconfig.json --noEmit`): clean, no output.

Confirmed no other consumer breaks: `update-check.ts` only imports the
unchanged `fetchLatestVersion`/`isNewerVersion`; no other file imports
`UpdateHandlerOpts`/`UpdateDeps`/`runUpdate`. `pnpm lint` compiles the whole
`packages/cli` project so this is verified, not assumed.

## Not honored / deviations

- **Manual sandbox downgrade verification** (spec step 6: "install current,
  `--to 1.0.0`, confirm `av --version`") was not run — this phase's task
  scope was TDD implementation + narrow tests only, and the repo has no
  compiled binary / live edge access to exercise in this session. Flagging
  for whoever runs the release-verification pass.
- **`kit/skills/av/SKILL.md` documentation of the flag** — explicitly out of
  my file-ownership boundary for this task (owned by another agent per the
  phase's own file list, and my task's "must not touch" list covers
  `kit/skills/`). Not done here; needs a follow-up pass by whoever owns that
  file.
- Everything else in the phase spec (strict validation before network,
  `--to` substituting `resolveLatest()`, pinned selector query params on both
  `/version` and `/download/<asset>`, mandatory checksum verification on both
  paths, `--check` semantics, atomic replace reuse) is implemented and
  covered by the tests listed above.

## Files touched

- `/Users/vchun/Codes/My-projects/vcskill-kit/ariadnev-kit/packages/cli/src/cli/update-version.ts` (new)
- `/Users/vchun/Codes/My-projects/vcskill-kit/ariadnev-kit/packages/cli/src/cli/update-command.ts`
- `/Users/vchun/Codes/My-projects/vcskill-kit/ariadnev-kit/packages/cli/src/cli/update-command.test.ts`
- `/Users/vchun/Codes/My-projects/vcskill-kit/ariadnev-kit/packages/cli/src/cli/register-maintenance-commands.ts`
