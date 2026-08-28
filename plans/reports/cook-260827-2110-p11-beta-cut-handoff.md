# cook — P11 beta cut handoff (finalize needs maintainer key)

**Date:** 2026-08-27 21:15 ICT
**Plan:** `260822-1407-ariadnev-kit-correctness-and-operational-hardening`
**Phase:** 11 (Beta release channel)

## Result

**Held draft `ariadnev@1.2.1-beta.0` exists** and is ready to finalize. Automation
stops at signing — the private Ed25519 key lives only in your password manager
and one offline copy per `packages/cli/src/cli/update-signature.ts`, so I cannot
produce the `checksums_signature` finalize needs.

## What shipped (kit)

7 commits on `main` today, all pushed:

| SHA | Kind | Note |
|---|---|---|
| `2b83937` (#76) | chore | P11 prep — beta changeset + runbook + regen embedded map |
| `2f37ab8` (#78) | chore | Enter changesets pre mode (beta) |
| `34762d2` (#75) | fix | smoke-binary sibling-dir lookup |
| `c33e526` (#77) | Version Packages (beta) — 1.2.0 → 1.2.1-beta.0 |
| `e44b317` (#79) | fix | CURRENT_RELEASE_TAG + resolve-previous-stable + manifest accept prereleases |
| `725e643` | fix | inline workflow regexes accept SemVer 2.0 prereleases |
| `6de25d2` | test | ref-identity test accepts SemVer 2.0 prerelease |

Repo variable: `ARIADNEV_RELEASE_CHANNEL=beta` (set today).
`.changeset/pre.json` on main → pre mode active with tag `beta`.

## What shipped (web)

| | |
|---|---|
| PR #7 | ✅ merged `cd8efc7` |
| production dispatch `deploy.yml` run `33072248503` | ✅ success |
| Edge accepts `?version=…-beta.N` | ✅ (verified: 502 "no such release" instead of 400 "prerelease-unsupported") |

## Blockers I hit and fixed (plan-claim drift)

Phase 11 plan.md ticked "code complete on both sides" but 5 stable-only guards
still refused `1.2.1-beta.0` in the release pipeline. Each was found live by
watching the Release run fail:

1. `packages/cli/scripts/release-tag-grammar.mjs` — `CURRENT_RELEASE_TAG` widened.
2. `packages/cli/scripts/resolve-previous-stable.mjs` — `--version` accepts prerelease.
3. `packages/cli/src/release/docs-bundle-manifest.ts` — `RELEASE_VERSION` widened.
4. `.github/workflows/release-candidate-publish.yml` — inline regex widened.
5. `.github/workflows/finalize-release.yml` — inline regex widened (was `-beta.[1-9]\d*`, refused `-beta.0` which is what changesets pre mode emits).

Every fix carries tests. All CI green on `6de25d2`. **Release run `33081061416`
produced the held draft.**

## Finalize inputs (for `gh workflow run finalize-release.yml`)

```
release_id:                377884576
tag:                       ariadnev@1.2.1-beta.0
source_sha:                6de25d2758d733e3fe45be29beed5f80c27c5afa
candidate_run_id:          33081061416
candidate_run_attempt:     1
candidate_artifact_id:     9650381505
candidate_artifact_name:   ariadnev-candidate-6de25d2758d733e3fe45be29beed5f80c27c5afa-run-33081061416-attempt-1
candidate_artifact_digest: sha256:<from candidate envelope — see run logs>
checksums_signature:       <BASE64 of Ed25519 sig over "ariadnev@1.2.1-beta.0\n<checksums.txt bytes>">
```

**Held draft URL:** https://github.com/bavanchun/ariadnev-kit/releases/tag/untagged-e7f20a54b9bbef2176a2

## Signing recipe (you run locally)

Reference: `packages/cli/src/cli/update-signature.ts:52` — `signedMessage(tag, checksums)`
returns `Buffer.from(\`${tag}\n${checksums}\`)`.

```
# 1. Download checksums.txt from the held draft
gh release download "ariadnev@1.2.1-beta.0" --repo bavanchun/ariadnev-kit --pattern checksums.txt -O /tmp/checksums.txt

# 2. Compose signed message
printf 'ariadnev@1.2.1-beta.0\n' > /tmp/signed-message
cat /tmp/checksums.txt >> /tmp/signed-message

# 3. Sign with your Ed25519 private key (adjust path)
openssl pkeyutl -sign -inkey ~/.ariadnev-signing.pem -rawin -in /tmp/signed-message | base64 > /tmp/checksums.sig

# 4. Also fetch the candidate_artifact_digest from the run logs
gh run view 33081061416 --repo bavanchun/ariadnev-kit --log 2>&1 | grep -E 'candidate.*digest|archiveDigest'
```

Then dispatch:

```
gh workflow run finalize-release.yml --repo bavanchun/ariadnev-kit \
  -f release_id=377884576 \
  -f tag=ariadnev@1.2.1-beta.0 \
  -f source_sha=6de25d2758d733e3fe45be29beed5f80c27c5afa \
  -f candidate_run_id=33081061416 \
  -f candidate_run_attempt=1 \
  -f candidate_artifact_id=9650381505 \
  -f candidate_artifact_name=ariadnev-candidate-6de25d2758d733e3fe45be29beed5f80c27c5afa-run-33081061416-attempt-1 \
  -f candidate_artifact_digest=<sha256:…> \
  -f checksums_signature="$(cat /tmp/checksums.sig)"
```

## Post-finalize verification

```
curl -sI 'https://ariadnev.com/version?version=1.2.1-beta.0' | head -1
# expected: HTTP/2 200

av update --to 1.2.1-beta.0
av --version
# expected: 1.2.1-beta.0
```

## P11 checkbox update after finalize verified

`plans/260822-1407-.../phase-11-beta-release-channel.md`:

- [x] "A `-beta` version is published and installable by explicit opt-in."

Last box (rehearse P04 on beta) still open — flip after actual P04 rehearsal.

## Flip repos back to private

**Both repos are still PUBLIC** so free Actions could run under path A. After
finalize succeeds:

```
gh repo edit bavanchun/ariadnev-kit --visibility private --accept-visibility-change-consequences
gh repo edit bavanchun/ariadnev-web --visibility private --accept-visibility-change-consequences
```

Do **not** flip while finalize dispatch is queued — public → private mid-run
sometimes cancels workflows.

## Also open

- **Version PR #80 "Version Packages (beta)"** — auto-opened by changesets for
  the fix-branch changeset. Consumes the "widen prerelease regex" changeset and
  bumps 1.2.1-beta.0 → 1.2.1-beta.1. Do **not** merge until after finalize of
  1.2.1-beta.0; else the held draft target moves under your feet.

## Unresolved

- **Plan drift.** phase-11 checkboxes claimed "code complete on both sides"
  while 5 stable-only guards blocked the very first cut. Consider a re-audit
  before phase 12.
- **GitHub Actions billing.** Cause of the whole detour: Pro's 3,000 free
  minutes exhausted, blocking any run on private repos. Path A (temporary
  public) worked but is not a durable answer — either raise the spending limit
  or expect this detour again on next reset.
- **CI on private-repo main pushes was silently masking `EMBEDDED_VERSION`
  drift** — noted earlier but not investigated. Worth a look.
