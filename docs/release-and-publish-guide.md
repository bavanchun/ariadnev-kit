# Release Guide

How a new `ariadnev` version reaches users. `ariadnev` ships as a standalone binary
via GitHub Releases — **no npm, no tokens, no manual publish**. The automation uses
only the built-in `GITHUB_TOKEN`.

## TL;DR

Add a changeset per change → merge the auto "Version Packages" PR → the `Release`
workflow cross-compiles the 5 platform binaries and publishes them to a GitHub
Release. Users install from the edge with
`curl -fsSL https://ariadnev.com/install | bash` — a Cloudflare Worker
proxies the (private) repo's releases. The edge lives in its own repo,
`bavanchun/ariadnev-web` (see `cloudflare-worker-setup.md`).

## Day-to-day flow (Changesets → binaries)

1. Make changes on a branch. For anything user-facing, add a changeset:
   ```bash
   pnpm changeset        # pick `ariadnev`, choose the bump, write a summary
   ```
   Commit the generated `.changeset/*.md` with your PR.
2. Merge your PR to `main`. `.github/workflows/release.yml` sees the pending
   changeset and opens a **"Version Packages"** PR that bumps the version and
   updates `CHANGELOG.md`.
3. Merge the "Version Packages" PR. On that push the workflow detects the version
   change, runs `packages/cli/scripts/build-binaries.mjs` (regenerate embedded kit
   → `bun --compile` all 5 targets → `checksums.txt`), and publishes them to the
   `ariadnev@<version>` GitHub Release.

The package is `private` — nothing is published to npm.

## What ships each release

Attached to the `ariadnev@<version>` GitHub Release:

| Asset | Target |
|---|---|
| `ariadnev-darwin-arm64` | macOS Apple Silicon |
| `ariadnev-darwin-x64` | macOS Intel |
| `ariadnev-linux-x64` / `ariadnev-linux-arm64` | Linux |
| `ariadnev-windows-x64.exe` | Windows |
| `checksums.txt` | sha256 of every binary (install.sh verifies against it) |

## Local checks (optional)

```bash
pnpm --filter ariadnev build:binary     # host-target binary (needs Bun) → dist/ariadnev
node packages/cli/scripts/build-binaries.mjs   # all 5 targets + checksums locally
pnpm test                              # full suite incl. the embedded-kit drift guard
```

## Graph-harness promotion gate

The graph-native harness release is blocked unless each quality dimension passes
independently. Safety or task-success failures are never averaged away by faster
latency or fewer tokens. Run from a clean source checkout:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm build
node packages/cli/dist/index.js validate --check
pnpm coverage
find packages/cli/scripts -name '*.test.mjs' -print0 | xargs -0 -r node --test
find kit/hooks -name '*.test.cjs' -print0 | xargs -0 -r node --test
bun packages/cli/scripts/benchmark-event-store.ts
bun packages/cli/scripts/benchmark-graph-runner.ts
bun packages/cli/scripts/benchmark-safe-change-runner.ts
bun packages/cli/scripts/benchmark-context.mjs
node packages/cli/scripts/build-binaries.mjs
node packages/cli/scripts/smoke-binary.mjs
```

The deterministic CI gate covers all skills and golden scenarios through the
test suite, then reruns event-store, graph-runner, safe-change, and context
benchmarks. Live Codex and Claude Code probes are release-candidate checks, not
CI substitutes: record the exact probed runtime/model, pass or capability-gated
skip, workspace mutation count, policy violations, process cleanup, token budget,
and orchestration overhead. Never turn unavailable credentials, runtime drift,
or provider quota into a passing cell.

## Paused runs across releases

V1 does not migrate paused runs. Resume requires the exact graph/runner contract,
runtime version, model, workspace identity, and instruction digest captured at
run creation. On incompatibility, finish with the original ariadnev binary or
start a new run; `status` and emergency `cancel` remain available. A future
migration must ship as an explicit versioned and reversible contract—never by
moving a tag or silently reinterpreting events.

## Public provenance checklist

Before downstream web work starts, verify one immutable release converges:

1. `packages/cli/package.json`, `av --version`, and tag `ariadnev@<version>` agree.
2. The GitHub Release points at the version commit and publishes exactly five
   platform binaries plus `checksums.txt`.
3. Every listed SHA-256 matches its downloaded binary; the host binary passes
   `smoke-binary.mjs`, including embedded workflow validation and lifecycle help.
4. `https://ariadnev.com/version` reports that same version only after the
   tag and release assets are live.

If publication is wrong, repair it with a new patch release. Never retarget or
replace an already consumed version tag.

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
