# P11 beta cut — maintainer runbook

Prepared 2026-08-26 on branch `chore/p11-beta-prep-260826` off `origin/main`
(`c9f5c8e`). This runbook lists the exact commands to cut the first
`ariadnev@X.Y.Z-beta.N`. It does **not** execute them — pre mode + the release
channel variable are irreversible-ish choices the maintainer makes.

## Preconditions (verify before starting)

- [ ] `bavanchun/ariadnev-web` **PR #7** ("feat(edge): allow a beta version in
      the release selector") is **merged and deployed to production**.
      As of 2026-08-26 17:44 ICT: status = **OPEN**, not merged.
      Verify:
      ```
      gh pr view 7 --repo bavanchun/ariadnev-web --json state,mergedAt
      curl -sI 'https://ariadnev.com/version?version=2.0.0-beta.1' | head -1
      ```
      Expected after deploy: `HTTP/2 200` (not `400 bad request:
      prerelease-or-build-unsupported`).
- [ ] Working tree clean on `main`, up to date with `origin/main`.
- [ ] Any user branches you intend to include in the beta have already been
      merged to `main` (e.g. `fix/smoke-sibling-dir` if wanted).
- [ ] `.changeset/pre.json` does **not** exist yet on `main`.
      Verify: `test ! -e .changeset/pre.json && echo ok`

## The cut (do in this exact order)

### 1. Land the prep branch

This branch (`chore/p11-beta-prep-260826`) carries the changeset that names the
beta contents. Merge it to `main` via PR the normal way. Nothing else on this
branch is release-affecting; the changeset is a `patch` bump.

### 2. Set the release channel variable

CI refuses a release cut unless this variable matches the pre mode state. Set
it **before** entering pre mode, so the first push after `pre enter` is not
blocked:

```
gh variable set ARIADNEV_RELEASE_CHANNEL --body beta
gh variable list | grep ARIADNEV_RELEASE_CHANNEL   # confirm
```

### 3. Enter changesets pre mode

On a fresh branch off updated `main`:

```
git switch main && git pull --ff-only
git switch -c chore/enter-pre-mode-beta
pnpm changeset pre enter beta
git add .changeset/pre.json
git commit -m "chore(release): enter changesets pre mode (beta)"
git push -u origin chore/enter-pre-mode-beta
gh pr create --base main --title "chore(release): enter pre mode (beta)" \
  --body "Opens the beta release channel per phase 11. \
Every Version PR after merge produces -beta.N until \`pnpm changeset pre exit\` is run."
```

Merge that PR to main.

### 4. Let the pipeline cut and publish the beta

After the merge, `.github/workflows/release.yml` runs:

```
push main → Version PR (produces X.Y.Z-beta.1)
         → candidate-build (5 binaries + provenance)
         → candidate-publish (HELD DRAFT — not public yet)
```

The maintainer gate is `finalize-release.yml`, dispatched manually:

```
gh workflow run finalize-release.yml
gh run watch                # optional
```

Expected published version: **`ariadnev@1.2.1-beta.1`** (base `1.2.0` from the
last Version PR + the smoke-binary-path patch changeset + this runbook's
changeset). If the prep branch has not landed, it will be `1.2.1-beta.1` from
`c9f5c8e` alone.

### 5. Verify the beta is installable

```
# Edge accepts the prerelease selector
curl -s 'https://ariadnev.com/version?version=<published-version>'
# Expected: 200 + the version string

# CLI opt-in path
av update --to <published-version>
av --version                # matches <published-version>

# Bare paths still select stable — belt and braces
av update                   # expected: "up to date" at current stable
```

### 6. Tick P11 acceptance

Update `phase-11-beta-release-channel.md`:

- [x] "A `-beta` version is published and installable by explicit opt-in."

Leave the last box (rehearse phase 4 on beta) unchecked — that ticks after P04.

## Exiting pre mode (do this eventually)

`changeset pre enter beta` persists in `.changeset/pre.json` until explicitly
exited. Every subsequent Version PR keeps producing `-beta.N`. To return to
stable cuts:

```
gh variable delete ARIADNEV_RELEASE_CHANNEL         # first, so CI matches
git switch main && git pull --ff-only
git switch -c chore/exit-pre-mode
pnpm changeset pre exit
git add .changeset/pre.json                         # mode becomes "exit"
git commit -m "chore(release): exit changesets pre mode"
git push -u origin chore/exit-pre-mode
# PR + merge
```

The CI guard `packages/cli/scripts/check-changeset-pre-mode.mjs` refuses any
combination that isn't (pre-mode-active ⇔ channel-variable-set-to-beta), so
mis-sequencing surfaces as a red workflow, not a mis-tagged release.

## Abort / rollback (before the beta publish)

If anything looks wrong between steps 3 and 4:

```
# Revert the pre-enter merge on main
git revert <sha-of-pre-enter-merge> -m 1
gh variable delete ARIADNEV_RELEASE_CHANNEL
```

Nothing is public yet — `candidate-publish` produces a HELD DRAFT that no user
can install until `finalize-release.yml` is dispatched. If the draft was
already created:

```
gh release list --limit 5
gh release delete <tag> --cleanup-tag
```

## Local dry-run results (2026-08-26)

Recorded from `chore/p11-beta-prep-260826`.

- `pnpm install --frozen-lockfile`: **OK**
- `pnpm -w lint` (tsc noEmit): **OK**
- `pnpm -w build` (tsup): **OK** — `dist/index.js` 21.68 MB, 295ms.
- `pnpm -w test`: **OK after regen** — vitest 1410/1410, node-test 125/126
  (1 skipped). First run failed 1 test:
  `embedded-kit > keeps the generated version aligned with package metadata`
  (`EMBEDDED_VERSION="1.1.0"` vs `package.version="1.2.0"`). Root cause: the
  1.2.0 Version PR (#73) bumped `packages/cli/package.json` but did not
  regenerate `packages/cli/src/kit/kit-embedded.generated.ts`. Fix landed in
  this branch: ran `pnpm --filter ariadnev generate:embedded`, committed the
  refreshed map. Digest went from previous to `358a494adb827762`.

If any of the above fail again on a fresh checkout of this branch, the beta
cut will fail the same way in CI — resolve before step 1.

## Unresolved

- **Edge deploy owner and ETA for `ariadnev-web` PR #7.** Without it, step 5
  fails at the `curl … /version?version=…-beta.1` check and the beta is
  effectively unpublishable via the documented opt-in.
- **Version target confirmation.** `1.2.1-beta.1` is the expected first tag
  based on current main. Confirm against the Version PR title before dispatch.
