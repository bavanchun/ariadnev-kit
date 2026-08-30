# Scout: ak 2.14.0 vs av — rules, settings, managed blocks, ignore files, adapters

Date: 2026-08-30. Content axis only; CLI-binary parity out of scope. Read-only; no tests run.

Sources
- ak project scope: `/Users/vchun/Codes/My-projects/vcskill-kit/{.claude,.agentkit}` (kit `engineer` 0.2.0, 106 skills).
- ak global (pre-retirement): `/Users/vchun/.agentkit/global-uninstall-backup-20260830.tar.gz` (10,136 entries). Non-skill subset extracted to `/private/tmp/claude-501/-Users-vchun-Codes-My-projects-vcskill-kit/a1284dda-b450-4f79-b69f-ada736261a7e/scratchpad/ak-backup-extract/`.
- av canonical: `/Users/vchun/Codes/My-projects/vcskill-kit/ariadnev-kit/` (`kit/`, `packages/cli/src/{install,providers,adapt,config}`, `README.md`).

## 1. Rules diff

| Rule file | ak project `.claude/rules/` | ak global backup `~/.claude/rules/` | av `kit/rules/` | Diff (ignoring `ak:`→`av:`) |
|---|---|---|---|---|
| development-rules.md | yes | absent (see Q1) | yes | none (1 line: `/ak:preview`→`/av:preview`) |
| orchestration-protocol.md | yes | absent (see Q1) | yes | none (2 lines: `/ak:advise`, `/ak:team`) |
| documentation-management.md | absent (see Q1) | yes | yes | byte-identical |
| primary-workflow.md | absent | yes | yes | byte-identical |
| process-management.md | absent | yes | yes | byte-identical |
| review-audit-self-decision.md | absent | yes | yes | byte-identical |
| skill-domain-routing.md | absent | yes | yes | byte-identical |
| skill-workflow-routing.md | absent | yes | yes | byte-identical |
| delegation-protocol.md | — | — | yes | **av-only** |
| intake-and-context.md | — | — | yes | **av-only** |

- ak ships 8 rules; av ships 10 and is a strict superset. **No rule content ak has that av lacks.**
- Per-adapter variants in the backup are the same bodies: `.cursor/rules/*.mdc` (8, plain body, **no frontmatter**, byte-identical to the `.md`), `.grok/rules/*.md` (8, identical), `.omp/agent/rules/*.md` (8, identical), `.pi/agent/rules/ak-engineer-*.md` (8, identical body, filename prefix only).
- `~/.claude/rules/` today holds av's 10 files, byte-identical to `kit/rules/`.
- ak project manifest (`.agentkit/adapters/claude-code/engineer/.agentkit/native-skill-paths.json`) claims 8 rules at project scope; only 2 exist on disk (Q1).

## 2. Settings / managed block / ignore file

| Surface | ak 2.14 | av | Gap |
|---|---|---|---|
| `.claude/settings.json` keys written | `statusLine` + `hooks` only. No `permissions`, `outputStyle`, `env`, no `ak`-specific keys. | `statusLine` + `hooks` only (`hook-settings-merge.ts`). | none |
| `statusLine` shape | `{"command":"/opt/homebrew/bin/node <proj>/.claude/ak-engineer-statusline.cjs","type":"command"}` — absolute node path, script at `.claude/` root | `{type:"command", command:"node \"<base>/.claude/hooks/av/av-statusline.cjs\"", padding:0}`; refuses to overwrite a foreign statusLine (`mergeStatusLine`) | shape parity; ak's absolute node path survives GUI-launched sessions with a bare PATH (P3) |
| Managed block in `AGENTS.md`/`CLAUDE.md` | **none**. No ak markers in project (no AGENTS.md/CLAUDE.md exist), `~/AGENTS.md`, `~/.codex/AGENTS.md`, `~/.claude/CLAUDE.md` (absent). `config-counter.cjs` only *counts* CLAUDE.md files. | `<!-- ariadnev:start/end -->` block = concatenated rule bodies (`agents-md.ts`, `buildRulesBlock`), written for `rulesMode: "agents-md"` providers (codex, antigravity, omp, generic, dsh). Legacy `vcskill:` markers still recognised. | av-only; nothing to port |
| Project config file | `.agentkit/config.yaml` — 3.1k fully-commented stub with `$schema` URL (`https://releases.agentkit.best/schemas/config/v1.json`), written by `ak kit init`; plus `.agentkit/.gitignore` (`*`, `!.gitignore`, `!config.yaml`) | `<project>/.ariadnev/config.json` project layer exists (`load-config.ts`), schema at `schemas/av-config.schema.json`; **no scaffold writer and no `.gitignore` writer found** in `packages/cli/src/{config,cli}` | P2 C3 |
| Project-config keys | `coding_level`, `paths.{docs,plans}`, `docs.max_loc`, `plan.{naming_format,date_format,issue_prefix,reports_dir}`, `project.{type,package_manager,framework}`, `locale.{response_language,thinking_language}`, `assertions[]`, `hooks.<name>: bool`, `worktree.root`, `skills.<id>.*`, `simplify.gate.enabled`, `privacy_block`, `workflow_artifact_gate.enabled`, `visual.{antv,diagram_design.{enabled,motion}}`, `extensions` | project-allowed: `paths.*`, `docs.maxLoc`, `plan.*`, `locale.*`, `project.*`, `statusline.{mode,quota}` (av-only). user-only by design: `privacyBlock`, `trust`, `assertions`, `scripts.executionPolicy`, `hooks.<name>`, `notifications` | av lacks `coding_level`, `worktree.root`, `skills.<id>`, `simplify.gate`, `workflow_artifact_gate`, `visual.*`, `extensions` (P2 C4). ak's per-project `hooks`/`assertions`/`privacy_block` are a **deliberate av security exclusion** (README §Configuration) — do not port. |
| Config JSON schema shipped to project | `.agentkit/schemas/ck-config.schema.json` (578 lines) copied into every adapter dir | `schemas/av-config.schema.json` in repo only; README says "point your editor at it" | P3; hosting/URL unknown (Q6) |
| Project scripts | `.agentkit/scripts/`: `resolve_env.py` (341), `set-active-plan.cjs` (57), `validate-skill-crossrefs.py` (173), `worktree.cjs` (9-line shim), `worktree.test.cjs` (9) | `kit/scripts/shared-check.ts` only → `.claude/scripts/`; `kit/skills/worktree/scripts/worktree.cjs` real impl | `set-active-plan.cjs` P1 C2; py scripts P3 C6 |
| Output styles | 6 × `coding-level-{0..5}-*.md` (771 lines, frontmatter `name/description/keep-coding-instructions: true`) at `.claude/output-styles/` (project + global); staged as sidecars for codex/cursor/grok/omp/pi | `kit/output-styles/` **does not exist**; loader ready (`load-kit.ts:195`), resolver path ready (`.claude/output-styles/${n}.md`), cell `claude-code.outputStyle = none` → would skip; `kit/skills/coding-level/SKILL.md:49` admits "kit ships no output-styles/" | **P1 C1** |
| Ignore file | `.ckignore`; scout-block reads `<claudeDir>/.ckignore` baseline + `<gitroot>/.claude/.ckignore` override; **no baseline file shipped** (not in manifest, not in backup); falls back to `DEFAULT_PATTERNS` in `scout-block/pattern-matcher.cjs`. `~/.claude/.ckignore` on disk = user-authored `!node_modules/cmdk` | `.avignore`, same two-location lookup (`kit/hooks/_lib/scout-checker.cjs:148-161`), same `DEFAULT_PATTERNS` in `kit/hooks/_lib/scout-block/pattern-matcher.cjs:15`, same `BLOCKED_DIR_NAMES`; no baseline file shipped | parity; user's `~/.claude/.ckignore` needs a manual rename to `.avignore` to keep the `cmdk` negation |
| Workflows | none (only skill-internal `workflows/` dirs in `ak-cti-expert`, `ak-docs-seeker`) | `kit/workflows/{bugfix-delivery,read-only-delivery,safe-change-delivery}.json` + `schema/workflow.schema.json` | av-only |
| Kit allowlists | n/a | `skills-pending-port.json`: `pending: []` (nothing known-pending). `collision-allowlist.json`: `[]`. `av-invocation-allowlist.json`: 2 entries — `plans-kanban` (dashboard `config start/status/stop` never registered in av) and `coding-level/SKILL.md` (cites `av kit init --force`, which does not exist) | both allowlist entries are live debts touching this report's content (coding-level ↔ C1/C4) |

## 3. Adapter × artifact matrix

ak side from `install-manifest.json` + `native-skill-paths.json` + `*-ownership.json` per adapter in the backup. av side from `README.md` provider matrix / `spec-verified.ts` / `resolver.ts`. `sidecar` = staged under `~/.agentkit/adapters/<a>/engineer/sidecars/` but not in the provider's own tree (activation not visible post-uninstall).

| Adapter | skills | agents | rules | output-styles | hooks | statusline | config edit / glue |
|---|---|---|---|---|---|---|---|
| **claude-code** ak | `.claude/skills/` (106) | `.claude/agents/*.md` (16) | `.claude/rules/*.md` (8) | `.claude/output-styles/` (6) | `.claude/hooks/` + `lib/` + `notifications/` + `scout-block/` | `.claude/ak-engineer-statusline.cjs` | `settings.json` hooks+statusLine; `.agentkit/{config.yaml,.gitignore,adapters/…/scripts,schemas}` |
| claude-code av | `.claude/skills/av-*` | `.claude/agents/*.md` | `.claude/rules/*.md` | **skip** (cell none) | `.claude/hooks/av/*.cjs` + `_lib/` | `.claude/hooks/av/av-statusline.cjs` | `settings.json` hooks+statusLine; `.claude/scripts/`, `.claude/.env.example` |
| **codex** ak | `~/.agents/skills/` (105) | `~/.codex/agents/*.toml` (16) | **none** (no `.codex/rules`, no AGENTS.md markers — Q2) | sidecar only | `~/.codex/hooks/` full tree + `.agentkit-runtime.json` | none | binding unknown (Q3) |
| codex av | `~/.agents/skills/av-*` | `~/.codex/agents/*.toml` | `AGENTS.md` block | skip | skip | skip | `~/.agents/ariadnev/{scripts,.env.example}` |
| **cursor** ak | `~/.cursor/skills/` (101) | `~/.cursor/agents/*.md` (16) | `~/.cursor/rules/*.mdc` (8, no frontmatter) | sidecar only | `~/.cursor/hooks/` + `~/.cursor/hooks.json` v2 bindings (19 hook_ids; events postToolUse/beforeSubmitPrompt/stop/preToolUse/subagentStart/subagentStop/sessionStart) | none | `cursor-ownership.json` |
| cursor av | `.agents/skills/av-*` | `.agents/skills/av-*` (skill-shim) | **skip** (cell none, path `.cursor/rules/*.mdc` exists in resolver) | skip | skip | skip | `.agents/{scripts,.env.example}` |
| **agy** (antigravity) ak | `~/.agents/skills/` (105) + `.gemini/config/skills/` (17-skill subset) + `.gemini/antigravity-cli/skills/` (same 17) | `.gemini/config/agents/<name>/agent.md` (16; frontmatter `memory: project`, `subagent: true`, `model: inherit\|flash\|pro`) | **none** | none | none | none | `AGY-MODEL-ROUTING.md` (model table + CLI catalog) |
| antigravity av | `.agents/skills/av-*` | skip | `AGENTS.md` block | skip | skip | skip | — |
| **grok** ak | `~/.grok/skills/` (106) | `~/.grok/agents/*.md` (16) | `~/.grok/rules/*.md` (8) | sidecar only | `~/.grok/hooks/engineer/` + `agentkit-grok-envelope-shim.cjs` | sidecar `statusline/.config/statusline.cjs` | `~/.grok/hooks/engineer.json` (whole file, shim-wrapped commands) |
| grok av | `.grok/skills/av-*` | `.grok/agents/*.md` | `.grok/rules/*.md` | skip | skip (hook root hard-wired to `.claude/hooks/av/`, `spec-verified.ts:220`) | skip | `.grok/{scripts,.env.example}` |
| **omp** ak | `~/.omp/agent/skills/` (106) | `~/.omp/agent/agents/*.md` (16) | `~/.omp/agent/rules/*.md` (8) | sidecar only | sidecar only (activation unseen — Q4) | sidecar only | `omp-ownership.json` |
| omp av | `.agents/skills/av-*` (deliberate: `~/.omp/agent` is session storage per omp docs) | `.agents/skills/av-*` shim | `AGENTS.md` block | skip | skip | skip | — |
| **pi** ak | `~/.pi/agent/skills/` (106) | `~/.pi/agent/agents/ak-engineer-*.md` (16) + `Explore.md`, `Plan.md` | `~/.pi/agent/rules/ak-engineer-*.md` (8) | inside extension dir | extension `~/.pi/agent/extensions/agentkit-hooks-engineer/` (`hooks.json`, `hooks/`, `security-sentinel.cjs`, `index.ts`) | `ak-engineer-statusline.cjs` inside extension | extension `agentkit-agent/index.ts` = an `Agent` tool that spawns child pi runs |
| pi av | **no provider** | — | — | — | — | — | — |
| **dsh** ak | **not in backup** — no `~/.dsh`, no adapter dir; "8 adapters" is 7 observed | | | | | | |
| dsh av | every cell skip (documented) | | | | | | |
| opencode / generic av | av-only providers (`.opencode/*`, neutral `.agents/*`) | | | | | | |

Cross-cutting: ak stages output styles for codex/cursor/grok/omp only as sidecars in `~/.agentkit/adapters/`, i.e. outside the provider trees — effectively inert there; only claude-code and pi (extension) get them in-tree.

## 4. Ranked gaps

### Content gaps (rules, blocks, patterns, files) — maintainer wants these first

| # | Pri | What ak has | ak source | av target | Port | Effort |
|---|---|---|---|---|---|---|
| C1 | **P1** | 6 coding-level output styles (771 lines) | `/Users/vchun/Codes/My-projects/vcskill-kit/.claude/output-styles/coding-level-{0-eli5,1-junior,2-mid,3-senior,4-lead,5-god}.md` (same bytes in backup `Users/vchun/.claude/output-styles/`) | `kit/output-styles/<same names>.md` (new dir; `load-kit.ts:195` already loads it) | copy 6 files, brand-scan bodies; then observe a real `/output-style` load in claude-code and flip `spec-verified.ts` `claude-code.outputStyle` from `none` to `observed` (resolver path already `.claude/output-styles/${n}.md`; `install-plan.ts` `planOutputStyles` already skips-or-writes). Update `kit/skills/coding-level/SKILL.md:49` ("kit ships no output-styles/") and the `coding-level` entry in `kit/av-invocation-allowlist.json`. Regenerate README matrix. | S content + S cell flip |
| C2 | **P1** | `set-active-plan.cjs` (57 lines) — sets session-scoped active plan so subagents inherit it; `ak-plan` step 617 locates and runs it after plan creation | `/Users/vchun/Codes/My-projects/vcskill-kit/.agentkit/adapters/claude-code/engineer/.agentkit/scripts/set-active-plan.cjs` | `kit/scripts/set-active-plan.cjs` (→ `.claude/scripts/` via `planDirTree`) + a post-create step in `kit/skills/plan/SKILL.md` (§ Pre-Creation Check, line ~139) | av's `kit/hooks/_lib/av-config-utils.cjs:261` already documents the `'session'` precedence tier "set via set-active-plan.cjs" but nothing ships the script — a dangling contract. Verify store format against `av-config-utils.cjs` before copying (Q5). | S |
| C3 | P2 | Project scaffold: commented `config.yaml` stub + `.gitignore` written by `ak kit init` | `/Users/vchun/Codes/My-projects/vcskill-kit/.agentkit/config.yaml`, `/Users/vchun/Codes/My-projects/vcskill-kit/.agentkit/.gitignore` | `<project>/.ariadnev/config.json` stub (`{"$schema": "<path-or-url to schemas/av-config.schema.json>"}` — JSON has no comments, so the stub's prose must move to the schema `description`s, which `config-schema.ts` already carries) + `<project>/.ariadnev/.gitignore` (`*`, `!.gitignore`, `!config.json`) | needs a small write path in the install/`config prefs` command; content itself is trivial | S content / M CLI |
| C4 | P2 | Project-config keys absent from av: `coding_level`, `worktree.root` (relative-only at project scope, absolute ignored — a security rule worth copying verbatim), `skills.<id>.*`, `simplify.gate.enabled`, `workflow_artifact_gate.enabled`, `visual.{antv,diagram_design}`, `extensions` | `/Users/vchun/Codes/My-projects/vcskill-kit/.agentkit/config.yaml` (stub comments document each) + `.agentkit/adapters/claude-code/engineer/.agentkit/schemas/ck-config.schema.json` (578 lines, full shapes) | `packages/cli/src/config/config-schema.ts` (+ regenerate `schemas/av-config.schema.json`) | port only keys with a consumer: `coding_level` (pairs with C1 — av's coding-level skill has nowhere to persist), `worktree.root` (av `worktree` skill), `skills.<id>` (av `research` etc.). `visual.*`/`workflow_artifact_gate`/`extensions` have no av consumer — defer. **Do not** move `hooks`/`assertions`/`privacyBlock` to project scope; av made that user-only on purpose. | S–M |
| C5 | P2 | `AGY-MODEL-ROUTING.md` — role→`--model` table, live `agy models` catalog, `model: inherit\|flash\|pro` frontmatter note, `agy --sandbox --model <id> -p` flag order | backup `Users/vchun/.agentkit/adapters/agy/engineer/AGY-MODEL-ROUTING.md` (extracted) | a reference file under the routing skill, e.g. `kit/skills/ariadnev/references/antigravity-model-routing.md`, or `docs/providers/antigravity.md` | copy + rebrand; value is low until A2 lands (av installs no antigravity agents) | S |
| C6 | P3 | `resolve_env.py` (341) and `validate-skill-crossrefs.py` (173) | `/Users/vchun/Codes/My-projects/vcskill-kit/.agentkit/adapters/claude-code/engineer/.agentkit/scripts/` | `kit/scripts/` | no ak skill or hook references either script (only the manifest); av already has `av validate` for cross-refs — but memory notes 19 cross-skill links the validator misses, so read `validate-skill-crossrefs.py` for the check it does before deciding | S read / M port |
| C7 | P3 | cursor rules as `.cursor/rules/*.mdc` (8) | backup `Users/vchun/.cursor/rules/*.mdc` | none needed — `resolver.ts` cursor `rulePath` already `.cursor/rules/${n}.mdc`; `spec-verified.ts` cursor `rules: none` gates it | this is a cell flip requiring a cursor observation (`cursor-agent` has no local prompt-dump; probing spends credits per `spec-verified.ts:114`). ak's `.mdc` carry no `alwaysApply` frontmatter, so parity needs no adapt work. | S once observed |
| C8 | P3 | statusLine command uses absolute node path (`/opt/homebrew/bin/node`) | `/Users/vchun/Codes/My-projects/vcskill-kit/.claude/settings.json` | `install-plan.ts:153` (`command: node "<dest>"`) | optional: resolve `process.execPath` at install so GUI-launched Claude with bare PATH still draws the bar | S |

No gap: rules (av superset), managed block (av-only), ignore-file defaults (identical `DEFAULT_PATTERNS`), workflows (av-only), `settings.json` permissions/outputStyle/env (neither writes them), worktree shim (av has the real script).

### New-adapter gaps (CLI work, large) — second priority

| # | Pri | Gap | ak evidence | av touchpoints | Effort |
|---|---|---|---|---|---|
| A1 | P2 | **`pi` provider missing entirely** | backup `Users/vchun/.pi/agent/{skills,agents,rules}` + `extensions/agentkit-hooks-engineer/` (hooks.json, hooks/, security-sentinel.cjs, statusline, output-styles, scripts, index.ts) + `extensions/agentkit-agent/index.ts` (Agent-tool shim spawning child pi) | `spec-verified.ts` (new row), `resolver.ts` (new config; name prefix `ak-engineer-`→`av-`), `paths.ts`, `install-plan.ts` (extension-shaped hook delivery is a new op kind), README matrix | L |
| A2 | P2 | antigravity agents + `.gemini/config/{agents,skills}` roots | backup `Users/vchun/.gemini/config/agents/<name>/agent.md` (16; frontmatter `memory: project`, `subagent: true`), `.gemini/config/skills/` + `.gemini/antigravity-cli/skills/` (17-skill subset: agentize brainstorm bro design diagram docs frontend-design hyperframes journal preview review-pr ship skill-creator sowat sumup test worktree) | `spec-verified.ts` antigravity `agent: none` ("app ships no CLI"); `resolver.ts` `agentPath: null` | M + needs an observation surface (Q8 for the subset rule) |
| A3 | P3 | codex hooks (`~/.codex/hooks/` tree + `.agentkit-runtime.json`) | backup `Users/vchun/.codex/hooks/*`; binding mechanism not visible (Q3) | `spec-verified.ts` codex `hook: none` | M–L, blocked on evidence |
| A4 | P3 | cursor hooks (`~/.cursor/hooks/` + `~/.cursor/hooks.json` v2 event bindings) | `cursor-ownership.json` `hook_ids` (19), `hook_hashes`; backup `Users/vchun/.cursor/hooks/*` | `spec-verified.ts` cursor `hook: none`; hook root hard-wired to `.claude/hooks/av/` | M–L |
| A5 | P3 | grok hooks (`~/.grok/hooks/engineer/` + envelope shim + `engineer.json`) and grok statusline sidecar | backup `Users/vchun/.grok/hooks/engineer.json`, `.grok/hooks/engineer/agentkit-grok-envelope-shim.cjs` | `spec-verified.ts:220` explains the skip (single hook root); needs per-provider hook root in `paths.ts`/`resolver.ts` + a grok binary to observe | M, blocked on binary |
| A6 | — | omp in-tree layout (`~/.omp/agent/*`) | backup | av deliberately installs to `.agents/skills` + AGENTS.md (`resolver.ts:121-139`, README) | not a gap; verified decision |
| A7 | — | dsh | absent from ak backup too | av: every cell skip | nothing to port |

## 5. Unresolved questions

1. Project `.claude/rules/` holds 2 of the 8 files the ak project manifest lists; the 6 missing are exactly the 6 in the global backup, and the 2 present are the 2 the backup lacks. Did ak's global uninstall (13:09–13:12 today) dedupe by content hash across scopes and delete project copies, or did av's global install overwrite `~/.claude/rules/{development-rules,orchestration-protocol}.md` (hash mismatch → not backed up)? Affects whether `.claude/rules/` at project scope is a trustworthy ak source.
2. codex rules: no `.codex/rules`, and no ak markers in `~/.codex/AGENTS.md` or `~/AGENTS.md`. Either ak merged into an AGENTS.md and unmerged cleanly on uninstall, or codex got no rules at all. Not decidable post-uninstall.
3. How ak bound `~/.codex/hooks/` — `~/.codex/config.toml` carries no ak markers now; `.agentkit-runtime.json` suggests a codex-side shim rather than a config edit.
4. omp/grok/codex sidecar output styles and omp hooks: where (if anywhere) ak pointed the provider at `~/.agentkit/adapters/<a>/engineer/sidecars/`. `~/.omp/agent/settings.json` is absent.
5. `set-active-plan.cjs` store format vs av's `av-config-utils.cjs` `'session'` tier (line 261) — read both before porting C2; av's `session-state`/`subagent-init` hooks must read the same key.
6. Does av host `schemas/av-config.schema.json` at a stable URL for a project `$schema` field (ak uses `https://releases.agentkit.best/schemas/config/v1.json`)?
7. dsh: never installed on this machine by either tool; "8 adapters" is 7 observed.
8. agy: criterion for the 17-skill subset copied into `.gemini/config/skills` and `.gemini/antigravity-cli/skills` (size cap? allowlist?) — not recoverable from manifests.

```
Status: DONE_WITH_CONCERNS
Summary: Rules, managed blocks, ignore defaults and settings keys are at parity or av-superset; the real content gaps are the 6 coding-level output styles (kit/output-styles/ missing, cell unverified) and set-active-plan.cjs (av docs cite it, nothing ships it), then project-config scaffold/keys and the AGY routing doc. Adapter-level gaps are pi (absent), antigravity agents, and hooks for codex/cursor/grok.
Concerns/Blockers: ak project rules dir is inconsistent with its own manifest (Q1); codex rules/hook binding not recoverable post-uninstall (Q2, Q3); dsh unobserved in both tools.
```
