# Contributing to ariadnev

This repository has one maintainer. Everything below describes what the project
actually does today — the commands have been run, the gates are the ones CI runs,
and the branch model is the one in use. Where a convention is not enforced, that
is said plainly rather than implied.

## What this project is

A Node/TypeScript monorepo that authors agent skills, subagents, commands and
rules once in canonical Claude format under `kit/`, then installs them to any
supported AI provider. It ships as a single Bun-compiled binary with the kit
embedded, installed via `curl -fsSL https://ariadnev.com/install | bash`. It is
**not** published to npm.

`AGENTS.md` (mirrored by `CLAUDE.md`) carries the working rules for the code
itself — purity boundaries, path constants, atomic writes. Read it before
changing anything under `packages/cli/src/`.

## Setup

Requires **Node 24**, **pnpm 9**, and **Bun 1.3.14** — the versions CI pins in
`.github/workflows/ci.yml`. A different Bun can produce a binary that behaves
differently, which is the one mismatch worth avoiding.

`engines.node` declares `>=22.13` rather than `>=24`, because 22.13 is the first
release where `node:sqlite` is available without `--experimental-sqlite`. Below
that floor the dev-side storage driver does not resolve at all. CI pins 24; 22.13
is the lowest version a contributor can actually run the suite on.

```bash
pnpm install --frozen-lockfile
pnpm run lint     # typecheck; there is no separate linter
pnpm test
```

## Running the tests

There are three tiers, and `pnpm test` runs all of them:

| Command | What it covers |
|---|---|
| `pnpm test` | everything below, in one pass |
| `npx vitest run` | the TypeScript suite (~1200 tests) |
| `pnpm run test:hooks` | `kit/hooks` and `kit/statusline` (`node --test`, `.test.cjs`) |
| `node --test packages/cli/scripts/*.test.mjs` | build, release and installer scripts |
| `pnpm run coverage` | the vitest suite with coverage thresholds — this is the gate CI runs |
| `pnpm run test:build-binaries` | the cross-compile integration gate; needs Bun |

Run the narrowest tier that covers your change first, then widen if you touched a
shared contract.

Two suites are deliberately **not** run: a ported skill ships upstream's own
tests, which are content rather than this project's expectations. CI only runs
`kit/hooks` and `kit/statusline`.

If a test fails once and passes in isolation, check before assuming it is your
change — `packages/cli/src/eval/behavioral-runner.test.ts` has a
filesystem-timing case that is occasionally flaky under full-suite load.

## Branch model

```
main  ←  dev  ←  feature/*
```

Work branches off `dev`. It lands on `dev` by pull request. `dev` is promoted to
`main` deliberately, as its own step — **merging to `main` is a deploy**, because
the edge Worker that serves `ariadnev.com/install` reads `install.sh` straight
out of this repository at `main`.

Nothing is committed directly to `main`.

## CI is advisory, not blocking

**This is the part that will surprise you.** Branch protection is unavailable on
this repository:

```
GET /repos/bavanchun/ariadnev-kit/branches/main/protection
→ 403 "Upgrade to GitHub Pro or make this repository public"
```

So required reviews, required status checks and linear history **cannot be turned
on** while the repo is private on the free plan. GitHub will happily let you merge
a pull request with a red build. Nothing stops it but the person clicking.

Treat a green build as a precondition you enforce yourself. Do not merge red.

The honest fixes — GitHub Pro, or making the repository public — are the
maintainer's call and out of scope for a contribution.

## What CI actually checks

Every gate in `.github/workflows/ci.yml`, in the order it runs. The pull-request
checklist mirrors this list exactly; if a line here has no gate, it does not
belong on the checklist.

| Gate | Command |
|---|---|
| Release bundle focused | `pnpm exec vitest run packages/cli/src/release` |
| Build-binaries integration | `pnpm run test:build-binaries` |
| End-to-end install | `pnpm exec vitest run packages/cli/src/install/e2e-install.test.ts` |
| Installer syntax | `bash -n install.sh`, PowerShell parse of `install.ps1` |
| Cross-skill link shape | greps `kit/` for stale or unprefixed cross-skill paths |
| Brand drift | `node packages/cli/scripts/check-brand-drift.mjs` |
| Typecheck | `pnpm run lint` |
| Build | `pnpm run build` |
| Kit + provider-matrix drift | `node packages/cli/dist/index.js validate --check --strict` |
| Test + coverage | `pnpm run coverage` |
| Deterministic docs bundle | generated twice, byte-compared |
| Deterministic benchmarks | four benchmark scripts must run clean |
| Scripts + hooks | `node --test` over `scripts/*.test.mjs`, `kit/hooks`, `kit/statusline` |

## Commits

Conventional single-line subjects, lowercase, no trailing period:

```
fix(installer): pin checksums.txt to the canonical domain
feat(validate): check cross-skill links by existence and by shape
docs(plans): close phase 1
```

The body explains *why*, in prose, when the subject cannot carry it. Longer
bodies are normal and welcome for anything subtle.

**No trailers.** No `Co-authored-by`, no tool attribution, no generated-with
footers. `git log` in this repository has none and should keep having none.

**Keep unrelated changes in their own commit.** A drive-by fix inside a feature
commit is invisible in review and unrevertable on its own.

## Pull requests

1. Branch from `dev`.
2. Run the tiers above. Fix what breaks rather than adjusting the test to match.
3. Open the PR against `dev` and fill in the template.
4. Wait for CI. It is not blocking, so waiting is the discipline.
5. Merge with **rebase**, and delete the branch.

### What "done" means

- The behaviour it claims is covered by a test that would fail without the change.
  Deleting the implementation should turn the suite red; if it does not, the test
  is decoration.
- No existing test was weakened to make it pass.
- Public contracts are unchanged unless the change is deliberately about them, and
  then it is called out.
- Comments explain *why*. Not plan IDs, not phase numbers, not audit labels —
  those go stale and mean nothing to the next reader.
- Docs updated only if user-facing behaviour, setup, commands, configuration or
  architecture changed.

## Security

Do not open a public issue for a vulnerability. `SECURITY.md` has the process.

This matters more than usual here: ariadnev installs itself with
`curl | bash` and can replace its own binary, so a flaw in the install or update
path is a code-execution flaw on every machine that runs it.

## Architecture decisions

Consequential decisions live in `docs/decisions/` as numbered ADRs, including the
ones that were later reversed and why. If you are about to argue with a
constraint, check whether an ADR already answers it — and if the ADR is wrong,
say so in the PR rather than working around it quietly.
