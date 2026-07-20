# Scout: Archon standout deltas vs vcskill

Date: 2026-07-20
Target: `/Users/vchun/Documents/kit/Archon` (coleam00/Archon, Bun/TS rewrite — CLI + workflow engine + server/web + chat/forge adapters)
Scope: transferable engineering/agent/DX patterns Archon has that vcskill LACKS or does WORSE. Product features (RAG, chat adapters, workflow DAG engine, auth-service) skipped as out-of-category.

Note: Archon and vcskill are near-siblings architecturally (Bun single binary, embedded assets, curl|bash install, sha256, self-update, adapt-to-provider engine, `doctor`/`validate` CLI, atomic writes, TDD). So most Archon "features" are already vcskill baseline. Deltas below are the genuinely-missing or done-better bits.

---

### 1. Privacy-first anonymous telemetry (biggest gap)
- What: `packages/paths/src/telemetry.ts` (900 LOC) + `commands/telemetry.ts` + `checkTelemetry` in doctor. PostHog write-only embedded key (`phc_*`, safe to ship — write-only), fire-and-forget, categorical-only capture. Events: `archon_started` (per-invocation, basis for DAU), `archon_active` (daily server heartbeat), `workflow_invoked/completed/failed`, feature-adoption flags (`uses_mcp`, `uses_skills`, etc.).
- Why peak:
  - Opt-out honors `DO_NOT_TRACK=1` (de-facto standard) + `ARCHON_TELEMETRY_DISABLED=1` + auto-disable on `CI=true` + `POSTHOG_API_KEY=off/0/false`.
  - Per-event `PRIVACY_INVARIANTS` (`$ip:''`, `$process_person_profile:false`) kept per-event, NOT only super-properties, so a regression can't silently leak.
  - `sanitizeModelForTelemetry` / `classifyWorkflowForTelemetry` — user-authored names → `"custom"`; only categorical enums leave the machine; raw error text never sent (fixed `errorClass` enum).
  - `TELEMETRY_SCHEMA_VERSION` + versioned first-run notice stamp (`telemetry-notice-shown-v4`) → re-consent on capture expansion.
  - `silentFetch` masks all network failures as 200 so PostHog outages never print noise; self-hosters w/ custom host get exactly one `warn`.
  - Stable install UUID at `${HOME}/telemetry-id`; `peekTelemetryId()` reads WITHOUT creating (inspecting status while opted-out never materializes a file); `telemetry reset` rotates.
- Steal this: vcskill has zero usage visibility. A curl|bash tool maintainer badly wants "which of 21 skills / 13 agents / N providers actually get installed, adapt-engine failure classes, self-update adoption" — all derivable categorically without PII. Lift the whole opt-out precedence + per-event-invariants + write-only-key + fire-and-forget shape wholesale.
- Effort: M (telemetry module + wiring 1–2 capture sites + doctor/status command + README "Telemetry" section).

### 2. Auto-generated capability matrix from the SAME constants the engine reads + totality guard
- What: `scripts/generate-capability-matrix.ts`. Reads each provider's `capabilities.ts` (the exact objects the executor uses to warn on ignored per-node fields), emits the canonical docs table. `--check` fails `bun run validate` when stale (exit 2). `assertTotalCoverage()` throws if a NEW `ProviderCapabilities` field exists without a matrix axis (or explicit `SKIP_KEYS`).
- Why peak: vcskill's `spec-verified.ts` gates installs, but the provider/artifact support matrix in README/docs is (almost certainly) hand-maintained → drifts. Archon makes drift a build failure AND makes "added a capability but forgot to document/handle it" a compile/throw error. Single source of truth enforced mechanically.
- Steal this: generate vcskill's provider×artifact support matrix (the README table) from `spec-verified.ts` cells, add a `--check` drift gate to the test/validate pipeline, and a totality guard so a new artifact type or provider can't ship undocumented.
- Effort: S/M.

### 3. Passive "update available" nudge (non-blocking, cached)
- What: `packages/paths/src/update-check.ts` + `printUpdateNotice` in cli.ts. On binary runs, cached GitHub `/releases/latest` lookup (1h staleness, 3s timeout, AbortController), prints `Update available: vX → vY — <url>` to stderr. Network errors swallowed → null. Also exposed via server `/api` for the web UI.
- Why peak: decoupled from the active `update` command — users passively learn they're stale without a blocking network call on every invocation (cache file + staleness window). `--quiet` and non-binary guards.
- Steal this: vcskill has `update` (self-update) but (per baseline) no passive nudge. Add a cached, timeout-bounded, swallow-on-error nudge printed once when a newer release exists. Reuse vcskill's existing edge/Worker version endpoint instead of GitHub API.
- Effort: S.

### 4. Release-binary smoke-tests that prove the compiled binary self-extracts correctly
- What: `.github/workflows/release.yml` build job runs the freshly-compiled Linux binary through: (a) `version` must say `Build: binary` + correct stripped version + not "Failed to read version"; (b) `workflow list` in a throwaway git repo must load embedded defaults (`grep archon-assist`) — proves embedded JSON survived compile; (c) negative resolver test (unset dep → clean user-facing error, NOT a `Module not found /Users/runner/...` leak); (d) positive spawn test.
- Why peak: catches the exact class of "binary built but embedded kit / build-time constants missing" bugs that unit tests can't — verifies the shipped artifact, in a clean environment, actually self-extracts and reports build metadata. `build-binaries.sh` complements with a min-size guard (`MIN_BINARY_SIZE=1MB`, reject suspiciously small output).
- Steal this: vcskill embeds+self-extracts its kit into a Bun binary. Add a release-workflow step that runs the built binary in a scratch dir and asserts `list` shows the embedded skills/agents and `version` reports binary build-type + correct version. This is the single highest-signal guard that a release isn't silently broken.
- Effort: S.

### 5. `build-binaries.sh`: EXIT-trap restore of injected build-time constants
- What: Before `bun build --compile`, the script rewrites `packages/paths/src/bundled-build.ts` with `BUNDLED_IS_BINARY=true`, `BUNDLED_VERSION`, `BUNDLED_GIT_COMMIT`, then an `trap ... EXIT` (`git checkout -- <file>`) restores it even if compile fails mid-way (cites issue #979) so the dev tree is never left dirty. Single-target (CI, `TARGET`+`OUTFILE`) vs multi-target (local dev) modes.
- Why peak: clean, idempotent build-time constant injection with guaranteed rollback — no leftover dirty state, no "is_binary got committed as true" footguns.
- Steal this: if vcskill injects version/commit/is-binary at compile time, adopt the write→trap-restore pattern. If it uses a different mechanism, at least the EXIT-trap-restore idea for any build-time source mutation.
- Effort: S.

### 6. `stripCwdEnv` + archon-owned three-path `.env` model (security for a repo-operating binary)
- What: `strip-cwd-env-boot.ts` is the FIRST import in cli.ts — strips Bun's auto-loaded CWD `.env` keys before any module reads `process.env`. Then `env-loader.ts` loads only archon-owned files: `~/.archon/.env` then `<cwd>/.archon/.env` (repo scope wins, `override:true`). `<cwd>/.env` is deliberately NOT loaded — "directory ownership (`.archon/`) is the security boundary, not the filename."
- Why peak: a binary that operates inside arbitrary user repos must NOT silently inherit that repo's secrets/config via an ambient `.env`. Explicit ownership boundary + boot-time strip prevents the target repo from hijacking tool config. Verbose-boot logging names exact paths + key counts instead of dotenv's misleading preamble.
- Steal this: vcskill installs into user machines and reads config; ensure it doesn't inherit a target project's `.env`. Adopt a scoped `~/.vcskill/` + repo `.vcskill/` ownership boundary and a boot-time strip of ambient CWD env if Bun auto-loads it.
- Effort: S/M.

### 7. Bundled-asset drift gate (`check-bundled-skill.ts`)
- What: The binary embeds a shipped skill via Bun `import ... with { type: 'text' }` in a hand-maintained `bundled-skill.ts`. `check-bundled-skill.ts` walks the on-disk skill dirs (allowlist `['archon','manage-run']`, excludes dev-only skills) and fails `validate` if any file isn't referenced. Honest self-doc: "substring check — a safety net against missing imports, not structural verification."
- Why peak: when embedding assets by explicit import list (not glob), the list silently rots. A cheap CI gate that "every file of the shipped set is referenced" prevents shipping a binary missing a skill file. Pairs with `generate-bundled-defaults.ts` + `check:bundled` for the glob-able parts.
- Steal this: vcskill embeds its whole kit — if any part is an explicit manifest/import list, add an analogous "on-disk set ⊆ embedded references" `--check` gate. Also the allowlist pattern (ship subset ≠ repo's full skill dir).
- Effort: S.

### 8. Tri-state, dependency-injected `doctor` (skip/pass/fail + best-effort semantics)
- What: `commands/doctor.ts`. Every check returns `{status:'pass'|'fail'|'skip'}`. `Promise.allSettled` so one thrown check doesn't skip the rest; a rejection is rendered as its own failure line. Heavy DI (each check takes injectable `loadDeps`/`resolve` so tests drive every branch without real binaries/DB). Crucial UX rule: informational checks (`skip`, never `fail`) for things that aren't configured — e.g. Codex/Slack/Telegram/gh skip cleanly when unconfigured so users aren't nagged about tools they'll never use. `--full` widens optional probes.
- Why peak: the `skip` tri-state + "never fail on best-effort / unconfigured" is what makes doctor output trustworthy signal instead of a wall of red. DI makes it fully unit-testable.
- Steal this: if vcskill's `doctor` is binary pass/fail, add `skip` for unconfigured/optional providers, `Promise.allSettled`, and injectable deps per check. Model the "configured?" gate (skip unless this provider is actually in play).
- Effort: S/M.

### 9. Windows support: `install.ps1` + `bun-windows-x64` release target
- What: `scripts/install.ps1` (`irm https://archon.diy/install.ps1 | iex`) and a `bun-windows-x64.exe` matrix row in release.yml (install.sh itself hard-errors on Windows and points to WSL2/ps1).
- Why peak: first-class Windows path via PowerShell one-liner + cross-compiled `.exe`, parallel to the mac/linux curl|bash, same checksum flow.
- Steal this: if vcskill wants Windows reach, add the `bun-windows-x64` compile target + a PowerShell installer mirroring install.sh's detect/download/checksum/verify. (Lower priority if vcskill is intentionally POSIX-only.)
- Effort: S/M.

### 10. Lazy self-download of heavy optional assets w/ checksum + atomic rename (`serve`)
- What: `commands/serve.ts` — the binary doesn't embed the web UI; on first `serve` it downloads `archon-web.tar.gz` from the matching release, verifies sha256 against `checksums.txt` (`Bun.CryptoHasher`), extracts to `${dir}.tmp`, verifies expected layout (`index.html` present), then atomic `renameSync` into a version-keyed cache dir. Cache-hit on subsequent runs. `--download-only` prefetch.
- Why peak: keeps the primary binary lean while still giving a verified, atomically-installed optional payload keyed by version — same integrity guarantees as the binary install, applied to a runtime-fetched asset.
- Steal this: if vcskill ever ships an optional heavy payload (e.g. a big skill pack, docs bundle, or a UI), this is the template: version-keyed cache dir + checksum + temp-extract + layout-verify + atomic rename + cache-hit skip.
- Effort: M (only if such a payload exists).

### 11. Smaller, cheap wins
- `commands/telemetry.ts` — `status` (renders enabled/reason/distinctId/host/keySource) + `reset` (rotate UUID). Great transparency DX; pair with #1. Effort S.
- `credential-sanitizer.ts` — redacts `GH_TOKEN`/`GITHUB_TOKEN` values and `https://x@github.com` creds from error messages+stacks before display/log. vcskill scans for secrets pre-write; this is the output-side complement (never echo a token in an error). Effort S.
- `SECURITY.md` — private vuln reporting (GitHub advisories + email), explicit scope, user best-practices. A curl|bash+edge tool distributing binaries should have one. Effort S.
- `.github/agents/*.agent.md` + `.github/prompts/*.prompt.md` — provider-agnostic agent/prompt definitions (frontmatter `name`/`description`/`user-invokable`/`tools`, strict "What You Do / Do NOT Do", mandatory `file:line` citations, fixed output tables). Relevant as authoring-style reference for vcskill's 13 agents (the "documentarian not critic" + citation discipline is portable). Borderline relevance. Effort M.
- Codegen+`--check` drift-gate pattern applied to MANY artifacts (`generate:bundled`, `bundled-schema`, `pi-vendor-map`, `capability-matrix`), all folded into one `validate` script. The general principle — every derived artifact has a generator + a CI drift check — is worth adopting kit-wide, not just for the matrix (#2). Effort S per artifact.

---

## Top 5 worth stealing

| # | Pattern | Why it matters for vcskill | Effort |
|---|---------|----------------------------|--------|
| 1 | Privacy-first anonymous telemetry (DO_NOT_TRACK + CI auto-off, write-only key, per-event invariants, categorical-only, schema-versioned re-consent) | Zero install/usage visibility today; safe to add without PII | M |
| 2 | Capability matrix auto-generated from `spec-verified` constants + `--check` drift gate + totality guard | Kills doc drift; new provider/artifact can't ship undocumented | S/M |
| 3 | Release smoke-test: run the built binary in a scratch dir, assert embedded kit loads + build-type/version correct | Highest-signal guard that a shipped binary isn't silently broken | S |
| 4 | Passive cached update-available nudge (timeout-bounded, swallow-on-error) | Users passively learn they're stale; reuse vcskill edge endpoint | S |
| 5 | `stripCwdEnv` + owned-directory `.env` scope boundary | Prevents a target repo from hijacking tool config/secrets | S/M |

Runner-up: tri-state DI `doctor` with `skip` semantics (#8) — cheap trust upgrade if vcskill's doctor is binary pass/fail.

---

## Unresolved questions
- Does vcskill's `doctor` already use a `skip` tri-state, or is it binary pass/fail? (Determines value of #8.)
- Is vcskill's provider×artifact README matrix hand-maintained or already generated from `spec-verified.ts`? (If generated, #2 collapses to just adding the totality guard.)
- Does vcskill's `update` already print a passive nudge on normal runs, or only on explicit `update`? (Determines novelty of #3.)
- Is Windows a target for vcskill or intentionally POSIX-only? (Gates #9.)
- Does vcskill inject build-time constants (version/commit/is-binary) at compile time, and if so how — worth confirming before recommending the EXIT-trap pattern (#5).
- Out of scope but noted: Archon exposes NO standalone MCP server surface (the `uses_mcp` flag is about workflows consuming MCP, and `manage-run` is an in-process native tool, not an MCP server). So "should vcskill expose an MCP surface?" finds no reusable prior art here — Archon is not a model for that.

Status: DONE | Summary: Archon mirrors most of vcskill's binary/install/adapt architecture; the real deltas are privacy-first telemetry, generator+drift-gate for the capability matrix, release-artifact smoke-tests, a passive update nudge, and CWD-env stripping — telemetry being the standout gap.
