# CI/CD audit — GitHub Actions vs Cloudflare split (ariadnev-kit + ariadnev-web)

- Date: 2026-08-23 · Auditor: DevOps/platform audit (read-only; no files changed except this report)
- Scope: `/Users/vchun/Codes/My-projects/vcskill-kit/ariadnev-kit` and `/Users/vchun/Codes/My-projects/vcskill-kit/ariadnev-web`
- Binding priority order applied throughout: 1 Correctness · 2 Security · 3 Stable deployment · 4 Fewer Actions minutes · 5 Faster CI · 6 Simpler maintenance.

---

## 1. Detected architecture

### 1.1 Two separate repositories, one account, both PRIVATE

| | ariadnev-kit | ariadnev-web |
|---|---|---|
| Remote | `git@github.com:bavanchun/ariadnev-kit.git` | `git@github.com:bavanchun/ariadnev-web.git` |
| Visibility | **PRIVATE** (`gh repo view`) | **PRIVATE** (`gh repo view`) |
| Default branch | `main` | `main` |
| Branch model (observed) | `main` + `dev` + `feature/*`, PRs into `dev` (56 CI runs across 20 branches in 7 days) | `main` + `feat/*` + `archive/*`, PRs straight into `main` (7 PRs total, no `dev`) — **verified, not copied from kit** |
| Package manager | pnpm 9 (workflows pin v9; no `packageManager` field in root `package.json`) | pnpm — `"packageManager": "pnpm@10.33.2"` (`ariadnev-web/package.json:7`), Node `24.15.0` (`.node-version`) |
| Monorepo tool | none (plain pnpm workspace, `packages/*`) | none (plain pnpm workspace); no turbo.json / nx.json in either repo |
| Docker / .NET / DB | **none** — no Dockerfile, docker-compose, csproj, sln, or migrations in either repo | **none** |

Because both repos are **private**, Actions minutes and artifact storage are metered (Linux 1×, Windows 2×, macOS 10×), and — on the current plan — **branch protection, required status checks, and environment required-reviewers are unavailable** (documented in-repo: `ariadnev-kit/.github/workflows/finalize-release.yml:32-36` and `ariadnev-web/deployment/production-policy.json` → `"requiredReviewers": "unavailable-on-plan"`).

### 1.2 ariadnev-kit — NOT a Cloudflare workload (verified, not assumed)

- TypeScript/Node monorepo, single package `packages/cli` (`ariadnev`), Bun-compiled to five platform binaries (`packages/cli/package.json` → `build:binary`, `build:release`).
- Distribution: **GitHub Releases only** — no npm publish, no Pages, no Workers. `grep` for `cloudflare|wrangler` across the repo's yml/toml/json hits only skill sample content (`kit/skills/cti-expert/scripts/sample-cti-report-data.json`).
- The public install path (`curl https://ariadnev.com/install | bash`) is served by **ariadnev-web's** edge Worker, which proxies this private repo's Releases with a server-side GitHub App credential (`ariadnev-web/README.md`, `workers/edge/src/github-app-auth.test.mjs`). The kit repo itself never touches Cloudflare.
- Tests: vitest + coverage gate (≥90% on the adapt engine per `CLAUDE.md`), `node --test` suites for hooks/scripts, e2e install gate, deterministic docs-bundle/benchmark gates — all in one CI job.

**Conclusion: correct target for the kit is GitHub Actions = CI + release, Cloudflare = nothing.** There is nothing to move.

### 1.3 ariadnev-web — the Cloudflare workload

pnpm workspace of 6 packages (`pnpm-workspace.yaml`):

| Unit | Framework | Output | Runs on Cloudflare as |
|---|---|---|---|
| `apps/site` | Astro 7.2 (static) | `apps/site/dist` | served via the edge Worker's `ASSETS` binding (not its own prod Worker) |
| `apps/docs` | Next 16 + Fumadocs (static export) | `apps/docs/out` | Worker-with-assets `ariadnev-docs` / `ariadnev-docs-staging` |
| `workers/edge` | Worker (release routes + site assets) | `src/index.js` + site dist | `ariadnev-edge` (apex `ariadnev.com`, `www`) / `ariadnev-edge-staging` |
| `workers/bridge` | Worker (interim apex owner) | — | **retired 2026-08-16** (`deployment/topology.json` → `interim.host.retirement`) |
| `packages/contracts` | tsc lib (docs-bundle schema + verifier) | dist | build-time only |
| `packages/tokens` | design tokens | dist | build-time only |

Dependency graph: `site → tokens`; `docs → contracts + tokens`; `edge → site` (dist via ASSETS); deploy scripts → `contracts` (schema digest). Docs content is generated from a **checked-in** release bundle pin (`releases/ariadnev.json`, `scripts/docs-content/build-content-root.mjs:7-11` — "Nothing is fetched at build time"), so no secret is needed to build.

Deploy topology is source-owned in `deployment/topology.json`: order **docs → edge**, rollback reverse; per-unit wrangler configs; smoke routes per unit; plus a zone-level WAF ingress rule (`workers/edge/rules/raw-download-path-guard.json`, applied by `scripts/manage-edge-ingress-rule.mjs`, token needs Zone→WAF→Edit) and a legacy-host Single Redirect. Environments: **staging** (`staging.ariadnev.com`, `staging.docs.ariadnev.com`) and **production** (`ariadnev.com`, `docs.ariadnev.com`); the frozen legacy Worker `vcskill` (`vcskill.vchun.dev`, root `wrangler.toml`) is the first-cutover rollback target whose credentials are frozen (`topology.json` → `environments.production.legacyWorker`).

Live Cloudflare account state (verified via Workers API 2026-08-23): `ariadnev-edge`, `ariadnev-docs`, `ariadnev-edge-staging`, `ariadnev-docs-staging` (all last modified 2026-08-22 06:41-06:42 — matching auto-deploy run 32557431874, confirming GitHub Actions is the deployer), frozen `vcskill`, plus two dead spike Workers `vcskill-edge-combined-staging` and `vcskill-site-staging` (Aug 8-9, candidate-A spike leftovers).

Security posture that constrains the design: production/staging edge and docs configs set `workers_dev = false` and `preview_urls = false` **deliberately** — "no workers.dev subdomain and no preview URLs, which would sit outside the zone-level ingress rule" (`workers/edge/wrangler.combined.production.toml:18-21`, `wrangler.combined.toml`, `apps/docs/wrangler.*.toml`). The edge Worker holds the GitHub App credential for the private kit repo: secrets `GH_APP_ID`, `GH_APP_INSTALLATION_ID`, `GH_APP_PRIVATE_KEY` (read from `env.*` in `workers/edge/src`; `GH_TOKEN` remains only in the frozen legacy/bridge Workers).

---

## 2. Current CI/CD — workflow audit

Measured window: last 60 runs per repo = **2026-08-16 → 2026-08-23 (7 days)**, `gh run list`/`gh api …/jobs`. The `/timing` billable API now returns zeros (GitHub billing-platform change), so figures below are wall-clock job minutes on `ubuntu-latest` (1× multiplier ⇒ wall ≈ billable for single-job workflows).

### 2.1 ariadnev-kit

```
Workflow CI (.github/workflows/ci.yml)
Trigger: push [main, dev]; pull_request [main, dev] (ci.yml:3-9). No paths filters. No concurrency block. fetch-depth: 0 (ci.yml:23).
Purpose: the single quality gate — focused release-bundle tests, build-binaries integration test, e2e install gate, installer syntax, link/brand gates, typecheck, build, full vitest coverage, deterministic docs-bundle + benchmarks, node:test suites (ci.yml:45-133).
Approximate expensive operations: MEASURED (run 32620963253): Test+Coverage 704s; node:test 37s; focused release gates 19s; benchmarks 13s; e2e install 11s; build-binaries gate 9s; typecheck 9s; everything else ≤5s. Total ~14 min/run. 56 runs/7 days (19 push + 37 PR), avg wall 9.6 min, recent runs 12.0-14.4 min ⇒ ~505 min/week ≈ 2,100-2,300 min/month. This ONE workflow is ~90% of the whole account's Actions bill.
Can optimize: YES — (a) concurrency cancellation: 14 of 56 runs (25%) were superseded by a newer same-branch push while still running (measured from run timestamps); (b) paths-ignore for agent-churn paths (plans/**, .claude/**) with a scheduled full-run backstop; (c) drop the duplicate focused gates that re-run inside coverage (~39s/run, micro); (d) optionally run --coverage only on push events and plain vitest on PRs; (e) shard the 704s vitest step 2-way for wall time (no minutes saved); (f) structural: every change costs two full runs (PR run + push run on dev after the rebase-merge — history on dev is linear, 0 merge commits in the last 40) and the committed 22 MB generated embed multiplies reruns via cross-PR conflicts — see P2b/P2c.
Can move to Cloudflare: NO — pure CI for a non-Cloudflare product.
Keep on GitHub: YES (entire workflow).
```

```
Workflow Release (.github/workflows/release.yml)
Trigger: push [main] (release.yml:3-5); concurrency group release-${ref}, cancel-in-progress: false (release.yml:7-9).
Purpose: Changesets version-PR management; when a release commit is detected, calls release-candidate-build.yml then release-candidate-publish.yml (held draft + annotated tag envelope).
Approximate expensive operations: MEASURED: non-release pushes 0.4-0.7 min (version-pr job only); the full 1.1.0 chain was 2.9 job-min total (version-pr 0.45 + candidate build 1.02 + publish 0.43, run 31948759300). Candidate artifact ~192 MB, retention 90 days (release-candidate-build.yml:130-136). New since Aug 22: smoke-cross-platform matrix macos-latest + windows-latest (release-candidate-build.yml:149-187) — macOS bills at 10×, Windows at 2×; it has not yet fired in a real release. Estimated ~24 billable min per actual release cut — rare and justified (it exists to prove Ed25519 verification runs on-platform, which `av update`'s fail-closed design depends on).
Can optimize: MARGINAL — artifact retention 90d × 192MB is the real cost (storage, not minutes; see Problems). Minutes are already tight.
Can move to Cloudflare: NO — release provenance chain is GitHub-native (artifacts, draft releases, annotated tags, immutable releases).
Keep on GitHub: YES, unchanged.
```

```
Workflow Release Candidate Build (.github/workflows/release-candidate-build.yml)
Trigger: workflow_call from release.yml only.
Purpose: reproducible 5-target Bun binary build + docs bundle at the exact source SHA, previous-stable diff lock, inner provenance attestation, single flat candidate artifact, cross-platform smoke.
Approximate expensive operations: build job ~1 min (measured); macOS/windows smoke matrix per release (see above); 192MB artifact upload.
Can optimize: retention-days 90 → shorter (owner decision — finalization must happen inside the window; finalize-release.yml asserts expires_at > now).
Can move to Cloudflare: NO.
Keep on GitHub: YES.
```

```
Workflow Release Candidate Publish (.github/workflows/release-candidate-publish.yml)
Trigger: workflow_call from release.yml only.
Purpose: verify the candidate envelope byte-for-byte (zip digest, attestation, checksums), create annotated tag carrying the envelope, create held DRAFT release with assets; EXACT-NOOP on re-run.
Approximate expensive operations: ~0.4 min + one 192MB artifact download (maxBuffer note at :60-62).
Can optimize: NO (correctness-critical, cheap).
Can move to Cloudflare: NO.
Keep on GitHub: YES.
```

```
Workflow Finalize Release (.github/workflows/finalize-release.yml)
Trigger: workflow_dispatch with 9 inputs incl. an OFFLINE Ed25519 signature over "<version>\n<checksums.txt>" made with the maintainer's key that is deliberately NEVER a GitHub secret (finalize-release.yml:14-21).
Purpose: verify everything again (candidate run, tag envelope, source digests, signature against the public key extracted from the shipped source), upload checksums.txt.sig, publish the draft as an immutable release; beta tags stay prerelease/never-latest (:200-218).
Approximate expensive operations: 0.5-0.7 min/dispatch (measured, 3 runs).
Can optimize: NO.
Can move to Cloudflare: NO — this is the trust root of the whole distribution chain.
Keep on GitHub: YES, untouched. Do not let any "cleanup" touch this file.
```

### 2.2 ariadnev-web

**There is no PR CI workflow at all.** The only four workflows:

```
Workflow auto-deploy (.github/workflows/auto-deploy.yml)
Trigger: push [main] + workflow_dispatch (auto-deploy.yml:30-33); concurrency auto-deploy-production, cancel-in-progress: false (:38-42).
Purpose: qualify → compose immutable inputs → deploy staging → deploy production. Qualification (pnpm test:qualification:ci = contracts build + docs:content + contracts tests + typecheck + full build + unit/native tests, package.json:15) gates the deploy; the qualified bytes are uploaded once (web-product artifact) and deployed to BOTH environments without rebuild (:83-93) — the build-once invariant is already satisfied. Deploy = WAF ingress-rule reconcile (:190-193, CLOUDFLARE_WAF_TOKEN) + node scripts/deploy/deploy-units.mjs which runs `wrangler deploy --config <per-unit toml>` in topology order docs→edge with machine-route smoke after each unit (deploy-units.mjs:27-48) + verify-convergence + probe-public-edge + sanitized cutover record.
Approximate expensive operations: MEASURED (run 32557431874): qualify 2.6 min (incl. playwright chromium install) + compose 0.6 + staging 1.1 + production 1.1 ≈ 5.4 job-min per main push; 7 pushes/7 days ⇒ ~38 min/week ≈ ~160 min/month.
Can optimize: minor — cache playwright browsers; nothing material.
Can move to Cloudflare: NOT SAFELY AS A WHOLE — see §4.2 for the six concrete blockers (topology ordering across two Workers, WAF reconciliation, qualification gating without branch protection on the current GitHub plan, convergence/smoke gates, build-once invariant, secretless previews). This is a deploy CONTROL PLANE, not a site build.
Keep on GitHub: YES (with one correctness fix — see Problems P1).
```

```
Workflow deploy (.github/workflows/deploy.yml)
Trigger: workflow_dispatch (environment + committed input JSON path) (deploy.yml:17-28); concurrency deploy-${environment}, no cancel.
Purpose: manual escape hatch superseded by auto-deploy for the common path (auto-deploy.yml:4-7): re-deploy an old immutable input; includes the production-controls preflight job (verify-production-environment.mjs, CORE_POLICY_READ_TOKEN) that auto-deploy DOES NOT run.
Approximate expensive operations: 3.4-4.5 min/dispatch; 22 dispatches in the window were the 1.1.0-cutover era, steady state ≈ 0. Its build job re-runs full qualification at productSha (deploy.yml:119-120) — a justified second build (artifact may be expired; deployment must ship qualified bytes).
Can optimize: no (dormant).
Can move to Cloudflare: NO (an immutable-input redeploy of an arbitrary past SHA has no Cloudflare-Git-Integration equivalent).
Keep on GitHub: YES, as-is.
```

```
Workflow edge-health (.github/workflows/edge-health.yml)
Trigger: cron 37 2 * * * daily + workflow_dispatch (edge-health.yml:16-27).
Purpose: standing liveness probe of /install, /version, /download/* — the failure email IS the alert; deliberately dependency-free and secret-free.
Approximate expensive operations: 0.3-0.4 min/day ≈ 12 min/month.
Can optimize: negligible.
Can move to Cloudflare: possible (Worker cron probing the edge) but you would lose the free failure-email alerting channel and gain a component to monitor the monitor. Not worth it.
Keep on GitHub: YES.
```

```
Workflow rollback (.github/workflows/rollback.yml)
Trigger: workflow_dispatch (environment + committed rollback plan JSON) (rollback.yml:18-29); same concurrency group as deploy.
Purpose: version rollback or first-cutover rollback in reverse topology order + convergence smoke; never writes the frozen legacy credential.
Approximate expensive operations: ~0 (unused in window).
Can optimize: no.
Can move to Cloudflare: NO — this is the recovery path; it must not depend on the system being recovered.
Keep on GitHub: YES, untouched.
```

### 2.3 Duplication check across the two systems

- **No artifact is built twice today.** auto-deploy builds once and deploys those bytes to staging and production. Cloudflare currently builds nothing (no Git Integration connected — deploys arrive via `wrangler deploy` from Actions, confirmed by Worker modified-timestamps matching Actions runs).
- No `pull_request_target`, no self-hosted runners, no Docker builds, no over-broad matrices (the only matrix is the 2-OS release smoke, justified). Dependency caching (`cache: pnpm`) is present in every job of both repos.
- Kit CI duplicates ~39s of its own tests (focused gates at ci.yml:45-57 re-run inside the coverage step at :110-111) — fail-fast by design, micro cost.

---

## 3. Problems found (ranked by the binding priority order)

**P1 — Correctness/stability: auto-deploy's stated safety net does not exist.** `auto-deploy.yml:10-13` claims "the `web-production` GitHub environment's approver rule still runs before the production job executes. That approver gate is the load-bearing safety net." Live state (GitHub API, 2026-08-23): both `web-staging` and `web-production` have **zero required reviewers** — only a branch policy (custom branches). `deployment/production-policy.json` admits `"requiredReviewers": "unavailable-on-plan"` and declares the human gate as `"workflow-dispatch"` — but auto-deploy triggers on **push**, and the `environment-policy` verification job exists only in `deploy.yml:70-96`, not in auto-deploy. Net effect: every push to `main` deploys production unattended ~5 minutes later, gated only by the qualification tests. This may even be what the owner wants (it matches the target sketch) — but the workflow header and the policy file both misdescribe reality. Decide (Open Question Q2), then make the file say the truth.

**P2 — Cost with a correctness edge: kit CI is ~90% of the bill and burns 25% of itself on superseded runs.** ~2,100-2,300 min/month projected from the measured week, single job, no `concurrency` block in `ci.yml`. 14/56 runs were already-obsolete when they finished. With the free private-repo quota at 2,000 min/month, the account is at or past the metered line on this workflow alone.

**P2b — Cost driver behind the run count: the committed generated embed.** `packages/cli/src/kit/kit-embedded.generated.ts` is a **22 MB generated file, committed**, produced from everything under `kit/` by `pnpm --filter ariadnev generate:embedded` (`packages/cli/package.json:37`) and imported by `embedded-kit.ts:6`. A vitest drift guard (`packages/cli/src/kit/embedded-kit.test.ts:133-141` — "stale embed … run generate-embedded-kit.mjs") correctly refuses drift, which means **every PR touching any kit content must regenerate and commit the 22 MB file**. Measured churn: it changed in **32 of the last 100 commits on dev**. Consequence chain: any two concurrent content PRs conflict on this one file → loser rebases locally, regenerates, force-pushes → one more full ~14-min CI run (and, without cancel-in-progress, the superseded run finishes anyway). Field observation from the maintainer (2026-08-23): six content PRs became ~10 CI runs in one day. This is a minutes problem, not just DX. Options in §5.1a. (A `.gitattributes` `merge=union` strategy is NOT an option here — union-merging a generated single-expression TS blob corrupts it; and custom merge drivers never run on GitHub's server side, so they don't remove the rebase cycle.)

**P2c — Every change is billed twice by design.** `pull_request` and `push` both trigger on dev (ci.yml:3-9), and dev history is linear (rebase/squash merges), so a clean rebase-merge re-validates a tree identical to the PR head that just passed: ~19 push runs/week × ~13.5 min ≈ **~250 min/week of post-merge re-validation**. It is only *pure* duplication when the rebase was clean and dev did not move — with P2b conflicts, dev moves constantly, so some push runs genuinely validate a different tree. Removal is therefore an option pair, not a free win (see §5.1, item 1c).

**P3 — Cost: 961 MB of live Actions artifacts in ariadnev-kit vs a 500 MB private-repo storage quota.** Five 192 MB candidate zips at 90-day retention (`release-candidate-build.yml:135`), four of which are dead Aug-15/16 attempts that were superseded before finalization; only one became `ariadnev@1.1.0`. Deleting superseded candidates after their release is finalized is safe (finalization re-verifies from the release assets and tag envelope, not from dead candidates), but do it manually — never auto-delete (P7 interplay).

**P4 — Correctness gap: ariadnev-web has no PR CI.** PRs into `main` get zero checks; the first test signal is post-merge, inside the production pipeline. Fail-closed (a bad merge deploys nothing) but it turns `main` red and blocks all deploys until fixed. The owner's own target sketch requires a PR CI leg.

**P5 — Security consistency: no branch protection is possible on the current GitHub plan** (private repos, Free tier). Anything — including an agent with push access — can push to `main` in either repo, which in ariadnev-web means an unattended production deploy attempt (P1) and in ariadnev-kit means a release-channel commit landing without PR review. Not fixable in-repo; plan or visibility decision (Q1).

**P6 — Hygiene: stale secret and dead Workers.** `NPM_TOKEN` exists in ariadnev-kit but is referenced by no workflow (grep across `.github/` — zero hits; the kit ships no npm package). Two spike Workers (`vcskill-edge-combined-staging`, `vcskill-site-staging`, untouched since Aug 9) linger on the Cloudflare account. Flag only — do not delete anything automatically.

**P7 — Micro: kit ci.yml `fetch-depth: 0`** (full clone, ci.yml:22-24) is not needed by any CI step (brand-drift uses `git ls-files`, which works shallow); it costs a few seconds. Release workflows DO need history (`resolve-previous-stable.mjs`) — change CI only.

**P8 — Flaky test burns rerun minutes.** `packages/cli/src/eval/behavioral-runner.test.ts` fails intermittently under CPU contention (maintainer report, 2026-08-23; a budget-raising fix for the sibling `behavioral-suite.test.ts` already merged via `fix/behavioral-suite-test-budget`). Each flake that triggers a manual rerun costs a full ~14 min. Not fixed here per scope; tracked as a minutes line-item — if flakes persist after the budget fix, quarantine or deflake before adding any retry automation (blanket `--retry` would hide real regressions).

Non-issues verified: migrations (none exist, nothing to protect); `pull_request_target` (absent); fork-PR secret exposure (private repos, no fork PRs; deploy secrets are environment-scoped anyway); double builds (none, §2.3).

---

## 4. Proposed target architecture

### 4.1 ariadnev-kit — GitHub-only, optimized CI (unchanged release chain)

```
PR into dev/main ── GitHub Actions "CI" (single job, concurrency-cancelled, path-filtered)
push dev/main   ── same CI (main pushes never cancelled)
push main       ── Release → candidate build → held draft  (unchanged)
maintainer      ── Finalize Release (workflow_dispatch + offline signature, unchanged)
weekly cron     ── CI full run backstop (new, catches drift the path filter skips)
```

No Cloudflare anywhere. Confirmed correct: do not force this workload onto Cloudflare.

### 4.2 ariadnev-web — the honest verdict on "Cloudflare Git Integration owns build+deploy"

The owner's rule is "no `wrangler deploy` from GitHub Actions **if Cloudflare Git Integration can own it**". Verified against current Cloudflare docs (Workers Builds: per-Worker Git projects, root directory, build/deploy commands, build watch paths, monorepo support, non-production branch builds → `wrangler versions upload` → preview URLs, GitHub check runs): **Workers Builds cannot own this deployment without violating priorities 1-3.** Six concrete blockers:

1. **Topology ordering.** One Workers Builds project = one Worker. `docs → edge` order with fail-stop smoke between units (`deployment/topology.json`, `deploy-units.mjs`) has no cross-project ordering primitive in Workers Builds.
2. **Qualification gating.** Workers Builds triggers on push; it cannot wait for GitHub checks. On the current GitHub plan there is no branch protection (P5), so "CI green before merge" is unenforceable — a push to `main` would deploy unqualified code. Today the qualification gate runs *inside* the deploying workflow and fails closed. Moving deploy to Cloudflare removes the only enforced gate. (Running the full qualification as the CF build command is not credible: it needs Playwright Chromium with system deps in CF's build image, and would also have to run once per Worker project — the same suite twice.)
3. **Build-once invariant.** Today the deployed bytes are exactly the qualified bytes (auto-deploy.yml:83-93). Two independent CF builds (docs project, edge project) rebuild independently of whatever CI tested — the precise "same artifact built twice across two systems" the owner banned.
4. **Zone-level WAF reconciliation.** The raw-download-path-guard rule is applied at deploy time with a separate WAF-scoped token (auto-deploy.yml:190-193). A CF build could run the script, but that puts a Zone→WAF→Edit token into a git-triggered build environment — a scope escalation for every branch build.
5. **Preview URLs vs the security design.** Non-production branch builds upload versions **of the same Worker**; preview versions see the Worker's secrets. For `ariadnev-edge` that is the GitHub App private key over the private kit repo, and preview URLs sit on workers.dev *outside* the zone ingress rule — exactly what `preview_urls = false` exists to prevent (`wrangler.combined.production.toml:18-21`). Enabling Git-integration previews on the production Workers is a security regression.
6. **Convergence/rollback evidence.** verify-convergence, probe-public-edge, sanitized cutover records, and the rehearsed rollback workflow have no Workers Builds equivalent; losing them trades priority 3 for priority 4.

**Minutes at stake if it were moved anyway: ~160 min/month (~7% of the account bill).** The cost/benefit is upside-down: the bill lives in kit CI, not in web deploys.

### 4.3 Recommended target (adopts the owner's sketch where it is safe)

```
ariadnev-web PR ──┬── GitHub Actions "web-ci" (NEW: contracts build, typecheck, unit/native + contract tests — no browser, no full build)
                  └── Cloudflare Workers Builds PREVIEW projects (OPTIONAL, Q3):
                        ariadnev-site-preview / ariadnev-docs-preview — secretless, workers.dev-only,
                        never touching the four production/staging Workers; check runs appear on the PR
                            │ merge → main
main push ──────────── auto-deploy.yml (KEPT): qualify → build once → staging → production
                        (Cloudflare Workers Paid plan is still used — it runs the production edge/docs
                         Workers, static assets, custom domains, WAF rule, observability; and optionally
                         the preview builds. "Using the paid plan" ≠ "Git Integration must deploy prod".)
manual  ─────────────── deploy.yml (escape hatch) · rollback.yml · edge-health.yml (kept)
```

The preview leg gives the sketch's "Cloudflare Preview URL on PR" without production secrets: **new, dedicated preview Workers** built by Workers Builds from the same repo, holding no secrets and no custom domains. Preview URLs bypass the zone WAF — bounded exposure because previews serve static marketing/docs content only; the protected release routes simply 500 in preview (no credentials present). This is marked OPTIONAL because the repo's own decision record argues against any origin outside the ingress rule — owner call (Q3).

### 4.4 Per-Cloudflare-project statement (exact values)

Existing production/staging Workers — **stay API-deployed from auto-deploy.yml; do NOT connect Git Integration to them**:

| Project | Production branch | Root dir | Build command | Deploy command | Env/secrets |
|---|---|---|---|---|---|
| `ariadnev-docs` | n/a (no Git Integration) | repo root | (built in auto-deploy: `pnpm run test:qualification:ci`) | `wrangler deploy --config apps/docs/wrangler.production.toml` (from Actions) | none |
| `ariadnev-docs-staging` | n/a | repo root | same build | `wrangler deploy --config apps/docs/wrangler.staging.toml` | none |
| `ariadnev-edge` | n/a | repo root | same build | `wrangler deploy --config workers/edge/wrangler.combined.production.toml` | secrets (dashboard/wrangler, names only): `GH_APP_ID`, `GH_APP_INSTALLATION_ID`, `GH_APP_PRIVATE_KEY` |
| `ariadnev-edge-staging` | n/a | repo root | same build | `wrangler deploy --config workers/edge/wrangler.combined.toml` | same three names, separate namespace |
| `vcskill` (legacy, frozen) | NEVER connect | — | — | — | `GH_TOKEN` (frozen until rollback window closes — `topology.json`) |

Proposed OPTIONAL preview projects (new Workers, new in-repo configs):

| Project | Production branch | Root dir | Build command | Deploy command (prod branch) | Non-prod branch deploy command | Watch paths (include) |
|---|---|---|---|---|---|---|
| `ariadnev-site-preview` | `main` | `/` (workspace root; pnpm needs the lockfile) | `pnpm install --frozen-lockfile && pnpm --filter @ariadnev-web/tokens build && pnpm --filter @ariadnev-web/site build` | `npx wrangler deploy --config apps/site/wrangler.preview.toml` | `npx wrangler versions upload --config apps/site/wrangler.preview.toml` | `apps/site/**`, `packages/tokens/**`, `pnpm-lock.yaml` |
| `ariadnev-docs-preview` | `main` | `/` | `pnpm install --frozen-lockfile && pnpm --filter @ariadnev-web/contracts build && pnpm --filter @ariadnev-web/tokens build && pnpm run docs:content && pnpm --filter @ariadnev-web/docs build` | `npx wrangler deploy --config apps/docs/wrangler.preview.toml` | `npx wrangler versions upload --config apps/docs/wrangler.preview.toml` | `apps/docs/**`, `packages/**`, `releases/**`, `scripts/docs-content/**`, `pnpm-lock.yaml` |

In-repo vs dashboard: the two `wrangler.preview.toml` files (name, `workers_dev = true`, `preview_urls = true`, assets dir, NO routes, NO secrets) are in-repo; repo connection, production branch, root dir, build/deploy commands, watch paths, build caching, and non-production-branch-builds toggle are **dashboard-only** settings. Workers Builds authenticates with a Cloudflare-managed token — no GitHub secret needed. Node version is honored from `.node-version` (24.15.0).

---

## 5. Exact implementation plan (no edits made — this is the plan)

### 5.1 Files to modify

1. `ariadnev-kit/.github/workflows/ci.yml`
   - Add: `concurrency: { group: ci-${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: ${{ github.ref != 'refs/heads/main' && github.ref != 'refs/heads/dev' }} }` — PR bursts cancel; protected-branch pushes never cancelled. (If the owner accepts cancelling dev pushes too, widen the condition to main-only for more savings.)
   - Add `paths-ignore` on both `push` and `pull_request`: `plans/**`, `.claude/**` — with the P/Q6 caveat: `check-brand-drift.mjs` scans *all tracked files*, so a plans-only commit with old-brand text would surface on the *next* full run instead of its own. Backstop: add `schedule: [{cron: "0 3 * * 1"}]` weekly full run.
   - Change `fetch-depth: 0` → drop the `with:` (default shallow) at ci.yml:22-24.
   - OPTIONAL (Q4): split step "Test + Coverage gate" so PRs run `vitest run` and pushes run `pnpm run coverage` (thresholds still enforced before anything merges to main via the dev push run). Do NOT do this if the owner wants coverage enforcement per-PR.
   - 1c. The PR-run/push-run pairing (P2c) is an **option pair, pick one**: **(B, recommended)** keep push:dev as the full gate (with coverage) and lighten PR runs per Q4 — dev is always fully validated post-merge, safe even without branch protection; or **(A)** keep PRs full and drop `push: [dev]` — saves ~250 min/week but leaves direct pushes to dev entirely unchecked, which is unsafe while branch protection is unavailable (P5). Do not adopt A before Q1 resolves.
   - **Explicit tradeoff — do NOT split the mega-job into parallel jobs.** Per-job setup overhead is ~20-30 s measured (checkout 4 + pnpm 5 + node 8 + bun 1 + install 2, run 32620963253); N parallel jobs pay it N times and **raise total billable minutes** while lowering wall-clock. The owner ranks minutes (4) above speed (5), so the single sequential job is the right shape; 2-way vitest sharding is available later if wall-clock ever becomes the constraint, at a known billable premium.

1a. **The committed 22 MB embed (P2b) — structural options, owner picks (Q10):**
   - **Option 1 (recommended): stop committing `kit-embedded.generated.ts`.** Add it to `.gitignore`; change `packages/cli` `"build"` to `bun scripts/generate-embedded-kit.mjs && tsup` (and generate before vitest in CI, one extra step, seconds — the analogous docs-bundle generation step already runs in 2 s, ci.yml:113-117). Replace the stale-embed drift guard (`embedded-kit.test.ts:133-141`) with a **determinism gate** (generate twice, byte-compare — same pattern as the existing "Deterministic provisional docs bundle" step). Effect: kit-content PRs no longer touch a shared 22 MB file → cross-PR conflicts on it disappear → the rebase-regenerate-rerun cycle (~4 extra full runs on a busy day, maintainer-measured) disappears; repo size stops growing by megabytes per content commit. Risks to verify before adopting: `build:release`/`build:binary` already regenerate (packages/cli/package.json:41 — unaffected); any workflow or script that assumes the file exists in a fresh checkout must gain the generate step; generation must be deterministic (assert it in CI, don't assume).
   - **Option 2 (fallback): keep it committed** but mark it `-diff -merge binary` in `.gitattributes` so conflicts fail fast instead of producing garbage merges, and document the regenerate-on-rebase step. This removes zero reruns; it only makes the conflict cheaper to resolve. Union merge is explicitly rejected (corrupts a generated single-expression module), and local merge drivers don't run on GitHub's side.
2. `ariadnev-kit/.github/workflows/release-candidate-build.yml` — `retention-days: 90` → `30` (or the owner's finalize SLA + margin; finalization must occur before expiry) at line 135.
3. `ariadnev-web/.github/workflows/auto-deploy.yml` — fix the false header claim (lines 10-13) per the Q2 decision; if unattended-on-merge is confirmed, also update `deployment/production-policy.json` (`humanGate`) so `verify-production-environment.mjs` keeps telling the truth.

### 5.2 Files to create

1. `ariadnev-web/.github/workflows/ci.yml` (new "web-ci") — `on: pull_request: [main]`; single ubuntu job, `concurrency` cancel-in-progress, `cache: pnpm`, steps: `pnpm install --frozen-lockfile` → `pnpm --filter @ariadnev-web/contracts build` → `pnpm run typecheck` → `pnpm run contracts` → the browserless subset of `test:native` (worker/edge/bridge unit tests, deployment control-plane tests, token contracts). No Playwright, no site/docs full build — the full qualification remains the deploy gate in auto-deploy, so nothing is built twice. Est. ~3 min/PR at ~1 PR/week ⇒ negligible cost.
2. OPTIONAL (Q3): `ariadnev-web/apps/site/wrangler.preview.toml` and `ariadnev-web/apps/docs/wrangler.preview.toml` — preview Worker identities as specified in §4.4. (Do not reuse `apps/site/wrangler.toml` — that is the preserved Candidate-A decision record, `apps/site/wrangler.toml:1-13`.)

### 5.3 Files to delete

**None.** Every existing workflow is load-bearing or a rehearsed recovery path. (`deploy.yml` looks superseded but is the immutable-input escape hatch and the only place the production-controls preflight runs.)

### 5.4 Workflows to preserve unchanged

`ariadnev-kit`: release.yml, release-candidate-build.yml (except retention number), release-candidate-publish.yml, finalize-release.yml. `ariadnev-web`: deploy.yml, rollback.yml, edge-health.yml.

### 5.5 Workflows to replace

None replaced. auto-deploy.yml stays the deploy owner (§4.2 rationale). If the owner later gains required-status-check enforcement (GitHub Pro or public repos), revisit whether Workers Builds should own the docs unit (it is secretless and order-tolerant once both hosts exist); the edge unit should stay scripted regardless (WAF rule + secrets + apex).

### 5.6 Cloudflare configuration required outside the repository

Only if Q3 = yes (previews): dashboard steps in §7 below. Otherwise: none — no Cloudflare-side change is required for the recommended architecture. (Optional hygiene, owner-executed: delete spike Workers `vcskill-edge-combined-staging`, `vcskill-site-staging` after confirming nothing references them; do NOT touch `vcskill` — frozen rollback target.)

### 5.7 Risks

| Risk | Mitigation |
|---|---|
| paths-ignore lets a brand-drift/plans regression land silently | weekly scheduled full CI; drift blames the wrong PR at worst, never ships (release path always full-runs) |
| cancel-in-progress cancels a run someone was watching | scope: never cancel main (and optionally dev) pushes |
| retention cut expires a candidate before finalization | pick retention = finalize SLA + margin; finalize fails closed on expiry (finalize-release.yml:104) |
| new web-ci diverges from qualification (green PR, red main) | keep web-ci a strict subset of test:qualification:ci; never add PR-only steps |
| preview Workers leak pre-release marketing/docs content on workers.dev | private repo + obscure URLs; acceptable for marketing/docs only — never bind preview to real hostnames, never add secrets (this is the Q3 trade) |
| comment fix in auto-deploy misread as behavior change | comment/policy-only diff, no job changes, reviewed alone |

### 5.8 Recommended required status checks (recommendation ONLY — do not change settings)

- `ariadnev-kit` → branches `dev`, `main`: require `CI / Lint · Build · Test` (job id `ci`).
- `ariadnev-web` → branch `main`: require `web-ci` (new), plus the two Workers Builds check runs if Q3 lands.
- Blocker: unavailable on the current plan for private repos (P5). Options: GitHub Pro, org+Team, or making a repo public — owner decision (Q1). Until then, checks are advisory.

### 5.9 Secrets migration table (names only — never delete automatically)

| Secret | Where today | Under recommended target | Action |
|---|---|---|---|
| `CLOUDFLARE_DEPLOY_TOKEN` | GH env `web-staging` + `web-production` | still needed (Actions deploys) | keep |
| `CLOUDFLARE_WAF_TOKEN` | GH env `web-staging` + `web-production` | still needed (ingress-rule reconcile) | keep |
| `CORE_POLICY_READ_TOKEN` | GH repo `ariadnev-web` | still needed (deploy.yml preflight) | keep |
| `NPM_TOKEN` | GH repo `ariadnev-kit` | referenced by nothing | flag as removable — owner verifies no external use, then deletes manually |
| `GH_APP_ID` / `GH_APP_INSTALLATION_ID` / `GH_APP_PRIVATE_KEY` | Cloudflare Worker secrets on `ariadnev-edge` + `ariadnev-edge-staging` | unchanged | keep (already Cloudflare-side) |
| `GH_TOKEN` | Cloudflare Worker `vcskill` (frozen legacy; also the retired bridge if ever redeployed) | unchanged | frozen until rollback window closes |
| — (new) | — | Workers Builds uses a Cloudflare-managed deploy token for preview projects | nothing to create on GitHub |

Nothing moves from GitHub to Cloudflare in the recommended design; if the owner later adopts full CF ownership of the docs unit, `CLOUDFLARE_DEPLOY_TOKEN`'s scope could shrink — flag only after that migration is verified live.

---

## 6. Final report

### Architecture before
- **kit**: PR/push CI mega-job (~14 min, no cancellation, no path filters, ~2,200 min/mo) + 4-workflow release chain (cheap, provenance-heavy, correct). No Cloudflare.
- **web**: no PR checks; push-to-main → one workflow qualifies, builds once, deploys staging then production via `wrangler deploy` from Actions in topology order with WAF reconcile, smoke, convergence, records (~5.4 min/push); manual deploy/rollback + daily probe. Cloudflare runs 4 production/staging Workers + frozen legacy; no Git Integration connected.

### Architecture after (recommended)
- **kit**: same CI content, concurrency-cancelled + path-filtered + weekly backstop + shallow clone; release chain byte-identical; shorter candidate retention.
- **web**: new light PR CI on GitHub; auto-deploy unchanged as the production path with its header/policy corrected to match reality (or a real gate re-added — Q2); OPTIONAL Cloudflare Workers Builds preview projects (secretless, workers.dev-only) giving PR preview URLs + GitHub check runs; production/staging Workers keep being deployed by the control plane.

### GitHub Actions
- **Kept**: kit release chain (4 workflows) untouched; web auto-deploy/deploy/rollback/edge-health.
- **Changed**: kit ci.yml (concurrency, paths-ignore, shallow clone, weekly cron, optional coverage split); release-candidate-build.yml retention; auto-deploy.yml truthful header.
- **Dropped**: nothing.
- **New triggers**: weekly `schedule` on kit CI; `pull_request:[main]` for new web-ci.
- **Concurrency**: kit CI gains per-ref cancel (PRs); web already correct (never cancel deploys, cancel probes).
- **Cache**: pnpm caching already everywhere; optional Playwright browser cache in web qualify.
- **Path filters**: kit CI `paths-ignore: plans/**, .claude/**` (with backstop); web-ci none needed initially (repo is small; add later if plans churn appears).

### Cloudflare
- **Projects**: `ariadnev-edge` (apex `ariadnev.com`/`www`), `ariadnev-docs` (`docs.ariadnev.com`), staging twins, frozen `vcskill` — all stay Actions-deployed; production branch concept n/a (deploys are commit-addressed by immutable inputs). Optional new `ariadnev-site-preview` / `ariadnev-docs-preview` Workers Builds projects: production branch `main`, root dir `/`, build/deploy commands and watch paths exactly as §4.4, previews via `wrangler versions upload` on non-production branches.
- **Preview strategy**: staging environment (staging.ariadnev.com) remains the true pre-production rehearsal; PR-level previews (if adopted) live only on secretless dedicated preview Workers; `preview_urls` stays `false` on all four real Workers.

### Secrets — see §5.9 (names only, no values inspected or printed).

### Manual steps the owner must perform in the Cloudflare dashboard (only if Q3 previews are adopted)
1. Workers & Pages → Create → connect `bavanchun/ariadnev-web` via the Cloudflare Workers & Pages GitHub App (grant repo access).
2. Create project `ariadnev-site-preview`: root `/`, build + deploy + non-prod deploy commands per §4.4, production branch `main`.
3. Settings → Build → Branch control → enable "Builds for non-production branches"; set Build watch paths includes per §4.4; enable Build caching.
4. Repeat 2-3 for `ariadnev-docs-preview`.
5. Verify in a test PR that two GitHub check runs appear and each preview URL serves; verify NO secrets exist on either preview Worker and no custom domain/route is bound.
6. (Hygiene, independent) review & delete `vcskill-edge-combined-staging` and `vcskill-site-staging`; leave `vcskill` alone.

### Verification checklist
- [ ] kit: open a PR, push twice quickly → first run auto-cancels; push to `dev`/`main` → never cancels.
- [ ] kit: plans-only commit triggers no CI; Monday cron runs full CI green.
- [ ] kit: next real release — smoke matrix passes on macOS/Windows; candidate finalizes before new retention expiry; storage drops below quota after owner deletes the 4 dead candidates (~768 MB).
- [ ] kit: `Release`/`Finalize Release` behavior byte-identical (no changes shipped there).
- [ ] kit (if Q10 Option 1): fresh clone + `pnpm run build` succeeds without the committed embed; determinism gate green twice in a row; two concurrent kit-content PRs merge with zero conflicts on generated files; `build:release` output digests unchanged for an identical `kit/` tree.
- [ ] web: open a PR → web-ci runs ≤ ~4 min and is a strict subset of qualification (compare step lists).
- [ ] web: merge to main → auto-deploy qualifies, deploys staging then production, convergence + probe green, cutover-record artifacts present; Worker `modified_on` timestamps match the run.
- [ ] web: edge-health cron still green daily; `deploy.yml`/`rollback.yml` untouched (diff = zero).
- [ ] previews (if adopted): PR shows CF check runs; preview URL serves site/docs; `wrangler secret list` on both preview Workers is empty; production Workers show no Git-Integration connection.
- [ ] secrets: only after all of the above is live, owner manually removes `NPM_TOKEN` if confirmed unused.

### Estimated Actions-minutes reduction
- Baseline (measured week × 4.3): ~2,400 min/month total; kit CI ≈ 2,100-2,300 of it.
- kit concurrency cancellation: **high confidence, medium-high magnitude** — 25% of runs were superseded (14/56 measured); savings are the *unfinished remainder* of cancelled runs, estimate **300-600 min/month**.
- kit paths-ignore: **low-medium, unquantified** — most PRs touch kit content and must run anyway; plans-only pushes exist but were not separable from the run list without per-commit diffing. Say so plainly: no measured number.
- kit shallow clone + de-duplicated focused gates: **low** (~1 min/run combined upper bound).
- kit un-committing the generated embed (§5.1a Option 1, if Q10 = yes): **medium** — eliminates the conflict-rebase-rerun cycle (maintainer-measured ~4 extra full runs ≈ 54 min on one busy day; scales with concurrent content PRs, which is the repo's normal mode). Not separable in the 60-run sample from ordinary pushes, so no monthly number is claimed — rated medium on the one-day measurement.
- kit option pair B (PRs without coverage, push:dev full): counted under the coverage line above; option pair A (drop push:dev) would be **~1,000 min/month** but is unsafe before Q1 — not recommended now.
- kit flake reruns (P8): **low, real** — each flake-triggered rerun is ~14 min; expected to shrink after the merged budget fix; monitor rather than automate retries.
- kit coverage-on-push-only (if Q4 = yes): **medium, unmeasured** — v8 instrumentation overhead on a 704 s step; plausibly 100-300 min/month across 37 PR runs/week, needs one A/B run to confirm.
- web changes: net **≈ 0** (new PR CI adds ~15 min/month; nothing removed — deliberately, per priorities 1-3; moving deploys to CF would have saved only ~160 min/month).
- Storage: −768 MB immediately available (owner deletes dead candidates), recurring exposure capped by retention change.
- **Net: roughly 450-1,000 min/month (~20-40%) with zero risk to the release chain or the deploy control plane** — concurrency cancellation + embed un-commit + coverage split carry most of it; wall-clock CI can additionally drop ~14 → ~8 min via 2-way vitest sharding at a known billable premium (deliberately not recommended while minutes outrank speed).

---

## 7. Open questions (owner decisions — not guessed)

1. **GitHub plan**: stay on Free (no branch protection/required checks/reviewers on these private repos), upgrade to Pro, or take either repo public? This gates §5.8 entirely and half of Q2.
2. **Production gate for ariadnev-web**: keep today's actual behavior (unattended deploy on merge to main, qualification-gated — matches your sketch) and correct the auto-deploy header + production-policy.json to say so; or restore a human gate (required reviewers after a plan upgrade, or demote auto-deploy to staging-only and make production `deploy.yml`-dispatch-only)? Currently the file claims a gate that does not exist (P1).
3. **PR preview URLs**: do you want the Cloudflare preview leg at all, given `docs/decisions/edge-routing-topology.md` + `preview_urls = false` deliberately keep every public origin behind the zone ingress rule? Previews would put marketing/docs content (only) on workers.dev outside that rule.
4. **Coverage policy in kit CI**: is the ≥90% coverage threshold a per-PR gate, or is enforcement on dev/main pushes sufficient (cheaper PRs)?
5. **Candidate retention & cleanup**: what is your finalize-within-N-days SLA (sets `retention-days`), and may the four dead Aug-15/16 candidates be deleted now?
6. **plans/** in CI scope**: accept deferred brand-drift detection on plans-only commits (weekly backstop catches it) in exchange for skipped runs, or keep plans/** in CI triggers?
7. **NPM_TOKEN**: what was it for? No workflow references it; confirm before removal.
8. **Dead spike Workers**: may `vcskill-edge-combined-staging` and `vcskill-site-staging` be deleted from the Cloudflare account?
9. **edge-health placement**: keep on GitHub (free failure-email alerting) or move to a Cloudflare cron Worker (needs a new alert channel)? Recommendation: keep on GitHub.
10. **The committed embed** (P2b / §5.1a): move `kit-embedded.generated.ts` to build-time generation with a determinism gate (Option 1, recommended — removes the cross-PR conflict-rerun cycle), or keep it committed with conflict hardening (Option 2)? Option 1 touches the build scripts and a test, so it is a change to the product repo, not just CI — it needs its own small plan and the owner's sign-off.
11. **PR/push run pairing** (P2c / §5.1 item 1c): confirm option B (push:dev stays the full coverage gate, PRs lighten) — or defer both until Q1 (branch protection) is decided?
