# vcskill

[![Release](https://img.shields.io/github/v/release/bavanchun/vcskill?label=release&color=b8232c)](https://github.com/bavanchun/vcskill/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/bavanchun/vcskill/ci.yml?branch=main&label=CI)](https://github.com/bavanchun/vcskill/actions/workflows/ci.yml)
[![Platforms](https://img.shields.io/badge/platforms-macOS%20%C2%B7%20Linux%20%C2%B7%20Windows-informational)](#install)
[![License: MIT](https://img.shields.io/github/license/bavanchun/vcskill?color=blue)](LICENSE)

Install the curated vc workflow kit across coding-agent targets from one
local-first CLI. Its Agent Skills, specialist agents, and Claude Code hooks pass
repository quality gates; a data-driven adapt engine writes each artifact only
where its target path and format are verified, otherwise it skips and logs.

The standalone vcskill CLI is self-contained and needs no Node runtime. Optional
Claude Code hooks are separate `.cjs` processes and require `node` when enabled.

## Install

A one-line install of the standalone CLI binary — **no Node needed for the CLI**.

**macOS / Linux**

```bash
curl -fsSL https://vcskill.vchun.dev/install | bash
```

**Windows (PowerShell)**

```powershell
irm https://vcskill.vchun.dev/install.ps1 | iex
```

The installer downloads the right binary for your platform from the vcskill edge
(`vcskill.vchun.dev`) and **verifies its sha256** before installing to
`~/.local/bin` (macOS/Linux) or `%LOCALAPPDATA%\Programs\vcskill` (Windows).
Change the target dir with `VCSKILL_INSTALL_DIR`.

> **macOS Gatekeeper**: the binary is not yet notarized, so the first run may be
> blocked. Allow it with `xattr -d com.apple.quarantine "$(command -v vcskill)"`.

The installer also links a short **`vc`** alias next to the binary (skip it with
`VCSKILL_ALIAS=off`; it never overwrites an existing `vc`). Everywhere below,
`vcskill` and `vc` are interchangeable.

Then set up your providers:

```bash
vc install                                   # interactive: pick providers + scope (or: vcskill install)
vcskill install --provider codex,cursor      # non-interactive
vcskill install --provider claude-code --global
vcskill install --provider opencode --dry-run # preview, write nothing
```

Global flags: `--home <dir>`, `--cwd <dir>`, `--dry-run`, `--yes`.

### Upgrading

After the first install, just run:

```bash
vcskill update            # self-updates the binary to the latest release (sha256-verified)
vcskill update --check    # only report whether a newer version exists
```

No need to re-run the curl installer.

### Build from source

```bash
git clone https://github.com/bavanchun/vcskill.git && cd vcskill
pnpm install
pnpm --filter vcskill build:binary   # needs Bun; outputs packages/cli/dist/vcskill
```

## Commands

| Command | Purpose |
|---|---|
| `vcskill install [--provider a,b] [--global] [--dry-run]` | Install kit to providers; writes `.vcskill/receipt.json` |
| `vcskill list [--global]` | Show kit contents + per-provider install state |
| `vcskill doctor [--global]` | Health-check the install against its receipt (files, hooks, settings bindings, version) |
| `vcskill uninstall [--provider a,b] [--global] [--dry-run]` | Remove a provider's install; preserves any file you've edited since install |
| `vcskill backups list [--global]` | List timestamped backups with file counts |
| `vcskill backups restore <timestamp> [--file <rel>] [--global] [--dry-run]` | Restore file(s) from a backup, safety-backing up current state first |
| `vcskill update [--check] [--global]` | Self-update the binary to the latest release (sha256-verified); `--check` only reports (offline-safe) |
| `vcskill validate [--check]` | Lint skills and compile workflow graphs for structural, authority, recovery, evidence, and capability defects; `--check` also fails on README matrix drift |
| `vcskill coverage [--skill <name>]` | Strict offline omission ratchet; fails on unclassified or unmatched claims. Skills without tracked claims are reported as not applicable |
| `vcskill contract [--json]` | Print the provider×artifact capability matrix (Markdown, or `--json` for machines) |
| `vcskill eval [--skill <name>]` | Score kit skill quality; tier-1 static (free) always, tier-3 LLM judge when `VCSKILL_EVAL_CMD` is set |
| `vcskill eval --suite --runner '<json-argv>' ...` | Run the source-checkout Tier 2 behavioral suite in fresh fixtures; emits one redacted JSON report and exits non-zero on fail or incomplete evidence |
| `vcskill run <workflow> [--runtime codex\|claude-code] [--instruction "…"] [--json]` | Validate, dry-run, or execute a provider-neutral workflow graph through the local durable runner |
| `vcskill run resume\|status\|cancel <run-id> [--json]` | Resume with pinned identity, inspect durable state, or request cooperative cancellation |
| `vcskill query [installs\|doctor\|history]` | Show the local history log (`~/.vcskill/history.jsonl`) of installs, doctor runs, and updates |
| `vcskill add-skill <name> [--description "…"]` | Scaffold a new canonical skill |
| `vcskill migrate [--provider id] [--global] [--dry-run]` | Relocate files when a provider's path convention changes |

### Graph execution

The first public execution surface is local and read-only. Validate without a
provider, probe with global `--dry-run`, or run explicitly on Codex/Claude Code:

```bash
vc run read-only-delivery --validate --json
vc --dry-run run read-only-delivery --runtime claude-code --json
vc run read-only-delivery --runtime claude-code --instruction "Find routing ownership and cite evidence" --json
```

Runs are event-sourced under `~/.vcskill/runs/`, with private state snapshots,
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
`vc:cook`. The three named headings and every cross-skill `vc:<slug>` reference
are enforced by `vcskill validate`, not left to convention. See
[`docs/vc-skill-authoring-spec.md`](docs/vc-skill-authoring-spec.md) for the
machine-enforced authoring contract.

- **Core loop skills**: `vc:brainstorm`, `vc:plan`, `vc:cook` (embedded
  test/review gates + risk-lane routing), `vc:fix` (root-cause loop),
  `vc:code-review`, `vc:test`, `vc:ship` (test→review→git orchestrator),
  `vc:review-pr` (GitHub PR + fix/reply/merge), `vc:git`, `vc:scout`, `vc:ask`,
  `vc:pm`
- **Support skills**: `vc:problem-solving`, `vc:research`, `vc:docs` (incl.
  `decision` mode for durable records), `vc:skill-creator`, `vc:journal`,
  `vc:handoff` (session compaction), `vc:sequential-thinking`, `vc:docs-seeker`,
  `vc:bootstrap`, `vc:security-scan`, `vc:predict`, `vc:scenario`, `vc:worktree`
- **Personal skill**: `vc:obsidian-second-brain-note`
- **Agents** (`kit/agents/vc-*.md`, install alongside reference without
  conflicts): `vc-explore`, `vc-planner`, `vc-reviewer`, `vc-tester`,
  `vc-debugger`, `vc-developer`, `vc-git-manager`, `vc-simplifier`,
  `vc-brainstormer`, `vc-researcher`, `vc-docs-manager`, `vc-project-manager`,
  `vc-journal-writer` — persona + behavioral checklist + status protocol,
  no external CLI coupling
- **Hooks** (claude-code only): session-init, rules-inject, privacy-block,
  scout-block, session-state, subagent-init — fail-open, node:test covered

## Getting started

```bash
vcskill install --provider claude-code   # or codex, cursor, opencode...
```

Then in Claude Code, try the daily loop: `/vc:brainstorm <idea>` to explore
an approach, `/vc:plan` to phase it, `/vc:cook <plan path>` to implement with
tests and review baked in. `/vc:scout <question>` answers "where does X
live" fast; `/vc:fix <bug>` proves a root cause before touching code.

## Provider matrix

Generated from `src/providers/{resolver,spec-verified}.ts` — do not hand-edit;
run `pnpm --filter vcskill generate:matrix` and `vcskill validate --check` gates it.

<!-- BEGIN provider-matrix (generated) -->
| artifact | claude-code | codex | cursor | antigravity | opencode | generic |
|---|---|---|---|---|---|---|
| skill | `.claude/skills/` | `~/.agents/skills/` | `.agents/skills/` | `.agents/skills/` | `.opencode/skills/` | `.agents/skills/` |
| agent | `.claude/agents/*.md` | `~/.codex/agents/*.toml` | `.agents/skills/*` | skip | `.opencode/agents/*.md` | skip |
| command | `.claude/commands/*.md` | `~/.codex/commands/*.md` | `.cursor/commands/*.md` | skip | `.opencode/commands/*.md` | skip |
| rules | `.claude/rules/*.md` | `AGENTS.md` | `.cursor/rules/*.mdc` | `AGENTS.md` | `AGENTS.md` | `AGENTS.md` |
| scripts | `.claude/scripts/` | `~/.agents/vcskill/scripts/` | `.agents/scripts/` | `.agents/scripts/` | `.opencode/scripts/` | `.agents/scripts/` |
| env | `.claude/.env.example` | `~/.agents/vcskill/.env.example` | `.agents/.env.example` | `.agents/.env.example` | `.opencode/.env.example` | `.agents/.env.example` |
| hook | `.claude/hooks/vc/*.cjs` | skip | skip | skip | skip | skip |
<!-- END provider-matrix (generated) -->

Cells marked `skip` are unverified target paths — vcskill never guesses; it
skips and logs them in the install summary. See `src/providers/spec-verified.ts`.

## Maintainer authoring

The canonical source lives in `kit/` (Agent Skills format). Run authoring
commands from a source checkout so they update that tree. The standalone
binary's embedded kit is extracted to a versioned cache; it is the install
distribution, not a durable custom-kit workspace.

A skill in `kit/skills/<slug>/SKILL.md` must declare `name: vc:<slug>`.

```bash
vcskill add-skill my-skill --description "When to use this skill"
# → kit/skills/my-skill/SKILL.md  (name: vc:my-skill)
vcskill install --provider cursor --dry-run   # see it land
```

## Telemetry

vcskill has an **anonymous, opt-out** telemetry facility that is **off by default**
— nothing is sent unless an ingest endpoint is configured (none ships yet). When
enabled it is **stateless**: no device id, no IP, no identifiers, and only
categorical enums (event name, provider id or `custom`, an `errorClass`) ever
leave the machine. Check status with `vcskill telemetry status`. Opt out any time
with `VCSKILL_TELEMETRY_DISABLED=1` or the standard `DO_NOT_TRACK=1`; it is also
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
providers skip-and-log. Agents (`kit/agents/vc-*.md`) follow the same
frontmatter contract as skills, enforced by `packages/cli/src/kit/agent-lint.ts`
(name==file-stem, description with `<example>`/`<commentary>`, ≤120 lines,
required `Behavioral Checklist` heading) — see `docs/vc-skill-authoring-spec.md`.
skillsmp.com publishing is deferred.
