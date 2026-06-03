# Brainstorm Summary — vcskill: Multi-Provider Skill Kit + Installer CLI

**Date:** 2026-06-03
**Status:** Approved (design locked, ready for /ck:plan)
**Repo target:** `~/Codes/My-projects/vcskill`
**npm package / CLI bin:** `vcskill` → `npx vcskill install`

## Problem
Skills authored today install only for the current agent/provider. Want ClaudeKit's model: author once in canonical Claude format → `install` → pick provider(s) → kit adapts paths/tool-names/format so chosen provider can use the skill immediately. Local-first now; skillsmp.com publish deferred.

## Reference studied
`~/Documents/claudekit-engineer` — key mechanisms reused:
- Single source of truth: `claude/skills/<name>/SKILL.md` (Agent Skills Spec).
- Porting engine: `scripts/codex_generator_common.py::adapt_content()` — path-rewrite + tool-name-rewrite tables, compatibility footer.
- Per-provider generators: `codex_generator.py` (.md agents→`.codex/agents/*.toml`), `generate-opencode.py` (`.opencode/` tree).
- `portable-manifest.json`: version-keyed `providerPathMigrations` + `renames` for upgrade migration.
- Unified neutral location `.agents/skills/`.
- Installer/provider-picker lives in separate npm pkg `claudekit-cli` (this repo = content+generators).

## Research finding (2026 convention)
Convergence on `.agents/skills/<name>/SKILL.md` + `AGENTS.md`, read natively by Codex, Cursor, OpenCode, Antigravity. **Claude Code = only one locked to `.claude/skills/`.** → leaner than claudekit 3.37.0.
UNVERIFIED: Antigravity/OpenCode exact agent+command paths & subagent tool-names; Codex `.codex/agents/*.toml` schema. Treat provider resolvers as data-driven configs to fix in one place when verified.

## Decisions (user-confirmed)
| Topic | Choice |
|---|---|
| Build shape | Lean kit + installer CLI (own repo, not full claudekit fork) |
| Authoring format | Canonical SKILL.md + adapt tables (claudekit-style) |
| Transform depth | Tiered: native copy + deep generators only where format differs |
| Distribution | Local-first; skillsmp deferred |
| Repo location | `~/Codes/My-projects/vcskill` |
| CLI language | Node/TypeScript (npm-publishable) |
| Kit contents | skills + subagents + slash commands + rules/hooks/env (full content surface) |
| Name | `vcskill` |
| Target providers | Claude Code, Codex, Antigravity, Cursor, OpenCode (+generic option) |

## Architecture
Monorepo: `kit/` (canonical Claude-format source: skills/agents/commands/rules/hooks/.env.example) + `packages/cli/` (TS installer: provider resolvers, adapt engine, install/migrate/add-skill/list) + `portable-manifest.json` + `kit.config.json`.

### Porting engine
- `path-rewrites`: `.claude/...` → per-provider config dirs.
- `tool-rewrites` (non-Claude bodies only): AskUserQuestion→request_user_input, TodoWrite→update_plan, Task→spawn_agent, SendMessage→send_input. Codex table verified; others identity-map + compatibility footer until verified.
- Idempotent: timestamped backup before overwrite.

### Provider target matrix
| Artifact | Claude Code | Codex | Cursor | Antigravity | OpenCode | Generic |
|---|---|---|---|---|---|---|
| skills | `.claude/skills/` | `.agents/skills/` | `.agents/skills/` | `.agents/skills/` | `.opencode/skills/` | `.agents/skills/` |
| agents | `.claude/agents/*.md` | `.codex/agents/*.toml` (transform) | `.agents/skills/` shim | UNVERIFIED→`.agents/` | `.opencode/agent/` | skip |
| commands | `.claude/commands/*.md` | `.codex/prompts/` | `.cursor/commands/` | UNVERIFIED | `.opencode/command/` | skip |
| rules | `.claude/rules/` | AGENTS.md | `.cursor/rules/*.mdc` | AGENTS.md | AGENTS.md | AGENTS.md |
| env | `.claude/.env` | `.agents/.../.env` | … | … | … | … |
Scope flag: `--global` (~/) vs `--project` (./).

### CLI surface
- `npx vcskill install` (interactive multiselect providers + scope)
- `npx vcskill install --provider codex,cursor --global --dry-run`
- `npx vcskill add-skill <name>` (scaffold canonical SKILL.md)
- `npx vcskill migrate` (apply portable-manifest migrations)
- `npx vcskill list`

## Build sequence (→ plan phases)
1. Scaffold monorepo + canonical `kit/` with sample skills/agent/command.
2. TS CLI skeleton (commander + clack) + provider resolvers (paths only).
3. Adapt engine: path-rewrites + backup + idempotent copy → Claude Code + `.agents/skills` providers working.
4. Deep transforms: Codex agent→TOML + tool-rewrites; command mapping.
5. `portable-manifest.json` + `migrate`.
6. `add-skill` scaffolder + `list`.
7. Docs + npm publish config (skillsmp deferred).

## Success criteria
- `npx vcskill install` → pick provider → sample skill usable in that provider.
- `add-skill foo` then reinstall → `foo` lands in selected provider's path, adapted.
- Codex agents emitted as valid TOML; commands mapped per provider.
- Re-running install backs up + is idempotent (no dup/corruption).
- `migrate` relocates files when manifest version bumps.

## Risks
- UNVERIFIED provider specs (Antigravity/OpenCode/Codex paths+tool-names) → data-driven resolvers, fix-in-one-place.
- Claude Code can't read `.agents/skills` → double-write to `.claude/skills` (accepted).
- Lossy tool-rewrite for orchestration skills → keep Claude tool names as documented aliases + compatibility footer.

## Open questions
- Codex `.codex/agents/*.toml` schema — verify against live Codex CLI before Phase 4.
- Antigravity agent/command install paths — verify before relying (skills path `.agents/skills/` is safe).
- OpenCode subagent tool-name table — verify or ship identity-map.
