# Port report — upstream router skills folded into `av` and `ariadnev`

- **Date:** 2026-08-30
- **Branch:** `worktree-agent-a91936c4e255ddd92`
- **Sources (read-only):** upstream `ak-ak/` (203-line SKILL.md + generated `command-reference.md`) and `ak-agentkit/` (200-line SKILL.md + three references), version 2.14.0
- **Targets:** `kit/skills/av/` and `kit/skills/ariadnev/`
- **Command surface used:** `~/.local/bin/av` (reports 1.3.0; built 2026-08-30 from source, so it already carries the parity phases 11-13 commands) — 141 `--help` pages captured, one per command and subcommand; `packages/cli/src/cli/register-*.ts` registers no command the binary does not show

## Corpus-member check

| Path | In `evals/context/corpus-manifest.json`? |
|---|---|
| `kit/skills/av/SKILL.md` | **No** |
| `kit/skills/ariadnev/SKILL.md` | **No** |

Neither skill is a member of the frozen retrieval benchmark (the 26 entries are the three workflows, thirteen other skills, two agents, six golden scenarios and two docs). No benchmark regeneration is needed for this change.

## What was taken from upstream and where it landed

### `av` (from the upstream CLI-operation skill)

| Upstream operating-model element | Landed in | How it was rewritten |
|---|---|---|
| "Owns the operating model, not the flag reference"; generated appendix as a starting index, `--help` authoritative | `av/SKILL.md` intro; new `av/references/command-classification.md` | No generator exists here, so the appendix is a hand-maintained table with a version stamp and a "re-run `--help` per group" maintenance rule |
| Explicit "use vs do not use" table with the router split ("router decides which skill runs; this skill runs the binary") | `## Boundaries` | Added `av:help` (the eval scenario forbids `av:av` for "what can av do"), `av:journal`, `av:cook`, `av:orchestrate` rows and the one-line split |
| Three-class safety legend (read-only / mutating / diagnostic, diagnostic = long-running or interactive) | Protocol step 1 and the reference legend | Kept ariadnev's classes; re-derived every verb from live `--help` (e.g. `plan reindex` and `sessions redact` are read-only here; `api start`, `gui`, `activity tail`, `sessions tail`, `plan kanban`, `eval` are diagnostic) |
| `--json --no-interactive` gives a versioned envelope (`schema_version`, `kind`, `data`); never pass the prompt-suppressing flag to a mutation without approval | Step 2, step 4, `## --json envelopes` | The envelope shape is proven live; the five legacy shapes (`contract`, `audit`, `config`, `workflow`, `eval`) are named from `json-envelope.ts` and sampled. The prompt-suppressing flag here is the top-level `--yes` (plus `setup --no-interactive`); no global `--no-interactive` exists |
| Scope axes: project vs user/global, kit installation source, adapter/delivery mode | Step 3 | Rewritten to ariadnev's three real axes: `--global`, `--provider`, and `--home`/`--cwd` roots; `av contract` as the provider-truth |
| "Prefer status/inspect before lifecycle mutation" with a concrete before/after list | Step 5 table | Every pair uses ariadnev spellings (`update --check`, `backups verify`, `watch dry-run`, `content queue list`, `data retention` preview, ...) |
| "Snapshot before mutate" (`backups create` before recover/restore/uninstall) | Step 6 | `av backups create` is a positional verb here; `migrate rollback` and `backups restore --latest` named as undo paths |
| "Preserve unknown files"; never `--force` with `--fresh` | Step 7 | No `--fresh` exists; rewritten around ariadnev's `--force` semantics from `install|init|uninstall --help` |
| Temp-home discipline for destructive smoke tests (env vars + docs link) | Step 3 roots, anti-patterns | Expressed through `--home <dir>` / `--cwd <dir>` (proven by `av --help`); upstream's env-var list and its `docs/operations/implementation-smoke.md` link dropped (no such doc here) |
| "Never invent a flag"; do not carry names over from another CLI | Step 8 | Names the concrete absentees (login/logout/whoami/licenses, dashboard verbs under `config`, kit repair verb, verbose/quiet/fresh) with the ariadnev replacement for each |
| Source-of-truth clause: binary advances independently of installed skill copies; authority order help → JSON → appendix | `## Version skew` | `av update` vs `av install`; `av versions` and `av changelog --since-current` as the skew check |
| Command families by task (bootstrap, kits, skills, agents/commands, plans/journals, diagnostics, recovery, daemons, config/auth/MCP, self-update/migrations) | `## Command index by task` (rewritten) and the reference (one row per command, grouped) | Every family respelled; auth family dropped (excluded); daemons family built from `api`, `gui`, `watch`, `orchestrate`, `content` |
| Anti-patterns table | `## Anti-patterns` | Kept the seven that have an ariadnev equivalent; dropped the appendix-regeneration and runtime-support-matrix rows (no such artifacts) |
| "Maintaining this skill" (`make skill-ref`, `make skill-ref-check`) | Reference header stamp | No Make targets or generator; replaced by the stamp + manual re-check rule |

Stale claims in the previous `av` skill that the live surface contradicted, now fixed: `--json` was said to be absent on `list`, `doctor`, `validate`, `query`, `mcp list|show|verify`, `kit install-path`, `telemetry status` (all take `--json` now, sampled); "no plan-authoring subcommand exists" (`av plan create` and `av plan add-phase` exist); `mcp link`, `doctor --fix`, `backups create|show|verify|prune`, `recover`, `migrate prefs|rollback`, `unlock` and the whole phase 11-13 surface were unmentioned.

### `ariadnev` (from the upstream task router)

The previous `ariadnev` skill was already a full port of the upstream router (six-step protocol, taxonomy, chaining, subagent timing) and is ahead of upstream on the three lint-required sections. The delta from upstream 2.14.0 is small and was applied where it fits ariadnev:

| Upstream element | Landed in | Note |
|---|---|---|
| Router/CLI split ("router decides which skill runs; CLI skill runs the binary") — stated only on the CLI side upstream | `## Boundaries` (`av:av` row + closing paragraph), `## Anti-Patterns` row, `## Workflow position` | A chain link whose exit criterion is an `av` mutation belongs to `av:av`; the router never runs the mutation or adds `--yes` |
| High-risk worked route with a mass-audience send (upstream's marketing-install campaign example) | `## Worked Routes`, third example | Rewritten against installed skills: `/av:copywriting` → reviewer role with a content brief → `/av:av` running `av content publish` (previews by default, `--yes` is the user's call). Upstream's marketing skill chain has no counterpart here, which `references/chaining-patterns.md` already records |
| `av:help` as a non-routing capability answer | `## Boundaries`, `## Workflow position` | Mirrors the eval scenario split between `av:av` and `av:help` |

Kept as ariadnev's verified decisions (not reverted to upstream): Codex has no in-session spawn tool here (upstream's `agent_<slug>` MCP dialect and its runtime-register command are excluded by the parity manifest); Step 5 points at the taxonomy's risk table instead of duplicating it; the three references were already adapted and are unchanged.

## Command references and their `--help` proof

133 distinct `av` command paths are cited across the two skill directories (SKILL.md files and references). Each resolves to a captured `--help` page; the usage line is quoted as proof. Flag presence was proven mechanically: the kit's own `lintAvInvocations` (the av-invocation lint, run from the worktree source against a surface parsed from the 141 captured help pages) reports **0 findings** over all six files, and a deliberate phantom (`av plan scaffold --linked-pr`) is caught by the same harness.

| Cited command | `--help` usage line (proof) | Flags cited in that span |
|---|---|---|
| `av` | `ariadnev [options] [command]` | `--help` |
| `av activity list` | `ariadnev activity list [options]` | — |
| `av activity stats` | `ariadnev activity stats [options]` | — |
| `av activity tail` | `ariadnev activity tail [options]` | — |
| `av adapters regenerate` | `ariadnev adapters regenerate [options]` | — |
| `av add-skill` | `ariadnev add-skill [options] <name>` | — |
| `av agents install` | `ariadnev agents install [options] <name>` | — |
| `av agents list` | `ariadnev agents list [options]` | — |
| `av agents remove` | `ariadnev agents remove [options] <name>` | — |
| `av agents search` | `ariadnev agents search [options] <query>` | — |
| `av agents show` | `ariadnev agents show [options] <name>` | — |
| `av analytics delete` | `ariadnev analytics delete [options]` | — |
| `av analytics disable` | `ariadnev analytics disable [options]` | — |
| `av analytics enable` | `ariadnev analytics enable [options]` | — |
| `av analytics rebuild` | `ariadnev analytics rebuild [options]` | — |
| `av analytics refresh` | `ariadnev analytics refresh [options]` | — |
| `av analytics status` | `ariadnev analytics status [options]` | — |
| `av api start` | `ariadnev api start [options]` | — |
| `av api status` | `ariadnev api status [options]` | — |
| `av api stop` | `ariadnev api stop [options]` | — |
| `av audit` | `ariadnev audit [options] [target]` | scripts (default: "kit") |
| `av backups` | `ariadnev backups [options] <action> [timestamp]` | list |
| `av changelog` | `ariadnev changelog [options]` | `--since-current` |
| `av commands install` | `ariadnev commands install [options] <name>` | — |
| `av commands list` | `ariadnev commands list [options]` | — |
| `av commands remove` | `ariadnev commands remove [options] <name>` | — |
| `av commands search` | `ariadnev commands search [options] <query>` | — |
| `av commands show` | `ariadnev commands show [options] <name>` | — |
| `av config prefs` | `ariadnev config prefs [options] <action>` | — |
| `av content publish` | `ariadnev content publish [options]` | — |
| `av content queue add` | `ariadnev content queue add [options]` | — |
| `av content queue list` | `ariadnev content queue list [options]` | — |
| `av content queue remove` | `ariadnev content queue remove [options] <id>` | — |
| `av content schedule` | `ariadnev content schedule [options]` | — |
| `av content-search delete` | `ariadnev content-search delete [options]` | — |
| `av content-search disable` | `ariadnev content-search disable [options]` | — |
| `av content-search enable` | `ariadnev content-search enable [options]` | — |
| `av content-search rebuild` | `ariadnev content-search rebuild [options]` | — |
| `av content-search search` | `ariadnev content-search search [options]` | — |
| `av content-search status` | `ariadnev content-search status [options]` | — |
| `av contract` | `ariadnev contract [options]` | — |
| `av data ingest` | `ariadnev data ingest [options]` | — |
| `av data retention` | `ariadnev data retention [options]` | `--apply` |
| `av data status` | `ariadnev data status [options]` | — |
| `av diagnostics export` | `ariadnev diagnostics export [options]` | — |
| `av doctor` | `ariadnev doctor [options]` | `--fix` |
| `av eval` | `ariadnev eval [options]` | — |
| `av feedback` | `ariadnev feedback [options]` | `--submit` |
| `av gui` | `ariadnev gui [options]` | — |
| `av init` | `ariadnev init [options] [dir]` | — |
| `av install` | `ariadnev install [options]` | — |
| `av journal create` | `ariadnev journal create [options] <title>` | — |
| `av journal list` | `ariadnev journal list [options]` | — |
| `av journal show` | `ariadnev journal show [options] <term>` | — |
| `av journal validate` | `ariadnev journal validate [options]` | — |
| `av kit install-path` | `ariadnev kit install-path [options] <provider>` | — |
| `av kit refresh` | `ariadnev kit refresh [options]` | — |
| `av list` | `ariadnev list [options]` | — |
| `av mcp` | `ariadnev mcp [options] [command]` | — |
| `av mcp add` | `ariadnev mcp add [options] <name> <command> [args...]` | — |
| `av mcp link` | `ariadnev mcp link [options] <name>` | — |
| `av mcp list` | `ariadnev mcp list [options]` | — |
| `av mcp remove` | `ariadnev mcp remove [options] <name>` | — |
| `av mcp show` | `ariadnev mcp show [options] <name>` | — |
| `av mcp verify` | `ariadnev mcp verify [options] [name]` | — |
| `av migrate` | `ariadnev migrate [options] [command]` | — |
| `av migrate prefs` | `ariadnev migrate prefs [options]` | — |
| `av migrate rollback` | `ariadnev migrate rollback [options]` | — |
| `av new` | `ariadnev new [options] <name>` | — |
| `av orchestrate` | `ariadnev orchestrate [options] [command]` | — |
| `av orchestrate resume` | `ariadnev orchestrate resume [options] <run-id> [graph]` | — |
| `av orchestrate start` | `ariadnev orchestrate start [options] <graph>` | — |
| `av orchestrate status` | `ariadnev orchestrate status [options] [run-id]` | — |
| `av orchestrate stop` | `ariadnev orchestrate stop [options] <run-id>` | — |
| `av plan` | `ariadnev plan [options] [command]` | — |
| `av plan add-phase` | `ariadnev plan add-phase [options] <title>` | — |
| `av plan archive` | `ariadnev plan archive [options]` | — |
| `av plan check` | `ariadnev plan check [options] <phase>` | — |
| `av plan cleanup` | `ariadnev plan cleanup [options]` | — |
| `av plan close` | `ariadnev plan close [options]` | — |
| `av plan create` | `ariadnev plan create [options] <title>` | — |
| `av plan kanban` | `ariadnev plan kanban [options] [name]` | — |
| `av plan list` | `ariadnev plan list [options]` | — |
| `av plan migrate` | `ariadnev plan migrate [options] <from>` | — |
| `av plan parse` | `ariadnev plan parse [options]` | — |
| `av plan phase` | `ariadnev plan phase [options] <phase>` | — |
| `av plan reindex` | `ariadnev plan reindex [options]` | — |
| `av plan resolve` | `ariadnev plan resolve [options]` | — |
| `av plan search` | `ariadnev plan search [options] <query>` | — |
| `av plan show` | `ariadnev plan show [options]` | — |
| `av plan status` | `ariadnev plan status [options] [status]` | in-progress |
| `av plan uncheck` | `ariadnev plan uncheck [options] <phase>` | — |
| `av plan update` | `ariadnev plan update [options] <phase> <status>` | in-progress |
| `av plan use` | `ariadnev plan use [options] <name>` | — |
| `av plan validate` | `ariadnev plan validate [options]` | — |
| `av projects add` | `ariadnev projects add [options] <dir>` | — |
| `av projects list` | `ariadnev projects list [options]` | — |
| `av projects prune` | `ariadnev projects prune [options]` | — |
| `av projects remove` | `ariadnev projects remove [options] <nameOrPath>` | — |
| `av projects show` | `ariadnev projects show [options] <nameOrPath>` | — |
| `av query` | `ariadnev query [options] [view]` | doctor |
| `av recover` | `ariadnev recover [options] [timestamp]` | — |
| `av run` | `ariadnev run [options] [command] [workflow] [args...]` | codex |
| `av run cancel` | `ariadnev run cancel [options] <run-id>` | — |
| `av run resume` | `ariadnev run resume [options] <run-id>` | — |
| `av run status` | `ariadnev run status [options] <run-id>` | — |
| `av sessions list` | `ariadnev sessions list [options]` | — |
| `av sessions redact` | `ariadnev sessions redact [options]` | — |
| `av sessions show` | `ariadnev sessions show [options] <project> <sessionId>` | — |
| `av sessions stats` | `ariadnev sessions stats [options]` | — |
| `av sessions tail` | `ariadnev sessions tail [options] <project> <sessionId>` | — |
| `av setup` | `ariadnev setup [options]` | — |
| `av skill` | `ariadnev skill [options] <action> [name] [args...]` | verify |
| `av skills graph` | `ariadnev skills graph [options] [name]` | — |
| `av skills install` | `ariadnev skills install [options] <name>` | — |
| `av skills list` | `ariadnev skills list [options]` | — |
| `av skills remove` | `ariadnev skills remove [options] <name>` | — |
| `av skills search` | `ariadnev skills search [options] <query>` | — |
| `av skills show` | `ariadnev skills show [options] <name>` | — |
| `av telemetry` | `ariadnev telemetry [options] [action]` | — |
| `av uninstall` | `ariadnev uninstall [options]` | — |
| `av unlock` | `ariadnev unlock [options]` | — |
| `av update` | `ariadnev update| Self-update to the latest ariadnev release (--check to only report, --to to pin an exact version) |
| `av validate` | `ariadnev validate [options]` | — |
| `av versions` | `ariadnev versions [options]` | — |
| `av watch dry-run` | `ariadnev watch dry-run [options] <repo>` | — |
| `av watch start` | `ariadnev watch start [options] <repo>` | — |
| `av watch status` | `ariadnev watch status [options] [repo]` | — |
| `av watch stop` | `ariadnev watch stop [options] <repo>` | — |
| `av workflow cancel` | `ariadnev workflow cancel [options] <run-id>` | — |
| `av workflow resume` | `ariadnev workflow resume [options] <run-id>` | — |
| `av workflow run` | `ariadnev workflow run [options] [workflow]` | `--validate` |
| `av workflow status` | `ariadnev workflow status [options] <run-id>` | — |

## Upstream instructions dropped or respelled

Classification is from `parity-manifest.json` (top-level) and `DIVERGENCES` in `packages/cli/src/kit/parity-audit.ts` (subcommand level). Nothing in the merged skills instructs an agent to run any of the left-hand column; the reference's "Not in this binary" table names them in prose (no code spans) so an agent that remembers them is redirected.

| Upstream instruction | Class | What the merged skill says instead |
|---|---|---|
| `login`, `logout`, `whoami`, `licenses` (auth family) | excluded | Dropped; "nothing to log in to; the kit ships whole" |
| `config start` / `config status` / `config stop` (dashboard daemon) | declined | `av gui`; `av api start`, `av api status`, `av api stop` |
| `kit repair-install-mode` | declined | `av doctor --fix` re-merges drifted hook bindings; files are installed directly |
| `kit init` / `kit install` / `kit uninstall` / `kit validate` / `kit list-kits` | respelled | `av init`, `av install`, `av uninstall`, `av validate`, `av list` |
| `codex-agent-runtime serve` / `register` (Codex spawn server) | excluded | Dropped; Codex agents are files under `~/.codex/agents/`, no in-session spawn |
| `config prefs set` / `unset` / `validate` | not registered (only `resolve`) | `av config prefs resolve` only; edit the config file directly |
| `content schedule daemon`, `content queue cancel` / `run-pending` | not registered (different verbs) | `av content schedule` is one due-sweep; `av content queue remove <id>` |
| `plan phase close` / `plan phase update` | not registered (`plan phase` prints) | `av plan update <phase> <status>`, `av plan check <phase>` |
| `--no-interactive` (global), `--verbose`, `--quiet`, `--fresh` | not registered | Top-level `--yes` is the prompt gate; `--no-interactive` exists only on `av setup`; no verbose/quiet/fresh |
| `make skill-ref`, `make skill-ref-check`, generated appendix | no generator here | Hand-maintained reference with a version stamp and a manual re-check rule |
| `docs/operations/implementation-smoke.md`, `docs/conformance/runtime-support-matrix.yaml`, "owner-locked packaging" CLAUDE.md section | no such docs here | `--home`/`--cwd` roots for smoke tests; `av contract` as the provider-capability truth |
| Upstream env-var family for temp homes | brand-drift-forbidden | `--home <dir>` and `--cwd <dir>` (proven by `av --help`) |
| Marketing skill chain (research → persona → funnel → campaign → channels) in the router's worked routes | no such skills here | Worked route rebuilt on `av:copywriting` + reviewer role + `av content publish` |
| Codex `agent_<slug>` MCP dispatch dialect in the router | excluded (see above) | Unchanged from ariadnev's inline-agent fallback |

## Line counts and description lengths

| File | Lines | Limit | Note |
|---|---|---|---|
| `kit/skills/av/SKILL.md` | 277 (was 155) | ≤ 300 | description 179 chars (≤ 200, trigger verb "Use") |
| `kit/skills/av/references/command-classification.md` | 243 (new) | ≤ 800 | one row per registered command; no heading shared with SKILL.md |
| `kit/skills/ariadnev/SKILL.md` | 269 (was 252) | ≤ 300 | description 182 chars, unchanged |
| `kit/skills/ariadnev/references/*.md` | 97 / 103 / 63 | ≤ 800 | unchanged |

## Verification performed

| Check | Result |
|---|---|
| `rg -n 'ak-\|ak:\|AgentKit\|agentkit' kit/skills/av kit/skills/ariadnev` | no matches |
| `node packages/cli/scripts/check-brand-drift.mjs` with the new files **staged** (the gate scans `git ls-files`) | `brand drift: clean` |
| Kit `lintAvInvocations` over both skill dirs, surface parsed from the 141 captured `--help` pages | 0 findings; self-check phantom caught |
| Kit `lintSkill` + `checkCrossSkillReferences` + `findUnresolvedSkillReferences` over both skills (worktree source, minimal frontmatter reader) | 0 errors, 0 warnings; every `av:<slug>` resolves; no duplicate headings between SKILL.md and references |
| `~/.local/bin/av validate --strict` | exit 0 — **but this proves nothing about the worktree**: the compiled binary resolves its kit root from inside the binary and validates the *embedded* kit (`getKitRoot` → `materializeEmbeddedKit`), so the coordinator's source-run `validate --check --strict` at integration is the real gate |
| `bun packages/cli/src/index.ts validate --strict` from the worktree | could not run: no `node_modules` in the worktree and installs are forbidden for this agent |
| No test suite, build, or install was run | per the hard rules |

## Unresolved questions

1. **Stale sibling claim.** `kit/skills/plan/SKILL.md` (line 26) still says "there is no scaffolding subcommand" and lists the `av plan` verbs without `create`, `add-phase`, `kanban`, `parse`, `validate`, `migrate`. The binary registers all of them (`av plan --help`). The merged `av` skill states the truth; the `plan` skill was out of scope and now disagrees with it — it needs its own pass.
2. **`json-envelope.ts` comment is stale.** It says `validate` emits no JSON; `av validate --json` emits the `schema_version` envelope (sampled, `kind: "validate.kit"`). The merged skill follows the live behaviour. A one-line comment fix in source is outside this task.
3. **`av skill upgrade` semantics.** `--help` only says "upgrade"; the reference describes it as "re-resolve the env after its dependencies changed" (upstream's wording, adapted). If the trigger is something else, that one cell needs correcting.
4. **`av backups create` scope flag.** `av backups --help` lists `--global` for the group; the reference assumes it applies to `create` as to the other actions. Not separately provable from help.
5. **Integration gate.** Because the compiled binary cannot validate the worktree (see above), the coordinator should run the source `validate --check --strict` (CI's exact invocation) before merging; the two lints above were run from the same source modules and are expected to agree.
