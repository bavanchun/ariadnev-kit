---
phase: 5
title: "Security hardening and signed channel"
status: todo
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
  hash is trusted. Not overridable. ~40 lines.
- **Sign at `finalize-release.yml`** (already `workflow_dispatch`-gated), not in
  `release-candidate-build.yml` — RC signing would expose the key on every push
  build for no benefit.
- **Bind the version into the signed payload.** `/version`
  (`update-command.ts:176`) stays unsigned, so an attacker with a base-URL
  override could advertise `1.4.0` while serving an older, *legitimately signed*
  pair — signature verifies, an old binary installs. Put the version tag inside
  the signed `checksums.txt` and cross-check it. One line, not TUF.
- Only after all of the above may `ARIADNEV_BASE_URL` redirect `av update`.

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
- Modify: `.github/workflows/finalize-release.yml` (sign at finalize)
- Modify: `packages/cli/scripts/smoke-binary.mjs` (Ed25519 verify on all 5 targets)
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
4. Implement Ed25519 verification with the version cross-check; wire signing into
   `finalize-release.yml`.
5. Add an Ed25519-verify case to `smoke-binary.mjs`. Bun's `node:crypto` Ed25519
   support on all 5 targets is **assumed, not proven** — this converts it to a
   release gate. Fallback if it fails: a small pure-JS ed25519 dependency.
6. Only now, add `ARIADNEV_BASE_URL` to `av update`'s four URLs plus the
   signature URL. Add the test asserting no `process.env.ARIADNEV_*` read is
   reachable before `scopeProcessEnv()` (`index.ts:72` reads `ARIADNEV_RUN` at
   `isEntry()` before `scopeProcessEnv()` at `:97` — the invariant is not
   currently enforced).
7. **Cut a release.** Phase 4 cannot cut its release until this one is out.

## Success Criteria

- [ ] `ARIADNEV_BASE_URL=http://evil` against `av update` fails closed in a test —
      signature verification rejects it. (The installer half is phase 0's criterion.)
- [ ] `av update` refuses a valid-hash binary whose signature does not verify.
- [ ] `av update --to <v>` refuses a correctly-signed payload whose embedded
      version tag does not match the requested version.
- [ ] `smoke-binary.mjs` proves Ed25519 verification on all 5 targets.
- [ ] `backups restore` refuses an absolute `originalPath` outside the scope
      root and a `relPath` containing `..`; a malformed manifest is rejected by
      schema, not cast.
- [ ] No `process.env.ARIADNEV_*` read is reachable before `scopeProcessEnv()`.
- [ ] The release carrying all of the above is published **before** phase 4's.
- [ ] `pnpm test` green.

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

**Assumption:** the fleet is the maintainer's own machines. *If ariadnev gains
real third-party users,* dual-key rotation and installer-side verification become
defensible and the downgrade protection becomes mandatory rather than cheap
insurance. Revisit then.
