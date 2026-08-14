# Scout: reference Standout Deltas vs vcskill

Deep-read of `/Users/vchun/Documents/kit/reference`. Reports ONLY capabilities that are ABSENT or clearly SUPERIOR vs vcskill baseline. Ranked most-valuable first. All paths under kit root unless noted.

---

### 1. Tier-3 LLM-judge eval harness for skills
3-tier eval runner (`scripts/eval/run.ts`, `tier-1-static.ts`, `tier-2-e2e.ts`, `tier-3-judge.ts`). Tier1 = $0 static validation (CI-mandatory). Tier2 = real E2E harness (~$3.85/run). **Tier3 sends each `SKILL.md` to an AI CLI** (`claude` or `ccs glm` via `CK_EVAL_CMD`) and scores clarity/specificity/completeness 1-10, flags overall <6, saves `results/judge-{date}.json`. Supports `--diff` (changed skills only), `--skill <name>`, `--all`.
- **Why peak:** vcskill's `validate` is static lint only (frontmatter/size/refs). It cannot answer "is this skill actually well-written". Tier2/3 close the loop on quality with cost tiering so CI stays free while authors can opt into paid deep checks.
- **Steal this:** Add `vcskill eval` with tier1 (reuse existing validate) + optional tier3 LLM-judge gated behind an env cmd var. Judge prompt caps content to 3000 chars, extracts JSON via regex — copy nearly verbatim.
- **Effort:** M

### 2. Deterministic skill-description scorer + confusable-pair / cycle detection
`claude/scripts/score-skill-description.py`: scores descriptions on 5 structural criteria (action-verb start, trigger phrase "Use for/when", length band, etc.) with NO LLM. Also detects **confusable skill pairs via Jaccard similarity** (stop-word filtered) and **dependency cycles via DFS**. Enforced in CI by `scripts/check-skill-descriptions.js` + `check-skill-routing.js`.
- **Why peak:** With 21+ skills, routing collisions (two skills the model can't disambiguate) silently degrade selection. vcskill has no description-quality or collision gate. Jaccard pair-detection is a cheap, deterministic guard against the exact failure mode that grows with skill count.
- **Steal this:** Port the scorer + Jaccard confusable-pair check into `vcskill validate` as a warn-level lint. Low-risk, pure Python, no deps.
- **Effort:** S

### 3. `.ck.json` config schema — per-hook toggles + tunable workflow
`claude/schemas/ck-config.schema.json` (JSON-Schema draft-07). Every hook checks `isHookEnabled('<name>')` against `.ck.json`. Config exposes: `codingLevel` (-1..5), `privacyBlock`, `docs.maxLoc`, `plan.namingFormat`/`dateFormat`/`issuePrefix`, `plan.resolution.order` (session/branch/directory) + `branchPattern`, `plan.validation.mode` (prompt/auto/strict/none) + min/maxQuestions/focusAreas.
- **Why peak:** vcskill hooks are hardcoded/claude-code-only with no user-facing enable/disable or workflow tuning. A schema'd config gives editor autocomplete, per-project overrides, and graceful hook opt-out without code edits.
- **Steal this:** Introduce `.vcskill.json` schema + a shared `isHookEnabled()` gate at the top of all 6 hooks. Single biggest DX/flexibility win for the hook layer.
- **Effort:** M

### 4. Agent Teams — real multi-session parallel orchestration (`ck:team`)
`claude/skills/team/SKILL.md` + 4 references. Uses native `TeamCreate`/`TeamDelete` + `TaskCreate/Update/Get/List` + `SendMessage` for **independent Claude sessions**, each with own context window, coordinating via shared task list. Templates: research/cook/code-review/debug. Flags `--devs N`, `--delegate` (lead only coordinates, spawns merge teammate), `--worktree` (isolation default-on for cook). Hard preflight: aborts if `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` unset — never silently falls back to subagents.
- **Why peak:** vcskill's 13 agents are single-session Task subagents. Teams enable true parallel file-owned work with peer messaging and plan-approval gates — a different capability class.
- **Steal this:** Add a `vc:team` skill wrapping the same native tools; even without full adoption, port the delegate-mode + worktree-per-teammate file-ownership protocol.
- **Effort:** L

### 5. "Team Mode" delegation protocol baked into every agent
Each agent `.md` (e.g. `claude/agents/planner.md:145`, `fullstack-developer.md:111`, `code-reviewer.md:173`) has a **"Team Mode (when spawned as teammate)"** section: claim task via `TaskUpdate`, report to lead via `SendMessage`, approve `shutdown_request` via `SendMessage(type:"shutdown_response")` unless mid-critical-op, peer-coordinate via `SendMessage(type:"message")`. Tools frontmatter grants `TaskCreate/Get/Update/List, SendMessage, Task(Explore), Task(researcher)`.
- **Why peak:** vcskill agents have a status protocol but no teammate lifecycle/handshake or nested delegation (`Task(Explore)`/`Task(researcher)` sub-spawning). This is the glue that makes multi-agent coordination reliable.
- **Steal this:** Add a shared "Delegation / teammate lifecycle" block to the vcskill agent authoring spec + lint for it. Even single-session, the `Task(Explore)` scout-spawn pattern is worth adopting.
- **Effort:** M

### 6. Autonomous optimization loop (`ck:loop`) + autoresearch family
`claude/skills/ck-loop/SKILL.md` + references (`autonomous-loop-protocol.md`, `git-memory-pattern.md`, `guard-and-noise.md`, `metric-library.md`, `results-logging.md`). Modify→Verify→Keep/Discard→Repeat over N bounded iterations against a **mechanical metric** (Verify cmd must print a single number). Config: Goal/Scope(glob)/Verify + optional Guard(regression cmd), Iterations, Noise tolerance (low/med/high), Min-Delta, Direction. Each iteration atomic-committed, rolled back on regression. `ck:autoresearch` (`ck-autoresearch/SKILL.md`) is a router documenting the full 11-subcommand upstream lineage + local absorption map.
- **Why peak:** vcskill has zero autonomous/iterative capability. This is a whole workflow class (coverage/bundle-size/perf hill-climbing) with safety guardrails and git-based memory.
- **Steal this:** Port `vc:loop` — the metric-library + guard/noise references are self-contained and provider-agnostic.
- **Effort:** M

### 7. `managed-hooks.json` + CLI self-heal manifest
`scripts/generate-managed-hooks.cjs` derives `claude/hooks/managed-hooks.json` from `settings.json` (the hooks registered unconditionally). CLI self-heal reads it as **deterministic source of truth for "which hooks should be registered"**; conditionally-injected (team) hooks are auto-excluded. `--check` mode fails CI if manifest is stale. Parser matches CLI's own hook-name extraction regex.
- **Why peak:** vcskill merges settings.json idempotently but has no way to *detect* a hook that drifted out of a user's settings and re-heal it. This manifest makes install/repair deterministic.
- **Steal this:** Generate a `managed-hooks.json` at build; have `vcskill doctor`/`install` diff it against target settings and re-register missing hooks.
- **Effort:** S

### 8. `workflow-artifact-gate` — enforce review artifacts before ship
`claude/hooks/workflow-artifact-gate.cjs` + `workflow-artifact-gate/{artifact-locator,stage-detector,validator}.cjs`. Detects workflow stage, resolves artifact dir, validates required review artifacts exist before finalize/ship-like actions. Opt-in hook mode (crash fail-open) + manual CLI mode (`--stage --artifact-dir --json`, non-zero on block).
- **Why peak:** vcskill has scout-block but no gate ensuring a review/plan artifact was actually produced before shipping. Prevents "shipped without review" silently.
- **Steal this:** Add an artifact-gate hook keyed to vcskill's own workflow stages; ship the CLI mode for manual/CI use.
- **Effort:** M

### 9. `simplify-gate` — block ship verbs on large unsimplified diffs
`claude/hooks/simplify-gate.cjs` (UserPromptSubmit). Computes live `git diff HEAD` signals; **hard-blocks** ship/merge/pr/deploy/publish and **soft-warns** commit/finalize/release when diff exceeds thresholds (locDelta 400 / fileCount 8 / singleFileLoc 200). Bypass via env or config. Verb detection uses a natural-language action-prefix regex ("please/can you/let's/ready to … ship it").
- **Why peak:** Novel behavioral guardrail vcskill lacks entirely — ties the "simplify before shipping" discipline to an enforceable prompt-time gate.
- **Steal this:** Port as an opt-in hook; the verb+object NL regex builder is reusable.
- **Effort:** S

### 10. `portable-manifest.json` — versioned provider path-migration ledger
Root `portable-manifest.json`: `{version, cliVersion, renames[], providerPathMigrations[]}`. Each migration = `{provider, type, from, to, since}` (e.g. gemini-cli skills `.gemini/skills`→`.agents/skills` since 3.37.0). CLI replays these to migrate installed layouts across provider path changes.
- **Why peak:** vcskill's `spec-verified` gate decides *whether* to write a path, but has no ledger to *migrate* already-installed artifacts when a provider changes its canonical path. This is how you upgrade users non-destructively.
- **Steal this:** Add a `portable-manifest.json` with `providerPathMigrations` consumed by `vcskill migrate`/`update`. Complements the existing paths.ts single-source.
- **Effort:** M

### 11. Per-file release manifest (sha256 + git commit timestamps)
`scripts/generate-release-manifest.cjs` walks kit files, records SHA-256 + `git log` commit ISO timestamp per file, honors `INCLUDE_HIDDEN`/`SKIP_DIRS`, reads sourceDir/runtimeDir from `package.json.reference`.
- **Why peak:** vcskill sha256-verifies the *binary* but has no per-file timestamped manifest, so `update`/`migrate` can't do timestamp-aware incremental/3-way merges or detect user-modified files to preserve.
- **Steal this:** Emit a per-file manifest at build; use it in `update` to skip unchanged files and warn on locally-modified ones.
- **Effort:** M

### 12. Skills `install.sh` — rustup-style resumable dependency installer
`claude/skills/install.sh`: exit codes 0=success/partial, 1=fatal, 2=partial; flags `-y --with-sudo --resume --retry-failed`; `.install-state.json` for resume; per-phase error handling (no blanket `set -e`); tracks critical/optional/failed/skipped-sudo arrays; Bash 3.2 compatible. Python venv at `skills/.venv`.
- **Why peak:** vcskill install is a single binary curl|bash; skills needing Python deps (google-genai, pypdf, ffmpeg tooling) have no resumable partial-failure installer. Rustup exit-code model + resume state is best-practice DX.
- **Steal this:** If/when vcskill ships Python-dependent skills, adopt this installer pattern wholesale.
- **Effort:** M (only if Python skills added)

### 13. `coding-level` output-styles (0..5) + session-init injection
`claude/output-styles/coding-level-{0-eli5..5-god}.md`. Each is a hard MANDATORY/FORBIDDEN communication contract per experience level (e.g. senior: lead with trade-offs, production-ready code, no basic explanations). `session-init.cjs` reads `codingLevel` from `.ck.json` and injects the matching style.
- **Why peak:** vcskill has no per-user communication calibration. Config-driven output-style swap is a clean personalization mechanism.
- **Steal this:** Ship 2-3 output-styles (junior/senior/god) + a `codingLevel` config key wired via session-init.
- **Effort:** S

### 14. Session-state persistence + statusline activity/usage cache
`claude/hooks/session-state.cjs` + `lib/session-state-manager.cjs`: on Stop/SubagentStop persists markdown state + `refreshStatuslineSnapshot`; on PostToolUse(Task/Todo) refreshes statusline activity cache. `usage-quota-cache-refresh.cjs` + `usage-context-awareness.cjs` warm a statusline usage/quota (5h + weekly %) cache. `cook-after-plan-reminder.cjs` reads session state to emit the absolute plan path + next-step choices after planning (survives `/clear` in worktrees).
- **Why peak:** vcskill has a session-state hook but no statusline usage-quota surface, no cross-session activity snapshot, no post-plan absolute-path handoff. These make long/multi-session work legible.
- **Steal this:** Port the statusline snapshot refresh + the post-plan absolute-path reminder (cheap, high-value for `/clear` recovery).
- **Effort:** M

### 15. `descriptive-name` PreToolUse(Write) hook — inject naming rules at write time
`claude/hooks/descriptive-name.cjs`: on Write, injects `additionalContext` with per-language naming conventions (kebab for JS/TS, snake for py/go/rust, Pascal for java/kt/swift, ban generic report names) via `permissionDecision:"allow"` + `additionalContext`.
- **Why peak:** vcskill enforces naming via post-hoc lint; injecting guidance *before* the write prevents bad names instead of flagging them after.
- **Steal this:** Add an equivalent PreToolUse(Write) context-injection hook.
- **Effort:** S

### 16. Skill-owned routing references + CI coverage gate
`scripts/check-skill-routing.js`: enforces that always-loaded routing handbooks (`skill-domain-routing.md`, `skill-workflow-routing.md`) stay **retired**, and that discoverability instead lives in skill-owned refs (`find-skills/references/domain-routing.md`, `cook/references/workflow-routing.md`, `preview/references/visual-explanation-routing.md`). CI fails on stale routing files, missing refs, or ck:* skills lacking descriptions.
- **Why peak:** Architectural pattern — routing knowledge is progressively disclosed (loaded only when the owning skill activates) instead of bloating always-on context. vcskill's routing lives in always-loaded global rules files (`skill-*-routing.md`), the exact thing this kit deliberately retired.
- **Steal this:** Move vcskill's domain/workflow routing tables into skill-owned reference files loaded on demand; add a coverage lint. Direct token-budget win.
- **Effort:** M

### 17. CI quality-gates suite (5+ dedicated gates)
`.github/workflows/quality-gates.yml`: metadata-deletions check (guards accidental metadata loss vs base branch), skill cross-reference lint, skill-routing coverage, skill-frontmatter contract (python), skill-description+listing policy, content lint. Plus `hook-require-integrity.test.cjs`, `team-surface-contract.test.cjs`, `generate-managed-hooks --check`.
- **Why peak:** Broader and more targeted than vcskill's validate. Notable: **metadata-deletions diff-vs-base** gate (prevents silently dropping skill metadata in a PR) and **hook-require-integrity** (verifies every `require()` in hooks resolves).
- **Steal this:** Add metadata-deletion diff gate + hook require-integrity test to vcskill CI.
- **Effort:** S

### 18. planner-agent verification discipline (anti-hallucination plan rules)
`claude/agents/planner.md:26-40`: "Re-grep don't copy (scout summaries go stale) / Cite file:line or tag [UNVERIFIED] / Trace don't assume control flow / Enumerate don't hand-wave ('update all callers' → list every caller file:line) / Check lifetime before adding state (grep instantiation sites, verify per-request vs shared)". Plus large-file fallback protocol (Gemini CLI 1M ctx → chunked Read → Grep).
- **Why peak:** Concrete, testable anti-hallucination rules that catch the specific ways plans silently invert behavior. vcskill's proof vocabulary is good but doesn't encode these failure-mode-specific disciplines.
- **Steal this:** Fold the 5 verification rules + large-file fallback into vcskill's planner/scout agent spec.
- **Effort:** S

### 19. Meta/workflow single-skills vcskill lacks
No vcskill equivalent for several high-leverage meta skills: `ck:predict` (5-persona debate before risky changes), `ck:scenario` (edge cases across 12 dimensions), `ck:context-engineering` (token-budget/memory patterns), `xia` (extract/port a feature from another repo), `ghpm` (GitHub project mgmt), `watzup` (session handoff), `retro` (git-history retrospective), `journal`, `plans-kanban`, `find-skills`, `skill-creator` (eval-driven, `evals/evals.json` prompts+assertions). `skill-creator` closes the loop with #1's eval infra.
- **Why peak:** These are workflow/meta capabilities (not domain-specific), directly relevant to a skills-authoring monorepo. `predict`/`scenario`/`xia`/`skill-creator` are the highest-value ports.
- **Steal this:** Prioritize `vc:predict`, `vc:scenario`, `vc:skill-creator` (pairs with the eval harness).
- **Effort:** L (per-skill S/M)

### 20. `common/` API-key rotation helpers for skills
`claude/skills/common/{api_key_helper.py, api_key_rotator.py}` — shared key resolution + rotation across API-consuming skills; `_shared/{lib,references,tests}` for cross-skill code reuse.
- **Why peak:** vcskill skills are self-contained; a shared `_shared/` + key-rotator avoids duplicating provider-key logic across multimodal/AI skills.
- **Steal this:** Only relevant once vcskill ships multiple API-consuming skills — adopt a `_shared/` convention then.
- **Effort:** S (deferred)

---

## Top 5 Worth Stealing

| # | Standout | Why | Effort |
|---|----------|-----|--------|
| 1 | Tier-3 LLM-judge eval harness (`scripts/eval/`) | Scores skill quality, not just lint; cost-tiered so CI stays free | M |
| 2 | Skill-description scorer + Jaccard confusable-pair/cycle detection (`score-skill-description.py`) | Deterministic guard against routing collisions that worsen as skill count grows | S |
| 3 | `.ck.json` config schema + per-hook `isHookEnabled` gate | Per-project hook toggles + tunable plan/validation workflow via schema'd config | M |
| 4 | `managed-hooks.json` self-heal manifest (`generate-managed-hooks.cjs`) | Deterministic detect+repair of drifted hook registrations | S |
| 5 | Skill-owned routing refs + retirement CI gate (`check-skill-routing.js`) | Moves routing to progressive-disclosure; kills always-loaded routing-table token cost | M |

## Unresolved Questions

1. Does vcskill's binary embed enough to run a Python `score-skill-description.py`, or should the scorer be reimplemented in TS to stay in the Bun binary? (kit uses standalone python3.)
2. Tier-2 E2E harness (`tier-2-e2e.ts`) not deep-read — unknown how it spawns/asserts real skill runs; worth a follow-up read before porting #1 fully.
3. `lib/session-state-manager.cjs` + `statusline-session-cache.cjs` internals not read — statusline usage-quota surface may depend on Claude Code-specific plan/usage APIs that don't port to other providers.
4. Agent Teams (`ck:team`) requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` + Opus + CLI (no VSCode) — is that runtime available in vcskill's target environments, or is it claude-code-only like vcskill's hooks?
5. Licensing: autoresearch family is MIT-attributed to Udit Goenka — confirm attribution requirements before porting `vc:loop`.

Status: DONE
