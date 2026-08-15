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
3. Merge the "Version Packages" PR. On that push the workflow sees that the
   current version has no `ariadnev@<version>` tag yet, runs
   `packages/cli/scripts/build-binaries.mjs` (regenerate embedded kit →
   `bun --compile` all 5 targets → `checksums.txt`), smoke-tests the host binary,
   and leaves a **held draft** release with the assets attached.
4. Publish the draft yourself — see *Finalizing a held draft* below. Nothing
   reaches users until you do.

The trigger is tag-absence, not "the version changed in this commit". A version
that was bumped several commits ago and never released still releases; a version
that already carries its tag never releases twice.

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

## Finalizing a held draft (manual, required)

`release.yml` stops after `candidate-publish`. It leaves a **draft** release with
every asset attached and the candidate envelope bound into the annotated tag's
message. Publishing it is a separate, deliberate step: `finalize-release.yml` is
`workflow_dispatch` only, it must be dispatched **from the tag's ref**, and it
takes eight inputs that all come out of that envelope.

```bash
REPO=bavanchun/ariadnev-kit
TAG=ariadnev@1.0.0

# The envelope lives in the annotated tag object. First line is a format marker;
# the rest is the JSON.
TAG_SHA=$(gh api "repos/$REPO/git/ref/tags/$TAG" --jq .object.sha)
ENVELOPE=$(gh api "repos/$REPO/git/tags/$TAG_SHA" --jq .message | tail -n +2)

# release_id is not in the envelope — it is the draft the publish job created.
RELEASE_ID=$(gh api "repos/$REPO/releases/tags/$TAG" --jq .id)

gh workflow run finalize-release.yml --repo "$REPO" --ref "$TAG" \
  -f release_id="$RELEASE_ID" \
  -f tag="$TAG" \
  -f source_sha="$(jq -r .headSha <<<"$ENVELOPE")" \
  -f candidate_run_id="$(jq -r .runId <<<"$ENVELOPE")" \
  -f candidate_run_attempt="$(jq -r .runAttempt <<<"$ENVELOPE")" \
  -f candidate_artifact_id="$(jq -r .artifactId <<<"$ENVELOPE")" \
  -f candidate_artifact_name="$(jq -r .artifactName <<<"$ENVELOPE")" \
  -f candidate_artifact_digest="$(jq -r .artifactDigest <<<"$ENVELOPE")"
```

`--ref "$TAG"` is not cosmetic: the workflow asserts the dispatch ref is exactly
`refs/tags/<tag>` and fails otherwise.

Two prerequisites, both one-time per repository:

- **Immutable releases must be enabled.** The finalizer hard-fails without it
  (`GET /repos/{owner}/{repo}/immutable-releases` must report `enabled: true`).
- The candidate artifact must not have expired — it is retained 90 days.

**Retrying after a failed release.** Once the tag and draft exist, a retry at a
different commit is refused with `remote state conflict`. Delete both first:

```bash
gh release delete "$TAG" --repo "$REPO" --yes
gh api -X DELETE "repos/$REPO/git/refs/tags/$TAG"
```

That is only available while the release is still a draft. After finalization,
immutability is the point — repair with a new patch release instead.

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
| Smoke the built binaries | Automated | `smoke-binary.mjs`, before provenance is written |
| Hold a draft release + bind the envelope | Automated | `release-candidate-publish.yml` |
| Publish the draft | **Manual** | `gh workflow run finalize-release.yml --ref <tag>` |

## Notes

- The embedded kit is regenerated at build time, so no binary ships a stale kit;
  a `drift guard` test also fails CI if the committed map diverges from `kit/`.
- macOS binaries are **not notarized** — first run may hit Gatekeeper. See the
  README's install note (`xattr -d com.apple.quarantine …`). Notarization is a
  future improvement.
