# ariadnev

[![Release](https://img.shields.io/github/v/release/bavanchun/ariadnev-kit?label=release&color=b8232c)](https://github.com/bavanchun/ariadnev-kit/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/bavanchun/ariadnev-kit/ci.yml?branch=main&label=CI)](https://github.com/bavanchun/ariadnev-kit/actions/workflows/ci.yml)
[![Platforms](https://img.shields.io/badge/platforms-macOS%20%C2%B7%20Linux%20%C2%B7%20Windows-informational)](#install)
[![License: MIT](https://img.shields.io/github/license/bavanchun/ariadnev-kit?color=blue)](LICENSE)

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

`ARIADNEV_BASE_URL` points the **binary** download at another host — a mirror, a
staging edge, a local server. `checksums.txt` still comes from `ariadnev.com`, so
an overridden host cannot vouch for its own binary; a mismatch aborts the install.
To take the checksums from that host too — deliberate staging or offline testing —
also set `ARIADNEV_ALLOW_UNVERIFIED_BASE=1`, which prints a warning saying the
checksum no longer authenticates anything.

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
ariadnev update --to 1.0.0 # install one exact release — how you roll back off a bad one
```

No need to re-run the curl installer.

### Build from source

```bash
git clone https://github.com/bavanchun/ariadnev-kit.git && cd ariadnev-kit
pnpm install
pnpm --filter ariadnev build:binary   # needs Bun; outputs packages/cli/dist/ariadnev
```

## Commands

| Command | Purpose |
|---|---|
| `ariadnev install [--provider a,b] [--global] [--force] [--dry-run]` | Install kit to providers; writes `.ariadnev/receipt.json`. A file you have edited since the last install is left alone and reported as skipped — `--force` overwrites it, backing it up first |
| `ariadnev init [dir] [--provider a,b] [--project-id name] [--force]` | Set up a directory and register it as a project. Wraps `install`, so its receipt, backups and guards are the same ones |
| `ariadnev new <name> [--provider a,b]` | Create a directory inside the current one, scaffold it, then `init` it. Takes a name, not a path — use `init <dir>` to set up a directory elsewhere |
| `ariadnev projects <list\|add\|remove\|show\|prune>` | The index of directories ariadnev has initialized. `remove` and `prune` change the index only and delete nothing on disk; `prune --all` needs both `--force` and `--yes` |
| `ariadnev setup [--step a,b] [--config file.json] [--no-interactive]` | Configure ariadnev. Writes no credentials — every field the schema marks sensitive is refused |
| `ariadnev list [--global]` | Show kit contents + per-provider install state |
| `ariadnev doctor [--global]` | Health-check the install against its receipt (files, hooks, settings bindings, version, and legacy skill directories recorded by an interrupted heal journal) |
| `ariadnev uninstall [--provider a,b] [--global] [--force] [--purge] [--yes]` | **Previews by default** — prints the plan and deletes nothing until you pass `--yes`. Every file is copied into `.ariadnev/backups/` before it is unlinked. A file you have edited since install is kept unless you pass `--force`; a file ariadnev did not install is reported and never deleted, under any flag. Recovers an install interrupted before its receipt was written, and fails rather than reporting success when there is no install record at all |
| `ariadnev uninstall … --purge` | Removes everything ariadnev put on this machine, not just what a provider install wrote: the `.ariadnev` state directory, every project install registered in `projects.json`, the MCP residue (`*.ariadnev-backup` files, plus server entries whose `command` is the ariadnev binary — never one it cannot prove it added), and the binary with its `av` alias. **Irreversible**: it deletes `.ariadnev/backups`, including the copies its own earlier passes just took. An entry inside `.ariadnev` that is not part of the state layout is kept and reported, never swept up. Cannot be combined with `--provider`. On Windows the binary is reported rather than deleted, since a running executable cannot be unlinked there. Without `--global` it means this project only: its provider files and its `.ariadnev`, no registry fan-out and no binary |
| `ariadnev audit [kit\|scripts] [--global] [--json] [--strict]` | Classify every installed file against the receipt (`ok`/`modified`/`missing`/`untracked`), or scan the scripts the kit ships for privilege escalation, remote code execution, and writes outside the skill. Exits 1 on drift; `--strict` also fails on untracked files and flagged scripts |
| `ariadnev skill <install\|verify\|repair\|upgrade\|remove\|run> [name] [args…]` | Manage the Python environment a skill's scripts need, and run those scripts under the right interpreter. Most skills import only the standard library and need no environment; those that do get one built from a pinned, hash-verified lock. `verify` reads installed metadata only — `--deep` additionally imports the packages in a timed-out child process |
| `ariadnev backups create [--global] [--dry-run]` | Snapshot the operational state: activity log, project registry, opt-in markers, install receipts. **Derived indexes are excluded on purpose** — they rebuild, and a snapshot carrying a reproducible cache would quietly make that cache load-bearing. The activity log is captured segment-wise and trimmed to its last complete record, so a snapshot taken mid-append is never torn |
| `ariadnev backups list [--global]` | List timestamped backups with file counts |
| `ariadnev backups show <timestamp> [--global]` | Name every entry in one backup, with its kind and size |
| `ariadnev backups verify <timestamp> [--global] [--rebuild]` | Re-hash every copy against the manifest: `ok` / `corrupt` / `missing` / `unverifiable`. Exits 1 on anything but `ok`, including a backup written before manifests recorded digests — it is restorable, but not provable. `--rebuild` additionally proves the derived state a snapshot omits can be regenerated, in a throwaway directory rather than against your live index |
| `ariadnev backups restore <timestamp\|--latest> [--file <rel>] [--global] [--dry-run]` | Restore file(s) from a backup, safety-backing up current state first |
| `ariadnev backups prune [--older-than <days>] [--keep-last <n>] [--global] [--dry-run]` | Remove old backups by age, by count, or both — when both are given, a backup survives if either rule keeps it. Never removes a `heal-` backup, which is the only copy of a tree an upgrade deleted |
| `ariadnev recover [<timestamp>] [--allow-root <dir>] [--dry-run] [--global]` | Replay a snapshot back to its original paths. **Previews unless `--yes`** — it wrote by default in earlier releases, so the invocation whose meaning changed says so. `--allow-root` narrows what a restore may write under; it never widens it |
| `ariadnev diagnostics export [--offline] [--json]` | A support bundle that is safe to paste into an issue. Built from a fixed list of named fields rather than by collecting everything and filtering — counts and capability flags, never paths or file contents, with the home directory shown as `~` |
| `ariadnev versions [--local-only] [--cache-ttl <d>] [--json]` | The CLI, kit, and per-skill versions, entirely offline. There is no ariadnev versions registry, so it says so rather than leaving a blank `latest` column implying a lookup that failed |
| `ariadnev unlock [--global]` | Clear a leaked lifecycle lock. Mutating commands take an advisory lock on the roots they write and exit **3** rather than interleave; a lock whose owner is still alive is reported, never broken, so clearing one is always a deliberate act |
| `ariadnev update [--check] [--global] [--to <x.y.z>]` | Self-update the binary to the latest release (sha256-verified); `--check` only reports (offline-safe), `--to` installs one exact release so a regression can be rolled back |
| `ariadnev validate [--check] [--strict]` | Lint skills and compile workflow graphs for structural, authority, recovery, evidence, and capability defects, including `av`-invocation citations against the live command tree; `--check` also fails on README matrix drift, `--strict` counts orphan and dangling reference warnings as failures and refuses an `av-invocation-allowlist.json` grown past its committed ceiling |
| `ariadnev contract [--json]` | Print the provider×artifact capability matrix (Markdown, or `--json` for machines) |

Every top-level command accepts `--json`, and a test asserts that against the
real command tree rather than a list. Most emit
`{ schema_version, kind, data }` with a dot-namespaced `kind` (`list.kit`,
`backups.verify`, `doctor.diagnose`). Five predate that envelope and keep their
own shape as their contract — `contract`, `audit`, `config`, `workflow` and `eval`
— which `LEGACY_JSON_COMMANDS` records so adding a sixth takes a deliberate
edit.
| `ariadnev eval [--skill <name>]` | Score kit skill quality; tier-1 static (free) always, tier-3 LLM judge when `ARIADNEV_EVAL_CMD` is set |
| `ariadnev eval --suite --runner '<json-argv>' ...` | Run the source-checkout Tier 2 behavioral suite in fresh fixtures; emits one redacted JSON report and exits non-zero on fail or incomplete evidence |
| `ariadnev workflow run <workflow> [--runtime codex\|claude-code] [--instruction "…"] [--json]` | Validate, dry-run, or execute a provider-neutral workflow graph through the local durable runner |
| `ariadnev workflow resume\|status\|cancel <run-id> [--json]` | Resume with pinned identity, inspect durable state, or request cooperative cancellation |
| `ariadnev run <kit>/<skill> [args…] [--target <provider>] [--timeout 30s] [--kits-dir <dir>]` | Dispatch one skill to a coding agent and stream its output. The slash is the discriminator: a slashed reference dispatches, a bare workflow ID is the deprecated spelling of `workflow run` and warns on stderr until 1.4.0. Only providers whose non-interactive invocation was read off their own `--help` are dispatchable (`claude-code`, `codex`, `cursor`, `omp`); the rest are refused rather than guessed. SIGINT and `--timeout` tear down the agent's whole process group, escalating `TERM` to `KILL`, so nothing survives the command |
| `ariadnev skills <list\|show\|search\|install\|remove\|graph> [name] [--provider id] [--global]` | Browse the kit's skills and install or remove one at a time. `list` reports what is actually on disk rather than what a receipt claims; `search` exits 1 when nothing matches, so a script can branch without parsing; `graph` prints the workflow relationships skills declare, marking edges that name something outside the kit as unresolved. Not to be confused with `skill` (singular), which manages one skill's Python environment |
| `ariadnev agents <list\|show\|search\|install\|remove> [name] [--provider id] [--global]` | The same five verbs over the kit's subagents |
| `ariadnev commands <list\|show\|search\|install\|remove> [name] [--provider id] [--global]` | The same five verbs over the kit's slash commands. All three share one implementation, so their `--json` envelopes cannot drift apart |
| `ariadnev plan use\|show\|list\|resolve [--json]` | Point the current branch at a plan directory, show it with its phases, list every plan, or print the resolved directory path |
| `ariadnev plan update <phase> <status>` / `check\|uncheck <phase>` / `status [status]` / `close` | Set a phase's status in both the phase file and the index table, or set the plan's own status. Acts on the branch's plan unless `--plan <name>` says otherwise |
| `ariadnev plan phase <n>` / `search <query>` / `reindex` | Print one phase in full, search every plan's files, or re-read them all and report what is malformed — there is no index to rebuild, the files are the record |
| `ariadnev plan archive [--force]` / `cleanup [--archive]` | Move a finished plan under `plans/archive/`; `cleanup` lists (or moves) every finished plan. Archiving unfinished work needs `--force` |
| `ariadnev plan create <title> [--use]` / `add-phase <title> [--depends 1,2]` | Scaffold `plans/<YYMMDD-HHMM>-<slug>/plan.md`, or append the next `phase-NN-<slug>.md` and a row in the plan's table. Phase numbers are max + 1, never a reused gap. `create` does not repoint the branch unless `--use` says so, and refuses an existing directory rather than merging into it. Both templates are written to pass `plan validate` |
| `ariadnev plan kanban [name]` / `parse` / `validate` | Phases as a board grouped by status; a plan as structured data with per-phase checkbox progress; or one plan's format checked, exiting 1 when it is invalid. An unrecognised phase status gets its own board column rather than being relabelled |
| `ariadnev plan migrate <from>` | Move plan directories that live elsewhere in the repo into the plans root, so `list`, `use` and `resolve` can see them. Sources are named, never discovered by walking; a name already taken is reported and skipped, never overwritten |
| `ariadnev journal create <title> [--component] [--status] [--body]` | Write a dated entry under the docs dir. Never overwrites an existing one |
| `ariadnev journal list\|show <term>\|validate [--json]` | List entries newest first, print one, or check every entry has a title, date, status, and body |
| `ariadnev kit install-path <provider> [--global] [--json]` | Show where each artifact kind would be written for a provider, including the kinds that would be skipped |
| `ariadnev kit refresh` | Discard the extracted kit cache and extract it again |
| `ariadnev mcp link <name> [--to-project] [--allow-secrets]` | Mirror a server between the project and user scopes. A copy, never a move. Writing a server that carries env **values** into `.mcp.json` needs `--allow-secrets`, because that file is usually committed and an MCP server's env is where its API keys live |
| `ariadnev mcp list\|show\|add\|remove\|verify [--global] [--json]` | Inspect and edit the MCP servers configured for this project (`.mcp.json`) or for you (`~/.claude.json`); `verify` starts each server and checks it completes the MCP initialize handshake. Writes are atomic, backed up, and preserve every key they do not understand |
| `ariadnev adapters regenerate [--global] [--json]` | Rebuild the adapter artifacts (`install-manifest.json`, skill paths/hashes, hook expectations, ownership) from the receipt. They are a projection for other tools to read — nothing in ariadnev reads them back |
| `ariadnev config prefs resolve [--json]` | Show the settings in effect after both config layers are applied, which files they came from, and every key that was rejected. Notification destinations print as `<redacted>` |
| `ariadnev activity list [--limit n] [--since <cursor>] [--json]` | Recent activity events, newest first. `--since` is a cursor over event IDs, so a poller never replays or skips |
| `ariadnev sessions <list\|show\|tail\|stats\|redact>` | Read the session logs Claude Code and Codex write. Read-only throughout: `redact` reports credential-shaped strings and never rewrites another tool's files, and `list` omits message previews unless `--preview` is passed |
| `ariadnev analytics <status\|enable\|disable\|refresh\|rebuild\|delete>` | Control the private local analytics index. Opt-in, 0600, and nothing is transmitted. The index is a cache over the activity log and session metadata: deleting it is always safe, every command still answers by scanning the sources, and a rebuild returns the same answers |
| `ariadnev data <status\|retention\|ingest>` | Retention posture for the seven derived data classes (default `forever`), a preview-then-apply prune, and one bounded ingest sweep. Prunes derived rows and whole log segments only — never a session file, and never a partial rewrite of an append-only one |
| `ariadnev content-search <enable\|disable\|status\|search\|rebuild\|delete> --project <name>` | Opt-in, per-project full-text search over a project's own files. **The shard is plaintext at rest** — `enable` says so and needs `--yes` before it will build one. Opting one project in never touches another; `.env` files, key material and anything the repo ignores are never indexed; queries are bounded by result count and by time |
| `ariadnev activity tail [--json]` | Stream new events until interrupted. Follows a cursor rather than a file handle, so it does not go quiet at the midnight segment rollover |
| `ariadnev activity stats [--window 7d] [--kit id] [--runtime name] [--json]` | Usage aggregates by coding agent, with a coverage block reporting how many records were read and how many were unreadable |
| `ariadnev query [installs\|doctor\|history]` | Show the local history log (`~/.ariadnev/history.jsonl`) of installs, doctor runs, and updates |
| `ariadnev api <start\|status\|stop> [--bind addr] [--port n] [--auth-token @file] [--foreground] [--json]` | A local, **read-only** HTTP view of the operational data plane. Binds `127.0.0.1:8767`; a non-loopback bind without a token is refused, and a token, once set, is required on every request. Each data route returns byte-for-byte what the matching `av … --json` command prints, so the two cannot drift. **No LLM proxy** — upstream's proxy depends on `login`, which is a non-goal. On a port collision it reports the holder rather than moving to another port, and `stop` proves the process on the recorded port is ariadnev's before signalling it |
| `ariadnev gui [--no-open] [--port n]` | Start the API if it is not up and open its dashboard in a browser. No native window and no download link: the page is served by the daemon this command just started |
| `ariadnev watch <dry-run\|start\|status\|stop> <owner/repo> [--label name] [--max-per-hour n]` | Draft replies to new GitHub issues through a coding agent. **Previews by default and posts nothing**; `start --yes` is what enables posting and records the repository in an allowlist you can revoke by editing. Issue text is attacker-controlled, so it is fenced inside a per-invocation nonce and any fence in the payload is neutralised; the hourly cap is enforced locally *before* an agent is spawned; one watcher per repository. [ADR 0018](docs/decisions/0018-watch-treats-issue-text-as-hostile.md) states plainly which of those defences are structural and which are advisory, and what none of them cover |
| `ariadnev orchestrate <start\|status\|resume\|stop> [run-id] [graph.json]` | Run a graph of external CLI jobs under a supervisor: dependency-ordered, independent jobs in parallel, cyclic graphs refused before anything spawns. State is written after every transition, so `status` and `stop` work from another process and `resume` reconnects after a crash. `stop` signals each job's process **group** (TERM, grace, KILL) so a job's own children go with it. Cross-platform, where upstream is Darwin-only |
| `ariadnev content <publish\|queue\|schedule> [--channel name] [--body text] [--at when]` | Post to **your own** webhooks — a channel is a name and an https URL in your `channels.json`, and ariadnev hosts nothing. Previews unless `--yes`. `schedule` sends what is due and returns, so cron or launchd decides how often; a queued post is marked sent the moment its webhook returns, so a crash mid-batch neither loses nor repeats one |
| `ariadnev feedback --type <bug\|feature\|enhancement> --title <t> [--export path] [--submit]` | A redacted report, printed by default, written with `--export`, or opened as an issue on ariadnev's own repository with `--submit --yes`. Every field is sanitized, including the ones you typed — a pasted body carries whatever was on your terminal |
| `ariadnev changelog [--since-current] [--from v] [--full]` | What shipped in ariadnev's own releases, read through `gh`. Versions compare numerically, so 0.10.0 sorts above 0.9.0 |
| `ariadnev self-update` | An alias for `ariadnev update`: the signed, binary-only replacement of the running executable |
| `ariadnev add-skill <name> [--description "…"]` | Scaffold a new canonical skill |
| `ariadnev migrate [--provider id] [--global] [--dry-run]` | Relocate files when a provider's path convention changes |
| `ariadnev migrate prefs [--global]` | Import a pre-rename config file into ariadnev's own. Refuses to merge when both exist — picking a winner per key would silently change settings you set — and never writes back to the legacy file |
| `ariadnev migrate rollback [--to <timestamp>]` | Put back what the last `migrate` moved and forget it ran. Restores through the same path `backups restore` uses, so it takes a pre-restore safety copy, verifies digests, and inherits the guard that refuses to write outside ariadnev's install surface |

### Exit codes

Commands added after the CLI's first release use one table: **0** did what was
asked, **1** ran and the answer is negative (drift found, verify failed), **2**
could not run as invoked (unknown subcommand, bad flag), **3** could not run
because the environment is not ready.

`doctor` is a deliberate exception and keeps its original mapping — `0` healthy,
`1` degraded, `2` unhealthy. CI jobs gate on it, and adopting the table above
would turn "this install is broken" into "you passed a bad flag" on the exit code
alone. `audit`, `validate`, `eval`, `skill`, and `workflow` likewise keep the codes
they shipped with.

### Graph execution

The first public execution surface is local and read-only. Validate without a
provider, probe with global `--dry-run`, or run explicitly on Codex/Claude Code:

```bash
av workflow run read-only-delivery --validate --json
av --dry-run workflow run read-only-delivery --runtime claude-code --json
av workflow run read-only-delivery --runtime claude-code --instruction "Find routing ownership and cite evidence" --json
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

Run `ariadnev validate` for the current counts — it prints skills, agents, and
hooks from the kit itself, which is the only number that cannot go stale in a
README.

Most of the corpus is **ported**: copied from the kit this project was built
from, rebranded, and otherwise left alone. A ported skill carries
`metadata.origin: ported`. That distinction is not decoration — the authoring
rules below apply to what this project writes, and cannot apply to content a
port exists to preserve without rewriting it. Agents are the exception: all
sixteen have been brought to the authoring bar, so the lint holds every one of
them to it regardless of origin.

Skills this project authors meet one cook-grade bar: a real workflow, an
`## Output format` contract, `## Quality gates` self-checks, and a
`## Workflow position` so they read as one graph. Ported skills are still checked
for everything that makes a skill *valid* — frontmatter shape, a description that
says something, no unknown fields — and their size is reported as a warning
rather than ignored. `ariadnev validate` enforces both, and every cross-skill
`av:<slug>` reference, rather than leaving it to convention. See
[`docs/av-skill-authoring-spec.md`](docs/av-skill-authoring-spec.md) for the
machine-enforced authoring contract.

Every skill meets the authoring bar (see ADR 0013).
`kit/av-invocation-allowlist.json` holds
individual phantom-command citations waiting on a content decision the linter
cannot make. The two shrink for unrelated reasons — a skill can sit at the
authoring bar and still name a subcommand this CLI never registered — and
every entry in the invocation list carries a reason naming the outstanding
decision. `--strict` refuses that list beyond its committed ceiling.

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
| artifact | claude-code | codex | cursor | antigravity | opencode | omp | grok | dsh | generic |
|---|---|---|---|---|---|---|---|---|---|
| skill | `.claude/skills/` | `~/.agents/skills/` | `.agents/skills/` | `~/.gemini/config/skills/` | `.opencode/skills/` | `.agents/skills/` | `.grok/skills/` | skip | `.agents/skills/` |
| agent | `.claude/agents/*.md` | `~/.codex/agents/*.toml` | `.agents/skills/av-*/AGENT.md` | `~/.gemini/config/agents/*.md` | `.opencode/agents/*.md` | `.agents/skills/av-*/AGENT.md` | `.grok/agents/*.md` | skip | skip |
| command | `.claude/commands/*.md` | skip | skip | skip | `.opencode/commands/*.md` | skip | skip | skip | skip |
| rules | `.claude/rules/*.md` | `AGENTS.md` | skip | `AGENTS.md` | skip | `AGENTS.md` | `.grok/rules/*.md` | skip | `AGENTS.md` |
| scripts | `.claude/scripts/` | `~/.agents/ariadnev/scripts/` | `.agents/scripts/` | `~/.gemini/config/scripts/` | `.opencode/scripts/` | `.agents/scripts/` | `.grok/scripts/` | skip | `.agents/scripts/` |
| env | `.claude/.env.example` | `~/.agents/ariadnev/.env.example` | `.agents/.env.example` | `~/.gemini/config/.env.example` | `.opencode/.env.example` | `.agents/.env.example` | `.grok/.env.example` | skip | `.agents/.env.example` |
| hook | `.claude/hooks/av/*.cjs` | skip | skip | skip | skip | skip | skip | skip | skip |
| outputStyle | skip | skip | skip | skip | skip | skip | skip | skip | skip |
| statusline | `.claude/hooks/av/av-statusline.cjs` | skip | skip | skip | skip | skip | skip | skip | skip |
<!-- END provider-matrix (generated) -->

Cells marked `skip` are unverified target paths — ariadnev never guesses; it
skips and logs them in the install summary. See `src/providers/spec-verified.ts`.

**Nine providers are listed; eight are installable.** `dsh` is every-cell
`skip`: it has no binary, no config home, and no adapter to read a layout from,
so there is nothing to verify and nothing to write. It stays in the table
because "this tool knows dsh and refuses to install it" is a different answer
from "never heard of it", and only the first one explains an empty install.

Two cells are worth reading the notes for. `omp` installs to `.agents/skills`
rather than `~/.omp/agent/skills`: the latter is where the upstream CLI writes,
but omp's own documentation calls `~/.omp/agent` its session-storage directory
and names `.agent[s]/skills` canonical. And `grok`'s hooks `skip` even though
`~/.grok/hooks` exists, because every hook currently resolves to
`.claude/hooks/av/` — verifying that cell would install grok's hooks into
claude-code's tree.

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

## Configuration

Settings live in `~/.ariadnev/config.json` (yours) and `<project>/.ariadnev/config.json`
(the repo's). The two layers do **not** have equal rights: a project file may set
workspace-shaped keys (`paths.*`, `plan.*`, `locale.*`, `docs.maxLoc`, `project.*`,
`statusline.*`), and everything else is **user-only** — `privacyBlock`, `trust.enabled`,
`assertions`, `scripts.executionPolicy`, and notification destinations. A project
file that sets a user-only key has that key dropped and named in a warning, so a
repository you cloned cannot turn off your privacy blocking or point your
notifications somewhere else. Notification destinations must be https URLs on an
allowlisted host (`discord.com`, `slack.com`, `api.telegram.org`).

Point your editor at [`schemas/av-config.schema.json`](schemas/av-config.schema.json)
for completion; it is generated from the TypeScript definition, so it cannot drift.
Run `ariadnev config prefs resolve` to see what took effect and what was rejected.

## Security

The installer verifies each binary's sha256 before installing, and the CLI
redacts credential-shaped strings from all output. To report a vulnerability,
see [`SECURITY.md`](SECURITY.md) (please report privately).

## Contributing

**[`CONTRIBUTING.md`](CONTRIBUTING.md)** has the full setup, the test tiers, the
branch model, and the list of gates CI runs — including the one thing that
catches people out: branch protection is unavailable on this plan, so CI is
advisory and nothing stops a red merge but you.

- `pnpm install` → `pnpm test` (vitest, TDD).
- Adapt engine is pure functions under `packages/cli/src/adapt/` (≥95% coverage).
- Path constants are single-sourced in `src/adapt/paths.ts` — change once.

Hooks (`kit/hooks/`) are a Claude Code event contract: installing to
claude-code copies hook files and — after a y/n confirmation — merges event
bindings into `.claude/settings.json` (idempotent, backed up). Declining or
running non-interactively prints a copy-pasteable snippet instead. Other
providers skip-and-log. 14 hooks bind 19 times across 8 events; order within an
event is declared in each `hook.json` rather than inherited from directory
order — see [`kit/hooks/README.md`](kit/hooks/README.md). Agents (`kit/agents/av-*.md`) follow the same
frontmatter contract as skills, enforced by `packages/cli/src/kit/agent-lint.ts`
(name==file-stem, description with `<example>`/`<commentary>`, ≤120 lines,
required `Behavioral Checklist` heading) — see `docs/av-skill-authoring-spec.md`.
skillsmp.com publishing is deferred.
