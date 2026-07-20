# vcskill

## 0.8.0

### Minor Changes

- fe28959: CLI "xịn" program — a branded terminal UI plus six capability upgrades
  (brainstorm → plan → 4-reviewer red-team → TDD build):

  - **Branded terminal UI + `vc` short alias.** Output is colored/branded on a TTY
    and plain when piped/CI/`NO_COLOR`, cohesive with the vcskill.vchun.dev landing
    page (coral wordmark, `✓/skip/◆` glyphs). `contract` renders a terminal matrix
    grid on a TTY. The installer links a guarded `vc` alias (never clobbers an
    existing `vc`; `VCSKILL_ALIAS=off` to skip).
  - **`vcskill doctor` scored audit.** A 0–100 health bar, per-check tri-state
    (pass/skip/warning/fail), and an exact remediation command per finding. The
    score is informational only — the exit-code contract is unchanged.
  - **Credential sanitizer + `SECURITY.md`.** GitHub/OpenAI token shapes, URL
    userinfo, and secret-shaped env values are redacted from all output at a single
    boundary (empty/short values never shred output).
  - **`vcskill eval`.** Cost-tiered skill-quality gate: tier-1 static (free, always)
    - tier-3 LLM judge when `VCSKILL_EVAL_CMD` is set.
  - **`contract --json` machine envelope** (`protocol_version`, `capabilities[]`,
    schema range; legacy `version` preserved) + CI now runs the `.mjs`/`.cjs` test
    suites.
  - **`vcskill query`.** A local, append-only JSONL history (`~/.vcskill/history.jsonl`)
    of installs, doctor runs, and updates; recording is best-effort and
    allowlist-scrubbed (no free-form/secret data persisted).
  - **Anonymous, opt-out telemetry** facility (`vcskill telemetry status`) — stateless,
    categorical-only, and off by default (nothing is transmitted until an endpoint
    is configured). Opt out with `VCSKILL_TELEMETRY_DISABLED=1` / `DO_NOT_TRACK=1`.

## 0.7.0

### Minor Changes

- a297c5e: Installer self-verification + kit-quality gates (distilled from comparing
  claudekit-engineer, repository-harness, and Archon):

  - `vcskill contract [--json]` — provider×artifact capability contract, generated
    from the same resolver/spec-verified source the installer uses.
  - `vcskill validate --check` — fail if the README provider matrix drifts from
    the generated source of truth (wired into CI).
  - `vcskill doctor --fix` — re-merge hook bindings that drifted out of
    settings.json (backs up first, atomic, idempotent; honors `--dry-run`).
  - `validate` now flags confusable skill descriptions (Jaccard scorer:
    near-duplicate → error, similar → warning).
  - Passive "newer version available" nudge after a command (stderr, cached,
    CI-silent, never blocks).
  - Release CI now smoke-tests the freshly-compiled binary (version, embedded kit
    loads, no leaked build paths).
  - Security: ignore `VCSKILL_*` injected via a project's auto-loaded dotenv files
    (`.env`, `.env.local`, `.env.{NODE_ENV}`) — a hostile repo could otherwise
    redirect the cache/config. vcskill config is owned by the shell.

## 0.6.0

### Minor Changes

- 12c33ce: Install and self-update now go through the vcskill edge (`vcskill.vchun.dev`)
  instead of GitHub directly, so the repo can be **fully private**.

  - Install: `curl -fsSL https://vcskill.vchun.dev/install | bash` /
    `irm https://vcskill.vchun.dev/install.ps1 | iex`.
  - `vcskill update` checks `/version` and downloads binaries from `/download/…`
    on the edge (still sha256-verified, still self-updating).
  - A Cloudflare Worker (`cloudflare-worker/`) proxies the private repo's install
    scripts and release binaries with a server-side token — the only public face.
    Setup runbook: `docs/cloudflare-worker-setup.md`.

- 412a2db: `vcskill update` now **self-updates** the binary in place — download the latest
  release for your platform, verify its sha256, and atomically replace the running
  binary. No need to re-run the curl installer.

  - `vcskill update` — upgrade to the latest release (fail-closed on checksum
    mismatch; never replaces on a bad download).
  - `vcskill update --check` — only report whether a newer version exists (the old
    behavior).
  - When run via `node` (not the compiled binary) it guides you to the curl
    installer instead of replacing `node`.

## 0.5.0

### Minor Changes

- d07bfda: vcskill now ships as a **standalone binary** installed via `curl | bash` — no
  Node runtime required. npm publishing is dropped.

  - **Install** with one line: `curl -fsSL …/install.sh | bash` (macOS/Linux),
    `irm …/install.ps1 | iex` (Windows), or `brew install bavanchun/vcskill/vcskill`.
    Each installer verifies the binary's sha256 before installing.
  - The kit is **embedded** in the binary and self-extracts to a version-stamped
    cache on first run, so the single file is fully self-contained.
  - Releases now publish 5 cross-compiled binaries (darwin arm64/x64, linux
    x64/arm64, windows x64) + `checksums.txt` to a GitHub Release; the package is
    private and no longer published to npm.
  - `vcskill update` checks GitHub Releases (was npm) and points at the curl
    installer for upgrades.

## 0.4.0

### Minor Changes

- d9cec8e: vc kit core loop A + hooks harness.

  - **BREAKING (kit content)**: `vc:vchun-git` renamed to `vc:git` — the skill
    now installs to `skills/git/`; update any `/vc:vchun-git` habits to
    `/vc:git`. The old `vchun-git` install dir is not auto-removed.
  - New skills: `vc:brainstorm`, `vc:cook` (embedded test + review gates),
    `vc:plan` (CLI-free plan scaffolding).
  - New `hook` artifact kind: `kit/hooks/` ships 5 Claude Code hooks
    (session-init, rules-inject, privacy-block, scout-block, session-state)
    with fail-open behavior and node:test coverage. Installing to claude-code
    copies hook files and offers a confirmed, idempotent `settings.json` merge;
    other providers skip-and-log.
  - Skill lint gate: frontmatter contract, description trigger lint, 300-line
    limits enforced at load time (`docs/vc-skill-authoring-spec.md`).

- 76718a2: vc kit core loop B: `vc:ask` (analysis-only Q&A), `vc:scout` (parallel
  explore agents with a shared prompt template), `vc:fix` (prove-before-fix
  root-cause loop), `vc:pm` (evidence-based plan sync-back and status reports).
- 9d91673: vc kit v1 complete: support skills `vc:problem-solving`, `vc:research`,
  `vc:docs`; demo skills `echo-tool` and `hello-world` removed from the kit
  (tests now use synthetic fixtures). Final roster: 12 skills + 5 hooks,
  verified by a full-kit install smoke test.
- 516eadf: vc kit v2: full 13-agent roster + repository-harness distill + 9 new skills.

  - **New agents** (`kit/agents/vc-*.md`, 13 total): `vc-explore`, `vc-planner`,
    `vc-reviewer`, `vc-tester`, `vc-debugger`, `vc-developer`, `vc-git-manager`,
    `vc-simplifier`, `vc-brainstormer`, `vc-researcher`, `vc-docs-manager`,
    `vc-project-manager`, `vc-journal-writer`. Persona + behavioral checklist +
    status protocol, no external CLI coupling; install alongside existing
    ClaudeKit agents without name conflicts.
  - **New agent lint gate**: `packages/cli/src/kit/agent-lint.ts`, enforced in
    `loadKit` same as the skill gate — frontmatter contract, description
    `<example>`/`<commentary>` requirement, ≤120 lines, required
    `Behavioral Checklist` heading.
  - **New hook**: `subagent-init` (SubagentStart) injects ~200 tokens of
    context into spawned subagents. `session-state` enriched with a git-status
    trace (files-changed + outcome).
  - **New rules**: `kit/rules/development-rules.md`, `delegation-protocol.md`,
    `intake-and-context.md` (authority gate, risk lanes, context budget, and
    harness-delta distilled from the `repository-harness` project) replace the
    sample placeholder.
  - **9 new skills**: `vc:skill-creator`, `vc:journal`, `vc:sequential-thinking`,
    `vc:docs-seeker`, `vc:bootstrap`, `vc:security-scan`, `vc:predict`,
    `vc:scenario`, `vc:worktree`. Roster: 12 → 21 skills.
  - **BREAKING (kit content)**: removed `kit/agents/sample-reviewer.md`,
    `kit/commands/sample-cmd.md`, `kit/rules/sample-rule.md` placeholders.
  - `vc:cook` gained risk-lane routing (`references/risk-lanes.md`) with a
    mandatory confirm gate for high-risk changes; `vc:pm` and `vc:cook`'s
    test-gate share a unit/integration/e2e/platform proof vocabulary; `vc:docs`
    gained a `decision` mode for durable architecture records.

  Full parity analysis against ClaudeKit for every new agent/skill — capability
  coverage plus concrete improvements — recorded in
  `plans/reports/parity-260720-*.md`.

- 912e319: vc kit v3a: deep coherence — all 21 skills brought to one cook-grade bar.

  - Every skill now has a real workflow, an `## Output format` contract,
    `## Quality gates` self-checks, and a `## Workflow position` — so the kit
    reads as one connected graph, not a strong core surrounded by thin satellites.
  - Risk lanes and proof vocabulary (`unit`/`integration`/`e2e`/`platform`) are
    wired across 8 and 7 skills respectively, not confined to `vc:cook`.
  - `vc:docs` gains an anti-bloat gate (don't create docs the code answers, no
    routine ADRs, prune on sight) encoding a real documentation-rot failure mode.
  - `vc:plan` phase template gains a `Stop Conditions` section — halt and confirm
    scope, never silently work around a risk.
  - `vc:git` references cleaned 10→7: merged the small push/PR/merge files into
    `workflow-sync.md` and removed a contradictory orphan `prc` spec that bypassed
    review. Behavior unchanged.
  - Authoring spec documents the seven-point cook-grade standard.

  No skill count change; no CLI change. `pnpm test` green (218).

- c060f36: vc kit v3b: anti-bloat + infra.

  - **New**: `vcskill validate` — lint the kit source without installing it.
    Runs the same `loadKit` checks the installer does (frontmatter, sizes,
    duplicate names, hook manifests) plus reference integrity: it flags a
    `references/x.md` that is linked-but-missing (dangling) or exists-but-unlinked
    (orphan). Exit 0 clean / 1 on findings; wired as a CI gate. On its first run
    it caught three real orphans manual review had missed.
  - `vc:pm` sync-back gains a **disposition-on-close** step (distill durable
    decisions to `docs/`, then delete the finished plan + its reports — git is the
    archive) and a friction-routing step (repeat friction → `vc:journal`).
  - `kit/hooks/README.md` documents all 6 hooks (event, purpose, fail-open
    contract).

  vcskill now ships 9 CLI commands.

- 303c081: vcskill CLI v2: install receipt + doctor + uninstall + backups + update.

  - **New**: every install writes `.vcskill/receipt.json` — an inspectable
    record of every file written (with a sha256 hash), hook bindings, and
    AGENTS.md management, per provider. Foundation for everything below.
  - **New**: `vcskill doctor [--global]` — health-checks the install against
    its receipt (missing files, hooks that fail to spawn, hook bindings
    removed from `settings.json`, version drift). Exit 0 healthy / 1 degraded
    / 2 not-installed.
  - **New**: `vcskill uninstall [--provider a,b] [--global] [--dry-run]` —
    removes exactly what the receipt says was written. A file you've edited
    since install is preserved, never deleted (detected via content hash).
    Reverses the hook-settings and AGENTS.md merges exactly, backing up both
    before rewriting. Proven byte-exact by round-trip tests and a live run.
  - **New**: `vcskill backups list [--global]` /
    `vcskill backups restore <timestamp> [--file <rel>] [--dry-run]` — restore
    any backed-up file, safety-backing up the current state first. Backups
    created before this release (no manifest) are listed but not
    auto-restorable — reported explicitly, never guessed.
  - **New**: `vcskill update [--global]` — offline-safe check against the npm
    registry for a newer release; never fails the command on a network error.

  vcskill now ships 8 CLI commands. See README's command table.

### Patch Changes

- edd0eab: `vcskill --version` now reports the real package version instead of a
  hardcoded string; tarball verification additionally asserts all 5 hooks and
  the vendored ignore lib are bundled.
- 709ddce: Remove the vc:claude-van-patch skill from the kit.

## 0.3.0

### Minor Changes

- 7f41425: Add three skills to the kit: vc:claude-van-patch (macOS Claude Code badge patch),
  vc:obsidian-second-brain-note (Obsidian note authoring), and vc:vchun-git (personal
  git workflow with genericized co-author template).

## 0.2.0

### Minor Changes

- f95ea40: Public npm release: package metadata, MIT license, and automated Changesets-driven publishing.
