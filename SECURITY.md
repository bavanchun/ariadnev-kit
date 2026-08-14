# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities **privately** — do not open a public
issue for security problems.

- Preferred: open a private advisory via GitHub Security → **Report a
  vulnerability** on `bavanchun/ariadnev`.
- Or email the maintainer (see the `author` field in `packages/cli/package.json`).

Please include what you found, how to reproduce it, and the impact. We aim to
acknowledge within a few days.

## Supported versions

Only the latest published release receives fixes. Upgrade with `ariadnev update`
(sha256-verified) before reporting, in case the issue is already resolved.

## Scope

ariadnev ships as a self-contained binary installed via `curl … | install.sh`
(or `install.ps1`). Relevant surfaces:

- **The installer** downloads the platform binary from the ariadnev edge and
  **verifies its sha256** against `checksums.txt` before installing (fail-closed).
- **The binary** writes only to provider config paths under your home/project,
  makes atomic writes, and keeps timestamped backups.
- **The edge** (`ariadnev.com`) is a Cloudflare Worker that proxies release
  assets from a private repo using a server-side token. That token lives only on
  the deployed Worker — it is **not** in this repository and never handled by the
  CLI. The CLI never reads, prints, or transmits a GitHub token.

The CLI redacts credential-shaped strings (`ghp_…`, `github_pat_…`, URL
userinfo, and secret-shaped env values) from all printed output as a
defense-in-depth measure.

## User best practices

- Keep `~/.local/bin` (or your install dir) writable only by you.
- If you ever paste a token into a terminal running ariadnev, rotate it — treat
  any exposed token as compromised.
- Prefer `ariadnev install --dry-run` to preview changes on an unfamiliar repo.
