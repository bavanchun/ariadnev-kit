---
"ariadnev": minor
---

Authenticate the update channel, and stop `backups restore` trusting its manifest.

**`ariadnev update` now verifies an Ed25519 signature before it trusts any hash.**
The binary and `checksums.txt` come from the same origin, so the checksum only
ever proved the two halves agreed with each other — a forged pair agrees with
itself. Releases carry a `checksums.txt.sig` signed by a key held offline by the
maintainer and verified against a public key compiled into the binary. The
signature covers the version as well as the checksums, so a genuinely signed
older release cannot be replayed as a newer one.

Two consequences worth knowing:

- **`ariadnev update --to <version>` no longer works for any release published
  before signing.** GitHub releases are immutable, so those releases can never
  gain a signature. Rolling back past that point means re-running the installer.
- **`ARIADNEV_BASE_URL` may now redirect `ariadnev update`**, because an origin
  that cannot produce the maintainer's signature cannot install anything. It is
  https-only, and https is enforced across redirects rather than only on the
  first request.

**`ariadnev backups restore` refused a class of manifest it used to obey.** It
copied files to an absolute path read straight out of `manifest.json`, which for
project scope lives inside the repository you cloned. A hostile manifest could
name any path — a git hook, a shell profile, `~/.ssh/authorized_keys` — and
restore would write it. Restore now accepts only paths ariadnev actually
installs, validates every entry before writing the first one, and rejects a
manifest that does not parse instead of reporting it as "no manifest".

**`ariadnev doctor` reports whether this binary can verify a signature at all.**
Without it, a platform where Ed25519 is unavailable and a correctly fail-closed
one look identical: both refuse every update.
