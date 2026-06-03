# vcskill

Author agent skills, subagents, commands, and rules **once** in canonical Claude
format, then install them to any AI coding provider with one command.

```bash
npx vcskill install
```

A data-driven adapt engine rewrites paths, tool names, and file formats per
provider. Local-first; no account or network required.

## Install

```bash
npx vcskill install                              # interactive: pick providers + scope
npx vcskill install --provider codex,cursor      # non-interactive
npx vcskill install --provider claude-code --global
npx vcskill install --provider opencode --dry-run # preview, write nothing
```

Global flags: `--home <dir>`, `--cwd <dir>`, `--dry-run`, `--yes`.

## Commands

| Command | Purpose |
|---|---|
| `vcskill install [--provider a,b] [--global] [--dry-run]` | Install kit to providers |
| `vcskill list [--global]` | Show kit contents + per-provider install state |
| `vcskill add-skill <name> [--description "…"]` | Scaffold a new canonical skill |
| `vcskill migrate [--provider id] [--global] [--dry-run]` | Relocate files when a provider's path convention changes |

## Provider matrix

| Artifact | claude-code | codex | cursor | antigravity | opencode | generic |
|---|---|---|---|---|---|---|
| skill | `.claude/skills/` | `~/.agents/skills/` | `.agents/skills/` | `.agents/skills/` | `.opencode/skills/` | `.agents/skills/` |
| agent | `.claude/agents/*.md` | `~/.codex/agents/*.toml` | `.agents/skills/` (shim) | **skip (unverified)** | `.opencode/agents/*.md` | skip |
| command | `.claude/commands/*.md` | `~/.codex/commands/*.md` | `.cursor/commands/*.md` | **skip (unverified)** | `.opencode/commands/*.md` | skip |
| rules | `.claude/rules/` | `AGENTS.md` block | `.cursor/rules/*.mdc` | `AGENTS.md` block | `AGENTS.md` block | `AGENTS.md` block |
| scripts | `.claude/scripts/` | `~/.agents/vcskill/scripts/` | `.agents/scripts/` | `.agents/scripts/` | `.opencode/scripts/` | `.agents/scripts/` |
| env | `.claude/.env.example` | `~/.agents/vcskill/.env.example` | `.agents/.env.example` | `.agents/.env.example` | `.opencode/.env.example` | `.agents/.env.example` |

Cells marked **skip** are unverified target paths — vcskill never guesses; it
skips and logs them in the install summary. See `src/providers/spec-verified.ts`.

## Authoring

The canonical source lives in `kit/` (Claude Agent Skills format). Skill naming
rule: a skill in `kit/skills/<slug>/SKILL.md` must declare `name: vc:<slug>`.

```bash
vcskill add-skill my-skill --description "When to use this skill"
# → kit/skills/my-skill/SKILL.md  (name: vc:my-skill)
vcskill install --provider cursor --dry-run   # see it land
```

## Contributing

- `pnpm install` → `pnpm test` (vitest, TDD).
- Adapt engine is pure functions under `packages/cli/src/adapt/` (≥90% coverage).
- Path constants are single-sourced in `src/adapt/paths.ts` — change once.

Hooks are **not** shipped in v1. skillsmp.com publishing is deferred.
