# 0002: Distribution — standalone binary, not npm

## Context

vcskill is a TypeScript CLI, so npm/npx was the initial distribution. But its
users are Claude Code / agent-harness users who don't necessarily have Node, and
`curl | bash` (Archon/harness style) reaches them in one line. Going public also
made the npm-provenance-requires-public-repo friction concrete.

## Decision

Ship vcskill as a **single self-contained binary**, not an npm package
(2026-07-20).

1. **Bun `--compile`** cross-compiles 5 targets (darwin arm64/x64, linux
   x64/arm64, windows x64) from one CI runner.
2. **Kit embedded, self-extracted.** All kit assets are baked into the binary
   (`generate-embedded-kit.mjs` → a text map) and self-extract to a
   version-stamped cache on first run. `getKitRoot()` tries the real filesystem
   first (dev/tests unchanged) and falls back to the embedded kit in binary mode
   — chosen over a `KitSource` virtual-fs refactor to avoid touching the `Kit`
   contract (lower risk, same outcome).
3. **Install via `curl -fsSL https://vcskill.vchun.dev/install | bash`** /
   `install.ps1`, each verifying the binary's **sha256** from `checksums.txt`
   (fail-closed).
4. **Private repo behind a Cloudflare Worker edge** (`vcskill.vchun.dev`). The
   Worker is the only public face — it proxies the private repo's install
   scripts, `/version`, and `/download/<asset>` using a server-side `GH_TOKEN`,
   so source *and* releases stay private while anonymous install still works.
   CI publishes releases to its own private repo with the built-in
   `GITHUB_TOKEN` (no cross-repo token). See `docs/cloudflare-worker-setup.md`.
5. **npm dropped entirely** — package is `private`, no publish/OIDC/provenance.
   `vcskill update` self-updates via the edge.
6. **Homebrew considered and dropped** — needs a separate tap repo for marginal
   reach over curl; not worth the maintenance.

## Consequences

- Easier: install with no Node; no npm account/token/provenance friction; one
  auditable artifact set + checksums per release.
- Harder: ~55–90 MB per binary × 5; macOS binaries are unsigned (Gatekeeper
  warning — notarization is a future improvement); releases are chunkier.
- Ruled out: npm/npx distribution (would re-introduce the Node dependency and
  the public-repo provenance constraint).
