# vcskill

Author agent skills, subagents, commands, and rules **once** in canonical Claude
format, then install them to any AI coding provider with one command.

```bash
npx vcskill install
```

A data-driven adapt engine rewrites paths, tool names, and file formats per
provider. Local-first; no account or network required.

## Install

Once published to npm, run it on any machine with no clone:

```bash
npx vcskill install                              # interactive: pick providers + scope
npx vcskill install --provider codex,cursor      # non-interactive
npx vcskill install --provider claude-code --global
npx vcskill install --provider opencode --dry-run # preview, write nothing
```

Global flags: `--home <dir>`, `--cwd <dir>`, `--dry-run`, `--yes`.

### Before the npm release (or for local builds)

`npx vcskill` works only after the package is published. Until then — or to test
an unreleased build on another machine — use one of:

```bash
# A) Carry the packed tarball, then install it globally
npm i -g ./vcskill-<version>.tgz
vcskill install --provider claude-code --dry-run

# B) Clone + build from source
git clone https://github.com/bavanchun/vcskill.git && cd vcskill
pnpm install && pnpm --filter vcskill build
node packages/cli/dist/index.js install --dry-run
```

See [`docs/release-and-publish-guide.md`](docs/release-and-publish-guide.md) for
the full publish runbook and one-time prerequisites.

## Commands

| Command | Purpose |
|---|---|
| `vcskill install [--provider a,b] [--global] [--dry-run]` | Install kit to providers; writes `.vcskill/receipt.json` |
| `vcskill list [--global]` | Show kit contents + per-provider install state |
| `vcskill doctor [--global]` | Health-check the install against its receipt (files, hooks, settings bindings, version) |
| `vcskill uninstall [--provider a,b] [--global] [--dry-run]` | Remove a provider's install; preserves any file you've edited since install |
| `vcskill backups list [--global]` | List timestamped backups with file counts |
| `vcskill backups restore <timestamp> [--file <rel>] [--global] [--dry-run]` | Restore file(s) from a backup, safety-backing up current state first |
| `vcskill update [--global]` | Check npm for a newer vcskill release (offline-safe) |
| `vcskill add-skill <name> [--description "…"]` | Scaffold a new canonical skill |
| `vcskill migrate [--provider id] [--global] [--dry-run]` | Relocate files when a provider's path convention changes |

## What's in the kit

21 skills + 13 agents + 6 hooks, distilled from daily usage. Every skill meets
one cook-grade bar — a real workflow, an `## Output format` contract, `##
Quality gates` self-checks, and a `## Workflow position` so the kit reads as one
graph. Risk lanes and proof vocabulary (`unit`/`integration`/`e2e`/`platform`)
are shared across skills, not siloed in `vc:cook`. See
[`docs/vc-skill-authoring-spec.md`](docs/vc-skill-authoring-spec.md).

- **Core loop skills**: `vc:brainstorm`, `vc:plan`, `vc:cook` (embedded
  test/review gates + risk-lane routing), `vc:fix` (root-cause loop), `vc:git`,
  `vc:scout`, `vc:ask`, `vc:pm`
- **Support skills**: `vc:problem-solving`, `vc:research`, `vc:docs` (incl.
  `decision` mode for durable records), `vc:skill-creator`, `vc:journal`,
  `vc:sequential-thinking`, `vc:docs-seeker`, `vc:bootstrap`,
  `vc:security-scan`, `vc:predict`, `vc:scenario`, `vc:worktree`
- **Personal skill**: `vc:obsidian-second-brain-note`
- **Agents** (`kit/agents/vc-*.md`, install alongside ClaudeKit without
  conflicts): `vc-explore`, `vc-planner`, `vc-reviewer`, `vc-tester`,
  `vc-debugger`, `vc-developer`, `vc-git-manager`, `vc-simplifier`,
  `vc-brainstormer`, `vc-researcher`, `vc-docs-manager`, `vc-project-manager`,
  `vc-journal-writer` — persona + behavioral checklist + status protocol,
  no external CLI coupling
- **Hooks** (claude-code only): session-init, rules-inject, privacy-block,
  scout-block, session-state, subagent-init — fail-open, node:test covered

## Getting started

```bash
npx vcskill install --provider claude-code   # or codex, cursor, opencode...
```

Then in Claude Code, try the daily loop: `/vc:brainstorm <idea>` to explore
an approach, `/vc:plan` to phase it, `/vc:cook <plan path>` to implement with
tests and review baked in. `/vc:scout <question>` answers "where does X
live" fast; `/vc:fix <bug>` proves a root cause before touching code.

## Provider matrix

| Artifact | claude-code | codex | cursor | antigravity | opencode | generic |
|---|---|---|---|---|---|---|
| skill | `.claude/skills/` | `~/.agents/skills/` | `.agents/skills/` | `.agents/skills/` | `.opencode/skills/` | `.agents/skills/` |
| agent | `.claude/agents/*.md` | `~/.codex/agents/*.toml` | `.agents/skills/` (shim) | **skip (unverified)** | `.opencode/agents/*.md` | skip |
| command | `.claude/commands/*.md` | `~/.codex/commands/*.md` | `.cursor/commands/*.md` | **skip (unverified)** | `.opencode/commands/*.md` | skip |
| rules | `.claude/rules/` | `AGENTS.md` block | `.cursor/rules/*.mdc` | `AGENTS.md` block | `AGENTS.md` block | `AGENTS.md` block |
| scripts | `.claude/scripts/` | `~/.agents/vcskill/scripts/` | `.agents/scripts/` | `.agents/scripts/` | `.opencode/scripts/` | `.agents/scripts/` |
| env | `.claude/.env.example` | `~/.agents/vcskill/.env.example` | `.agents/.env.example` | `.agents/.env.example` | `.opencode/.env.example` | `.agents/.env.example` |
| hook | `.claude/hooks/vc/*.cjs` | **skip (unverified)** | **skip (unverified)** | **skip (unverified)** | **skip (unverified)** | skip |

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
- Adapt engine is pure functions under `packages/cli/src/adapt/` (≥95% coverage).
- Path constants are single-sourced in `src/adapt/paths.ts` — change once.

Hooks (`kit/hooks/`) are a Claude Code event contract: installing to
claude-code copies hook files and — after a y/n confirmation — merges event
bindings into `.claude/settings.json` (idempotent, backed up). Declining or
running non-interactively prints a copy-pasteable snippet instead. Other
providers skip-and-log. Agents (`kit/agents/vc-*.md`) follow the same
frontmatter contract as skills, enforced by `packages/cli/src/kit/agent-lint.ts`
(name==file-stem, description with `<example>`/`<commentary>`, ≤120 lines,
required `Behavioral Checklist` heading) — see `docs/vc-skill-authoring-spec.md`.
skillsmp.com publishing is deferred.
