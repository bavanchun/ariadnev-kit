# Release Guide

How a new `vcskill` version reaches users. `vcskill` ships as a standalone binary
via GitHub Releases — **no npm, no tokens, no manual publish**. The automation uses
only the built-in `GITHUB_TOKEN`.

## TL;DR

Add a changeset per change → merge the auto "Version Packages" PR → the `Release`
workflow cross-compiles the 5 platform binaries and publishes them to a GitHub
Release. Users install from the edge with
`curl -fsSL https://vcskill.vchun.dev/install | bash` — a Cloudflare Worker
proxies the (private) repo's releases (see `cloudflare-worker-setup.md`).

## Day-to-day flow (Changesets → binaries)

1. Make changes on a branch. For anything user-facing, add a changeset:
   ```bash
   pnpm changeset        # pick `vcskill`, choose the bump, write a summary
   ```
   Commit the generated `.changeset/*.md` with your PR.
2. Merge your PR to `main`. `.github/workflows/release.yml` sees the pending
   changeset and opens a **"Version Packages"** PR that bumps the version and
   updates `CHANGELOG.md`.
3. Merge the "Version Packages" PR. On that push the workflow detects the version
   change, runs `packages/cli/scripts/build-binaries.mjs` (regenerate embedded kit
   → `bun --compile` all 5 targets → `checksums.txt`), and publishes them to the
   `vcskill@<version>` GitHub Release.

The package is `private` — nothing is published to npm.

## What ships each release

Attached to the `vcskill@<version>` GitHub Release:

| Asset | Target |
|---|---|
| `vcskill-darwin-arm64` | macOS Apple Silicon |
| `vcskill-darwin-x64` | macOS Intel |
| `vcskill-linux-x64` / `vcskill-linux-arm64` | Linux |
| `vcskill-windows-x64.exe` | Windows |
| `checksums.txt` | sha256 of every binary (install.sh verifies against it) |

## Local checks (optional)

```bash
pnpm --filter vcskill build:binary     # host-target binary (needs Bun) → dist/vcskill
node packages/cli/scripts/build-binaries.mjs   # all 5 targets + checksums locally
pnpm test                              # full suite incl. the embedded-kit drift guard
```

## Boundary summary

| Step | Who | How |
|---|---|---|
| Version bump + CHANGELOG | Automated | Changesets "Version Packages" PR |
| Cross-compile 5 binaries + checksums | Automated | `build-binaries.mjs` in `release.yml` |
| Publish GitHub Release | Automated | `gh release` (idempotent) with `GITHUB_TOKEN` |

## Notes

- The embedded kit is regenerated at build time, so no binary ships a stale kit;
  a `drift guard` test also fails CI if the committed map diverges from `kit/`.
- macOS binaries are **not notarized** — first run may hit Gatekeeper. See the
  README's install note (`xattr -d com.apple.quarantine …`). Notarization is a
  future improvement.
