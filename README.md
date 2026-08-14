# ariadnev

[![Release](https://img.shields.io/github/v/release/bavanchun/ariadnev?label=release&color=b8232c)](https://github.com/bavanchun/ariadnev/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/bavanchun/ariadnev/ci.yml?branch=main&label=CI)](https://github.com/bavanchun/ariadnev/actions/workflows/ci.yml)
[![Platforms](https://img.shields.io/badge/platforms-macOS%20%C2%B7%20Linux%20%C2%B7%20Windows-informational)](#install)
[![License: MIT](https://img.shields.io/github/license/bavanchun/ariadnev?color=blue)](LICENSE)

Install the curated av workflow kit across coding-agent targets from one
local-first CLI. Its Agent Skills, specialist agents, and Claude Code hooks pass
repository quality gates; a data-driven adapt engine writes each artifact only
where its target path and format are verified, otherwise it skips and logs.

The standalone ariadnev CLI is self-contained and needs no Node runtime. Optional
Claude Code hooks are separate `.cjs` processes and require `node` when enabled.

## Install

A one-line install of the standalone CLI binary — **no Node needed for the CLI**.

**macOS / Linux**

```bash
curl -fsSL https://ariadnev.com/install | bash
```

**Windows (PowerShell)**

```powershell
irm https://ariadnev.com/install.ps1 | iex
```

The installer downloads the right binary for your platform from the ariadnev edge
(`ariadnev.com`) and **verifies its sha256** before installing to
`~/.local/bin` (macOS/Linux) or `%LOCALAPPDATA%\Programs\ariadnev` (Windows).
Change the target dir with `ARIADNEV_INSTALL_DIR`.

> **macOS Gatekeeper**: the binary is not yet notarized, so the first run may be
> blocked. Allow it with `xattr -d com.apple.quarantine "$(command -v ariadnev)"`.

The installer also links a short **`av`** alias next to the binary (skip it with
`ARIADNEV_ALIAS=off`; it never overwrites an existing `av`). Everywhere below,
`ariadnev` and `av` are interchangeable.

Then set up your providers:

```bash
av install                                   # interactive: pick providers + scope (or: ariadnev install)
ariadnev install --provider codex,cursor      # non-interactive
ariadnev install --provider claude-code --global
ariadnev install --provider opencode --dry-run # preview, write nothing
```

Global flags: `--home <dir>`, `--cwd <dir>`, `--dry-run`, `--yes`.

### Upgrading

After the first install, just run:

```bash
ariadnev update            # self-updates the binary to the latest release (sha256-verified)
ariadnev update --check    # only report whether a newer version exists
```

No need to re-run the curl installer.

### Build from source

```bash
git clone https://github.com/bavanchun/ariadnev.git && cd ariadnev
pnpm install
pnpm --filter ariadnev build:binary   # needs Bun; outputs packages/cli/dist/ariadnev
```

## Commands

| Command | Purpose |
|---|---|
| `ariadnev install [--provider a,b] [--global] [--dry-run]` | Install kit to providers; writes `.ariadnev/receipt.json` |
| `ariadnev list [--global]` | Show kit contents + per-provider install state |
| `ariadnev doctor [--global]` | Health-check the install against its receipt (files, hooks, settings bindings, version) |
| `ariadnev uninstall [--provider a,b] [--global] [--dry-run]` | Remove a provider's install; preserves any file you've edited since install. Recovers an install interrupted before its receipt was written, and fails rather than reporting success when there is no install record at all |
| `ariadnev backups list [--global]` | List timestamped backups with file counts |
| `ariadnev backups restore <timestamp> [--file <rel>] [--global] [--dry-run]` | Restore file(s) from a backup, safety-backing up current state first |
| `ariadnev update [--check] [--global]` | Self-update the binary to the latest release (sha256-verified); `--check` only reports (offline-safe) |
| `ariadnev validate [--check]` | Lint skills and compile workflow graphs for structural, authority, recovery, evidence, and capability defects; `--check` also fails on README matrix drift |
| `ariadnev contract [--json]` | Print the provider×artifact capability matrix (Markdown, or `--json` for machines) |
| `ariadnev eval [--skill <name>]` | Score kit skill quality; tier-1 static (free) always, tier-3 LLM judge when `ARIADNEV_EVAL_CMD` is set |
| `ariadnev eval --suite --runner '<json-argv>' ...` | Run the source-checkout Tier 2 behavioral suite in fresh fixtures; emits one redacted JSON report and exits non-zero on fail or incomplete evidence |
| `ariadnev run <workflow> [--runtime codex\|claude-code] [--instruction "…"] [--json]` | Validate, dry-run, or execute a provider-neutral workflow graph through the local durable runner |
| `ariadnev run resume\|status\|cancel <run-id> [--json]` | Resume with pinned identity, inspect durable state, or request cooperative cancellation |
| `ariadnev query [installs\|doctor\|history]` | Show the local history log (`~/.ariadnev/history.jsonl`) of installs, doctor runs, and updates |
| `ariadnev add-skill <name> [--description "…"]` | Scaffold a new canonical skill |
| `ariadnev migrate [--provider id] [--global] [--dry-run]` | Relocate files when a provider's path convention changes |

### Graph execution

The first public execution surface is local and read-only. Validate without a
provider, probe with global `--dry-run`, or run explicitly on Codex/Claude Code:

```bash
av run read-only-delivery --validate --json
av --dry-run run read-only-delivery --runtime claude-code --json
av run read-only-delivery --runtime claude-code --instruction "Find routing ownership and cite evidence" --json
```

Runs are event-sourced under `~/.ariadnev/runs/`, with private state snapshots,
checkpoint/resume, cancellation, runtime/version pinning, and stable JSON
envelopes. Run storage must remain outside the inspected workspace. Active
safe-change execution stays denied until a public side-effect/approval adapter
exists. See [the graph execution architecture](docs/graph-execution-architecture.md).

The proof boundary is explicit. `validate` proves static graph contracts;
fixture suites prove routing, trajectory, recovery, authority, and duplicate-
effect behavior; local benchmarks bound orchestration and retrieval overhead;
and capability-gated Codex/Claude probes prove only the pinned runtime that
actually ran. None of these claims prove general provider parity or safe
arbitrary workspace mutation. The release gate and reproducible commands are
documented in [the release guide](docs/release-and-publish-guide.md).

## What's in the kit

26 skills + 13 agents + 6 hooks today. Broader kit expansion remains paused
until a later benchmark justifies it. Claim-tracked skills pass an offline
omission ratchet. This is a static structure and traceability guarantee, not
proof of behavioral parity.

Every skill meets one cook-grade bar — a real workflow, an `## Output format`
contract, `## Quality gates` self-checks, and a `## Workflow position` so the kit
reads as one graph. Risk lanes and proof vocabulary
(`unit`/`integration`/`e2e`/`platform`) are shared across skills, not siloed in
`av:cook`. The three named headings and every cross-skill `av:<slug>` reference
are enforced by `ariadnev validate`, not left to convention. See
[`docs/av-skill-authoring-spec.md`](docs/av-skill-authoring-spec.md) for the
machine-enforced authoring contract.

- **Core loop skills**: `av:brainstorm`, `av:plan`, `av:cook` (embedded
  test/review gates + risk-lane routing), `av:fix` (root-cause loop),
  `av:code-review`, `av:test`, `av:ship` (test→review→git orchestrator),
  `av:review-pr` (GitHub PR + fix/reply/merge), `av:git`, `av:scout`, `av:ask`,
  `av:pm`
- **Support skills**: `av:problem-solving`, `av:research`, `av:docs` (incl.
  `decision` mode for durable records), `av:skill-creator`, `av:journal`,
  `av:handoff` (session compaction), `av:sequential-thinking`, `av:docs-seeker`,
  `av:bootstrap`, `av:security-scan`, `av:predict`, `av:scenario`, `av:worktree`
- **Personal skill**: `av:obsidian-second-brain-note`
- **Agents** (`kit/agents/av-*.md`, install alongside reference without
  conflicts): `av-explore`, `av-planner`, `av-reviewer`, `av-tester`,
  `av-debugger`, `av-developer`, `av-git-manager`, `av-simplifier`,
  `av-brainstormer`, `av-researcher`, `av-docs-manager`, `av-project-manager`,
  `av-journal-writer` — persona + behavioral checklist + status protocol,
  no external CLI coupling
- **Hooks** (claude-code only): session-init, rules-inject, privacy-block,
  scout-block, session-state, subagent-init — fail-open, node:test covered

## Getting started

```bash
ariadnev install --provider claude-code   # or codex, cursor, opencode...
```

Then in Claude Code, try the daily loop: `/av:brainstorm <idea>` to explore
an approach, `/av:plan` to phase it, `/av:cook <plan path>` to implement with
tests and review baked in. `/av:scout <question>` answers "where does X
live" fast; `/av:fix <bug>` proves a root cause before touching code.

## Provider matrix

Generated from `src/providers/{resolver,spec-verified}.ts` — do not hand-edit;
run `pnpm --filter ariadnev generate:matrix` and `ariadnev validate --check` gates it.

<!-- BEGIN provider-matrix (generated) -->
| artifact | claude-code | codex | cursor | antigravity | opencode | generic |
|---|---|---|---|---|---|---|
| skill | `.claude/skills/` | `~/.agents/skills/` | `.agents/skills/` | `.agents/skills/` | `.opencode/skills/` | `.agents/skills/` |
| agent | `.claude/agents/*.md` | `~/.codex/agents/*.toml` | `.agents/skills/*` | skip | `.opencode/agents/*.md` | skip |
| command | `.claude/commands/*.md` | `~/.codex/commands/*.md` | `.cursor/commands/*.md` | skip | `.opencode/commands/*.md` | skip |
| rules | `.claude/rules/*.md` | `AGENTS.md` | `.cursor/rules/*.mdc` | `AGENTS.md` | `AGENTS.md` | `AGENTS.md` |
| scripts | `.claude/scripts/` | `~/.agents/ariadnev/scripts/` | `.agents/scripts/` | `.agents/scripts/` | `.opencode/scripts/` | `.agents/scripts/` |
| env | `.claude/.env.example` | `~/.agents/ariadnev/.env.example` | `.agents/.env.example` | `.agents/.env.example` | `.opencode/.env.example` | `.agents/.env.example` |
| hook | `.claude/hooks/av/*.cjs` | skip | skip | skip | skip | skip |
| outputStyle | skip | skip | skip | skip | skip | skip |
<!-- END provider-matrix (generated) -->

Cells marked `skip` are unverified target paths — ariadnev never guesses; it
skips and logs them in the install summary. See `src/providers/spec-verified.ts`.

## Maintainer authoring

The canonical source lives in `kit/` (Agent Skills format). Run authoring
commands from a source checkout so they update that tree. The standalone
binary's embedded kit is extracted to a versioned cache; it is the install
distribution, not a durable custom-kit workspace.

A skill in `kit/skills/<slug>/SKILL.md` must declare `name: av:<slug>`.

```bash
ariadnev add-skill my-skill --description "When to use this skill"
# → kit/skills/my-skill/SKILL.md  (name: av:my-skill)
ariadnev install --provider cursor --dry-run   # see it land
```

## Telemetry

ariadnev has an **anonymous, opt-out** telemetry facility that is **off by default**
— nothing is sent unless an ingest endpoint is configured (none ships yet). When
enabled it is **stateless**: no device id, no IP, no identifiers, and only
categorical enums (event name, provider id or `custom`, an `errorClass`) ever
leave the machine. Check status with `ariadnev telemetry status`. Opt out any time
with `ARIADNEV_TELEMETRY_DISABLED=1` or the standard `DO_NOT_TRACK=1`; it is also
off automatically in CI.

## Security

The installer verifies each binary's sha256 before installing, and the CLI
redacts credential-shaped strings from all output. To report a vulnerability,
see [`SECURITY.md`](SECURITY.md) (please report privately).

## Contributing

- `pnpm install` → `pnpm test` (vitest, TDD).
- Adapt engine is pure functions under `packages/cli/src/adapt/` (≥95% coverage).
- Path constants are single-sourced in `src/adapt/paths.ts` — change once.

Hooks (`kit/hooks/`) are a Claude Code event contract: installing to
claude-code copies hook files and — after a y/n confirmation — merges event
bindings into `.claude/settings.json` (idempotent, backed up). Declining or
running non-interactively prints a copy-pasteable snippet instead. Other
providers skip-and-log. Agents (`kit/agents/av-*.md`) follow the same
frontmatter contract as skills, enforced by `packages/cli/src/kit/agent-lint.ts`
(name==file-stem, description with `<example>`/`<commentary>`, ≤120 lines,
required `Behavioral Checklist` heading) — see `docs/av-skill-authoring-spec.md`.
skillsmp.com publishing is deferred.
