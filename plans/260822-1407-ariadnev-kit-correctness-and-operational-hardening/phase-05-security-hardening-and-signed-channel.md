---
phase: 5
title: "Security hardening and signed channel"
status: in-progress
priority: P1
effort: "2-3d"
dependencies: []
---

# Phase 5: Security hardening and signed channel

## Overview

Two security fixes for the binary, split out of the original phase 5 because
they must be **released before phase 4's release**, not merely merged.

The third — the live installer hole — is **phase 0**, already split out so it can
ship immediately without waiting on key generation.

## Requirements

**Functional**
- `av update` verifies a detached Ed25519 signature over `checksums.txt` against
  a compiled-in public key, before trusting any hash.
- The signed `checksums.txt` carries the version tag; `av update` cross-checks it.
- The backup manifest is schema-validated and the restore path traversal-proof.

**Non-functional**
- Key loss must never brick an installed binary. The installer stays the
  independent recovery root.
- Signing happens at the manual finalize step, not on every RC build.

## Architecture

### 1. The installers — owned by phase 0

`install.sh` / `install.ps1` had the same same-origin checksum flaw and it was
live in production. Split into **phase 0** so it could ship without waiting on key
generation. This phase does not touch the installers; it only depends on that pin
holding, because the installer is the recovery root for key loss (section 3).

### 2. Signed update channel

`update-command.ts:239-241` fetches binary and `checksums.txt` from the same
`${DOMAIN}`; `grep sigstore|cosign|verifySignature|publicKey` in that file
returns zero. Without a signature, `ARIADNEV_BASE_URL` on `av update` would be
RCE — the same trick as phase 0's, in the binary.

- Ed25519 via `node:crypto`. One compiled-in public key. Verify **before** any
  hash is trusted. Not overridable. ~40 lines *in the binary* — see the
  correction below for what the pipeline side really costs.
- **Sign locally; `finalize-release.yml` verifies.** Corrected — the original
  "sign at finalize" was written against `update-command.ts` without reading the
  release pipeline it has to ship through.
- **Bind the version into the signed payload**, but *not* by editing
  `checksums.txt`. `/version` (`update-command.ts:176`) stays unsigned, so an
  attacker with a base-URL override could advertise `1.4.0` while serving an
  older, *legitimately signed* pair — signature verifies, an old binary
  installs. Sign a composed message instead; see below.
- Only after all of the above may `ARIADNEV_BASE_URL` redirect `av update`.

#### Correction: sign local, verify in finalize

Three invariants of `finalize-release.yml`, each verified against the file:

1. **The asset inventory is closed.** `:124-125` builds a literal `required`
   list and asserts the candidate zip listing, the attestation's
   `releaseAssets`, and the remote draft's assets all match it exactly, before
   *and* after publish (`verifyAssets`, `:132`). A `checksums.txt.sig` produced
   at finalize trips `release asset inventory drift` and `remote asset count
   drift` unless the inventory logic is reworked — and it cannot come from the
   candidate, which is built before signing and must stay unsigned.
2. **Published releases are immutable.** `:143` asserts `after.immutable ===
   true`. No past release can ever gain a `.sig`.
3. **`checksums.txt` has an enforced line format.** `:127` parses it against
   `^([a-f0-9]{64})  ([A-Za-z0-9][A-Za-z0-9._@+-]*)$` and asserts the file lists
   exactly `required` minus itself. A version tag inside that file fails the
   `checksums inventory drift` assertion.

And signing *at* finalize puts the private key in GitHub Actions secrets, which
contradicts this phase's own "generate offline, password manager plus one offline
copy" and silently moves the trust root from the maintainer's key to the GitHub
account.

**Corrected design.** The maintainer signs locally with the offline key. The
signature travels as a `workflow_dispatch` input — finalize is already manual, so
this adds no ceremony. Finalize *verifies* it against the committed public key
over the candidate's own `checksums.txt` bytes, uploads `checksums.txt.sig` to
the still-mutable draft, extends `required` by exactly that one asset, then
publishes. The key never touches CI, RC builds are unsigned by construction, and
finalize stays a verifier rather than becoming a signer.

**Version bind without format churn.** Sign `${tag}\n${checksums body}`; the
binary reconstructs that message from the version it asked for. Same downgrade
protection, `checksums.txt` untouched. Plain `av update` already refuses a
non-newer version (`update-command.ts:217`), so this plus that check closes the
advertise-old attack; `--to` stays the deliberate-downgrade path.

**The signing horizon is a behaviour, not a surprise.** Because releases are
immutable, the first signed release permanently ends `av update --to <any
pre-signing version>` — verification would demand a `.sig` that can never exist.
That must fail with the "re-run the installer" message, tested. It also means
this phase's own rollback is the installer, not `--to`, while phase 4 is required
to have an executed `--to` rollback. Phase 5 does not get to exempt itself
silently.

**Installers do NOT verify the signature.** Deliberate reversal of the earlier
draft, for two reasons. (a) Dependency pain: .NET has no built-in Ed25519 and
macOS LibreSSL's `pkeyutl` raw-verify is unreliable, so PowerShell verification
means vendoring crypto into a bootstrap script. (b) It would manufacture the one
genuine brick scenario — if the installer demanded a signature against a lost
key, there would be no recovery path at all.

### 3. Key management: the installer is the recovery root

Key loss does **not** brick anyone, precisely because the installers verify by
pinned checksum rather than signature. Every failure mode — lost key, rotated
key, compromised key — recovers through
`curl https://ariadnev.com/install | bash`, whose trust root is TLS to a domain
the human typed. That is an independent root, which is the whole point.

- **Storage:** generate offline; password manager plus one offline copy.
- **Rotation policy: one key. On loss or compromise, cut a release with the new
  key and reinstall via the installer on each machine.** Dual-key shipping
  windows are for fleets you do not control; this fleet is the maintainer's own
  machines. The earlier draft's dual-key protocol is cut as over-built.
- The binary's verification-failure message must say *"re-run the installer from
  ariadnev.com"* — that turns key loss into a self-healing ten-minute event
  rather than a mystery.

### 4. Backup restore hardening

`backups-command.ts:81` does
`cpSync(join(backupRoot, entry.relPath), entry.originalPath, {recursive: true, force: true})`
where `originalPath` is an **absolute path read straight from `manifest.json`**,
parsed by a bare cast (`backup.ts:17-25`), with `assertWithinRoots` nowhere in
the backups path. For project scope the backup root is `<cwd>/.ariadnev/backups/`
— inside a cloned repository. `rotateBackups` sorts lexicographically, so a
`9999-…` directory is never pruned and always wins `--latest`.

This is the plan's only *currently-live in-binary* vulnerability, and every
release cut before this fix extends its exposure. It is also a hard prerequisite
for phase 6's `--latest`, `recover` and `verify`, each of which makes it easier
to reach.

Harden: zod-validate the manifest (precedent at `migrate/manifest.ts:14-20`),
reject `relPath` absolute or containing `..`,
`assertWithinRoots(entry.originalPath, [scopeRoot])` before every `cpSync`,
validate `opts.timestamp` against a strict pattern.

## Related Code Files

- Modify: `packages/cli/src/cli/update-command.ts` (verify, version bind, baseUrl)
- Create: `packages/cli/src/cli/update-signature.ts` + test
- Modify: `.github/workflows/finalize-release.yml` (verify a supplied signature,
  extend the `required` asset inventory, upload the `.sig` to the draft)
- Read/Modify: `.github/workflows/release-candidate-build.yml` — the candidate
  attestation's `releaseAssets` is half of finalize's inventory assertion
- Modify: `packages/cli/scripts/smoke-binary.mjs` (Ed25519 verify; see the
  target-coverage decision under Success Criteria)
- Modify: `packages/cli/src/install/backup.ts` (zod schema)
- Modify: `packages/cli/src/cli/backups-command.ts` (traversal guards)
- Modify: `packages/cli/src/env-scope.test.ts`
- Modify: `docs/release-and-publish-guide.md`, `README.md`

## Implementation Steps

1. Confirm **phase 0** (installer checksum pin) has merged and deployed. It was
   split out of this phase so the live hole could close without waiting on key
   management. This phase does not touch the installers again.
2. Harden the backup restore path. No phase 6 verb may land before this.
3. Generate the key pair offline; store it; document the reinstall-is-rotation
   policy in the release guide.
4. Implement Ed25519 verification with the composed-message version bind. Wire
   *verification* into `finalize-release.yml` and extend its `required` asset
   inventory; signing itself stays local, off CI. Before writing any of it,
   re-read `release-candidate-build.yml`'s attestation contract — it is the other
   half of the assertion this step has to satisfy.
5. Add an Ed25519-verify case to `smoke-binary.mjs`. Bun's `node:crypto` Ed25519
   support on all 5 targets is **assumed, not proven** — this converts it to a
   release gate. Fallback if it fails: a small pure-JS ed25519 dependency.
6. Only now, add `ARIADNEV_BASE_URL` to `av update`'s four URLs plus the
   signature URL. Add the test asserting no `process.env.ARIADNEV_*` read is
   reachable before `scopeProcessEnv()` (`index.ts:72` reads `ARIADNEV_RUN` at
   `isEntry()` before `scopeProcessEnv()` at `:97` — the invariant is not
   currently enforced).
7. **Cut a release.** Phase 4 cannot cut its release until this one is out.

## What implementation found

**The Worker needs no change.** The corrected design added a tenth release
asset, and whether `ariadnev.com` would serve it was an open assumption — the
edge lives in a separate repo. Probed against production: `/download/checksums.txt`
answers 200, `/download/checksums.txt.sig` and an invented name both answer 404
rather than an allowlist rejection. The proxy is generic, so the signature will
serve as soon as it exists in a release. No cross-repo deploy step.

**`assertWithinRoots(originalPath, [scopeRoot])` was wrong** and would have
refused legitimate restores. A project-scope install writes home-scoped provider
directories, recorded under `abs/`; the scope root excludes them. The guard uses
`[home, cwd]` — what `install-execute.ts` already allows itself to write. Restore
may put back only what install could have put there. Proven both directions.

**Ed25519 needed a surface before more runners meant anything.** Running the
binary on macOS and Windows proves nothing about signature verification unless
the binary reports the capability, because a runtime without Ed25519 and an
unset release key both refuse every update. `doctor` now states it with or
without a receipt, and the smoke gate reads it as a positive signal.

**Two negative tests passed for the wrong reason.** The wrong-key and
signed-the-tag cases nested the override one level too deep, so the env var held
a stringified function that the base64 shape check rejected before verification
ran. Deleting the verification left the suite green — which is how it was found.
Both have teeth now: removing the check fails exactly those two.

## Success Criteria

- [x] `ARIADNEV_BASE_URL=http://evil` against `av update` fails closed in a test —
      signature verification rejects it. (The installer half is phase 0's criterion.)
- [x] `av update` refuses a valid-hash binary whose signature does not verify — including a forged pair that agrees with itself.
- [x] `av update --to <v>` refuses a correctly-signed payload whose embedded
      version tag does not match the requested version.
- [x] `smoke-binary.mjs` proves Ed25519 verification on every target CI can
      execute. **Open decision, to settle when step 5 is reached:**
      `release-candidate-build.yml` is a single `ubuntu-latest` job and
      `smoke-binary.mjs` runs the host binary only, so "all 5 targets" is not
      implementable as written. Either add macOS and Windows runners (covers 4
      of 5; linux-arm64 needs QEMU or a paid arm runner on this private repo),
      or state plainly that the rest ride on a uniform Bun runtime with the
      pure-JS fallback pre-approved. Narrowing it silently is the one option
      that is not available.
- [x] `av update --to <pre-signing version>` fails with the "re-run the
      installer" message — the signing horizon is tested, not discovered.
- [x] `backups restore` refuses an absolute `originalPath` outside the allowed
      root and a `relPath` containing `..`; a malformed manifest is rejected by
      schema, not cast.
- [x] No `process.env.ARIADNEV_*` read is *trusted* before `scopeProcessEnv()`; the one that decides whether scoping runs at all asks `cwdDotenvDeclares` instead, and a test fails on any new pre-scope read.
- [ ] The release carrying all of the above is published **before** phase 4's.
- [x] `pnpm test` green — 1206.

## Risk Assessment

**Shipping the env override before the signature.** *Signal:* any commit touching
`${DOMAIN}` in `update-command.ts` without verification. *Pre-decided response:*
step 6 is gated behind steps 4-5; signature and override land together or neither.

**Key loss bricking self-update.** *Signal:* a design where the installer needs
the key. *Pre-decided response:* the installers verify by pinned checksum, never
by signature — that is the recovery root, and it is why installer-side
verification was cut.

**Bun cannot do Ed25519 on some target.** *Signal:* step 5 fails on one of the
five. *Response:* swap to a pure-JS ed25519 dependency. Do not ship signing that
works on four targets.

**Assumption falsified 2026-08-22: the fleet is *not* only the maintainer's
machines.** Other people have installed ariadnev through the curl installer (see
plan.md). Downgrade protection is therefore mandatory, not cheap insurance, and
key compromise via CI is the worst realistic outcome of this phase — which is the
second reason the corrected design keeps the private key off GitHub. Dual-key
rotation and installer-side verification stay out of scope for the reasons in
section 3 (the installer is the recovery root, and demanding a signature there
manufactures the one genuine brick scenario), but that is now a judgement about
recovery, not a judgement that nobody else is affected.
