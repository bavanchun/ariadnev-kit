# av command classification

Every registered `av` command with its safety class and one-line purpose,
grouped by task family. Read this when `../SKILL.md` does not name the command
you are about to run, or when you need the class of a verb before choosing
`--dry-run`, `--yes`, or a snapshot.

**Stamp:** checked against `av --help` and every subcommand's `--help` from
ariadnev **1.3.0** on 2026-08-30. There is no generator for this file; when a
command is added, removed, or changes class, re-run the `--help` pages for its
group and edit the row by hand. If `av versions` reports a newer CLI than the
stamp, treat this table as a hint and re-check `av <cmd> --help` before any
mutating call.

## Legend

| Class | Meaning |
|---|---|
| `read-only` | Never mutates disk, config, or remote state |
| `mutating` | Installs, updates, removes, or writes durable state; `--json` does not change that |
| `diagnostic` | Long-running or interactive (daemon, stream, board, benchmark); user judgement is the main side effect |

Global options on every command: `--home <dir>`, `--cwd <dir>`, `--dry-run`
(plan only, write nothing), `--yes` (skip prompts; the apply switch for
commands that preview by default). Every leaf command below also takes
`--json`.

## Project lifecycle

| Command | Class | Purpose | Scope / gate |
|---|---|---|---|
| `av init [dir]` | mutating | Set up a project directory and register it | `--provider <list>`, `--project-id <name>`, `--force` overwrites files edited since a previous run |
| `av new <name>` | mutating | Create a project directory and initialize it | `--provider <list>` |
| `av setup` | mutating | Configure `av` itself; writes no credentials | `--step <list>`, `--config <file>`, `--no-interactive` applies `--config` without prompting — user approval first |
| `av projects list` | read-only | List registered projects | |
| `av projects show <nameOrPath>` | read-only | Show one registered project | |
| `av projects add <dir>` | mutating | Register an existing directory without installing into it | `--name <name>` |
| `av projects remove <nameOrPath>` | mutating | Deregister a project; deletes nothing on disk | |
| `av projects prune` | mutating | Drop registry entries whose directory is gone; deletes nothing on disk | `--all` needs `--force` |
| `av install` | mutating | Install the kit to one or more providers | `--provider <list>`, `--global`, `--force` overwrites files edited since the last install |
| `av uninstall` | mutating | Remove a previously installed kit; previews by default | `--yes` applies; `--provider <list>`, `--global`, `--force` also deletes edited files (never files `av` did not install) |
| `av update` | mutating | Self-update to the latest release; alias `self-update` | `--check` makes it read-only; `--to <version>` pins an exact `x.y.z`; `--global` |
| `av update --check` | read-only | Only report whether an update exists | |
| `av migrate` | mutating | Relocate installed files when provider path conventions change | `--provider <id>`, `--global` |
| `av migrate prefs` | mutating | Import a pre-rename config file into ariadnev's own | `--global` |
| `av migrate rollback` | mutating | Put back what the last `av migrate` moved, and forget it ran | `--to <timestamp>`, `--global` |
| `av unlock` | mutating | Clear a leaked lifecycle lock; only when no `av` command is running | `--global` |

## Health, backups, recovery

| Command | Class | Purpose | Scope / gate |
|---|---|---|---|
| `av doctor` | read-only | Health-check the installed kit against its receipt | `--global` |
| `av doctor --fix` | mutating | Re-merge hook bindings that drifted out of settings.json; backs up first | `--global` |
| `av audit` | read-only | Compare installed files against the receipt (`kit`, the default target) | `--global`, `--strict` counts untracked files as failures |
| `av audit scripts` | read-only | Scan the scripts the kit ships | `--strict` counts flagged scripts as failures |
| `av backups create` | mutating | Take a backup of the current scope | `--global` |
| `av backups list` | read-only | List backups | `--global` |
| `av backups show <ts>` | read-only | Show one backup | |
| `av backups verify <ts>` | read-only | Verify a backup; `--rebuild` also proves the derived state it omits can be regenerated | |
| `av backups restore <ts>` | mutating | Restore a backup | `--file <rel>` restores one file; `--latest` picks the newest instead of a named one |
| `av backups prune` | mutating | Remove old backups | `--older-than <days>`, `--keep-last <n>` |
| `av recover [timestamp]` | mutating | Replay a snapshot back to its original paths; previews unless `--yes` | `--file <rel>`, `--allow-root <dir>` (repeatable), `--global` |
| `av diagnostics export` | read-only | Write a redacted diagnostics bundle safe to paste into an issue | `--offline` accepted for compatibility |
| `av versions` | read-only | Show local versions for the CLI, the kit, and installed skills | |
| `av changelog` | read-only | What shipped in ariadnev's own releases | `--from <version>`, `--since-current`, `--full`, `--limit <n>` |
| `av feedback` | read-only | Write a redacted bug or feature report | `--export <path>`, `--attach-diagnostics` |
| `av feedback --submit` | mutating | Open the report as an issue on ariadnev's repository | needs `--yes` |

## Kit source and inventory

| Command | Class | Purpose | Scope / gate |
|---|---|---|---|
| `av validate` | read-only | Lint the kit source without installing | `--check` also gates the README provider matrix; `--strict` counts orphan and dangling reference warnings as failures |
| `av contract` | read-only | Print the provider×artifact capability contract | `--json` for machines |
| `av eval` | diagnostic | Score kit quality — tier-1 static; `--suite` runs tier-2 behavioral scenarios and always emits JSON | `--skill <name>`, runner and repeat flags per `--help` |
| `av list` | read-only | Show kit contents and per-provider install state | `--global` |
| `av query [view]` | read-only | Show recorded history: `installs`, `doctor`, `history` (default) | |
| `av telemetry [status]` | read-only | Anonymous telemetry status; off unless configured | opt out with `ARIADNEV_TELEMETRY_DISABLED=1` |
| `av add-skill <name>` | mutating | Scaffold a new canonical skill in the kit | `--description <text>` |
| `av kit install-path <provider>` | read-only | Show where each artifact kind would be written for a provider | `--global` |
| `av kit refresh` | mutating | Discard the extracted kit cache and extract it again | |
| `av adapters regenerate` | mutating | Rebuild adapter artifacts from the receipt (deterministic — a repair, not a reconcile) | `--global` |

## Catalog by artifact

`skills`, `agents` and `commands` share one shape; the `skills` group also has
`graph`. For a single skill's Python runtime env see the `skill` group below.

| Command | Class | Purpose | Scope / gate |
|---|---|---|---|
| `av skills list` | read-only | List skills in the kit and where they are installed | `--global`, `--installed` |
| `av skills show <name>` | read-only | Show one skill's details | `--global` |
| `av skills search <query>` | read-only | Search by name, description, category or keyword | `--global` |
| `av skills graph [name]` | read-only | Show skill workflow graph relationships | `--global` |
| `av skills install <name>` | mutating | Install one skill for one provider | `--provider <id>` (default `claude-code`), `--global` |
| `av skills remove <name>` | mutating | Remove one installed skill for one provider | `--provider <id>`, `--global` |
| `av agents list` | read-only | Same shape as `skills list` | `--global`, `--installed` |
| `av agents show <name>` | read-only | Same shape as `skills show` | `--global` |
| `av agents search <query>` | read-only | Same shape as `skills search` | `--global` |
| `av agents install <name>` | mutating | Same shape as `skills install` | `--provider <id>`, `--global` |
| `av agents remove <name>` | mutating | Same shape as `skills remove` | `--provider <id>`, `--global` |
| `av commands list` | read-only | Same shape as `skills list` | `--global`, `--installed` |
| `av commands show <name>` | read-only | Same shape as `skills show` | `--global` |
| `av commands search <query>` | read-only | Same shape as `skills search` | `--global` |
| `av commands install <name>` | mutating | Same shape as `skills install` | `--provider <id>`, `--global` |
| `av commands remove <name>` | mutating | Same shape as `skills remove` | `--provider <id>`, `--global` |

## Per-skill Python environment

`av skill <action> [name] [args...]` — the verb is a positional argument, not a
subcommand. Omit `name` for `verify` and `upgrade` to cover every skill.

| Command | Class | Purpose | Scope / gate |
|---|---|---|---|
| `av skill verify [name]` | read-only | Report the env's health | `--deep` also verifies RECORD files and imports packages in a child process |
| `av skill install <name>` | mutating | Install or refresh the env | |
| `av skill repair <name>` | mutating | Rebuild a corrupted env | |
| `av skill upgrade [name]` | mutating | Re-resolve the env after its dependencies changed | |
| `av skill remove <name>` | mutating | Remove the env record | |
| `av skill run <name> -- <script> [args...]` | mutating | Run a skill script inside its env; side effects are the script's | |

## Plans and journal

`--plan <name>` on a plan verb acts on that plan instead of the branch's.

| Command | Class | Purpose | Scope / gate |
|---|---|---|---|
| `av plan show` | read-only | Show the plan this branch points at, with its phases | |
| `av plan list` | read-only | List plan directories with status and phase progress | |
| `av plan resolve` | read-only | Print the directory of the plan this branch points at | |
| `av plan phase <phase>` | read-only | Print one phase file in full | `--plan <name>` |
| `av plan parse` | read-only | Print a plan as structured data with checkbox progress per phase | `--plan <name>` |
| `av plan validate` | read-only | Check one plan's directory format; exits 1 when invalid | `--plan <name>` |
| `av plan search <query>` | read-only | Search every plan's files | |
| `av plan status` | read-only | Show the plan's own status | `--plan <name>` |
| `av plan reindex` | read-only | Re-read every plan and report what is malformed; there is no index to rebuild | |
| `av plan cleanup` | read-only | List finished plans still in the plans root | `--archive` makes it mutating (moves them) |
| `av plan kanban [name]` | diagnostic | Show plan phases as a board, grouped by status | |
| `av plan create <title>` | mutating | Bootstrap a new plan directory from the template; the content inside is written per `av:plan` | `--description <text>`, `--priority <p>`, `--use` also points the branch at it |
| `av plan add-phase <title>` | mutating | Append a phase file to a plan and a row in its table | `--plan <name>`, `--depends <list>` |
| `av plan use <name>` | mutating | Point this branch at a plan directory | |
| `av plan update <phase> <status>` | mutating | Set a phase's status in the phase file and the index table | `pending`, `in-progress`, `completed`, `cancelled` |
| `av plan check <phase>` | mutating | Mark a phase completed | `--plan <name>` |
| `av plan uncheck <phase>` | mutating | Put a phase back to pending | `--plan <name>` |
| `av plan status <status>` | mutating | Set the plan's own status | `--plan <name>` |
| `av plan close` | mutating | Mark the plan completed | `--plan <name>` |
| `av plan archive` | mutating | Move a finished plan under the archive dir | `--force` archives an unfinished plan |
| `av plan migrate <from>` | mutating | Move plan directories from elsewhere in the repo into the plans root | |
| `av journal list` | read-only | List entries, newest first | `--limit <count>` |
| `av journal show <term>` | read-only | Print one entry by file name or a fragment of it | |
| `av journal validate` | read-only | Check every entry has a title, date, status, and body | |
| `av journal create <title>` | mutating | Write a dated entry | `--component <name>`, `--status <status>`, `--body <text>` |

## MCP servers and configuration

| Command | Class | Purpose | Scope / gate |
|---|---|---|---|
| `av mcp list` | read-only | List configured servers across both scopes | |
| `av mcp show <name>` | read-only | Show one server's definition (env variable names only, never values) | |
| `av mcp verify [name]` | read-only | Start each server and check it completes the MCP initialize handshake | |
| `av mcp add <name> <command> [args...]` | mutating | Add a stdio server to this project | `--global` writes your own config instead |
| `av mcp remove <name>` | mutating | Remove a server from this project | `--global` |
| `av mcp link <name>` | mutating | Mirror a server between project and user scopes (a copy, never a move) | `--to-project`, `--allow-secrets` permits env values in the repository config |
| `av config prefs resolve` | read-only | Show the settings in effect after both config layers are applied | `resolve` is the only action |

## Local data plane

| Command | Class | Purpose | Scope / gate |
|---|---|---|---|
| `av activity list` | read-only | List recent local activity events, newest first | `--limit <n>`, `--since <cursor>` |
| `av activity stats` | read-only | Summarize local skill usage by coding agent | `--window <span>`, `--kit <id>`, `--runtime <name>` |
| `av activity tail` | diagnostic | Stream new activity events until interrupted | |
| `av sessions list` | read-only | List sessions for registered projects, newest first | `--project <name>`, `--runtime <id>`, `--limit <n>`, `--preview` |
| `av sessions show <project> <sessionId>` | read-only | Show paginated session messages | `--cursor <n>`, `--limit <n>` |
| `av sessions stats` | read-only | Aggregate local session metrics | `--project <name>`, `--metric <name>`, `--by <dimension>` |
| `av sessions redact` | read-only | Report credential-shaped strings in session files; never rewrites them | `--project <name>`, `--session <id>`, `--redact-emails` |
| `av sessions tail <project> <sessionId>` | diagnostic | Stream messages appended after tail starts | |
| `av analytics status` | read-only | Report whether the index is enabled, present and usable | |
| `av analytics enable` | mutating | Enable the local analytics index | nothing is transmitted |
| `av analytics disable` | mutating | Stop serving from the index without deleting it | |
| `av analytics refresh` | mutating | Bring the index up to date with the sources | |
| `av analytics rebuild` | mutating | Discard the index and read every source again | |
| `av analytics delete` | mutating | Delete the index; the enable/disable setting is kept | |
| `av data status` | read-only | Show the default retention posture for each derived class | |
| `av data retention` | read-only | Resolve and preview retention for one derived class | `--class <name>`, `--days <n>` |
| `av data retention --apply` | mutating | Delete what the preview names; derived data only | |
| `av data ingest` | mutating | Run one bounded ingest sweep over the local sources | |
| `av content-search status` | read-only | Show whether one project is opted in, and its shard's health | `--project <name>` required, never inferred |
| `av content-search search` | read-only | Run a bounded query against one opted-in project | `--project`, `--query <text>`, `--limit <n>`, `--timeout <ms>` |
| `av content-search enable` | mutating | Opt one project into local plaintext content search | `--project` required |
| `av content-search disable` | mutating | Stop indexing and searching without deleting the shard | `--project` required |
| `av content-search rebuild` | mutating | Delete and rebuild one project's shard from its files | `--project` required |
| `av content-search delete` | mutating | Remove one project's shard files; previews unless `--yes` | `--project` required |

## Daemons, watchers, dispatch

| Command | Class | Purpose | Scope / gate |
|---|---|---|---|
| `av api start` | diagnostic | Start the local read-only API daemon (no LLM proxy) | `--bind`, `--port`, `--auth-token` (prefer `ARIADNEV_API_TOKEN`), `--foreground` |
| `av api status` | read-only | Show the running state of the api daemon | `--auth-token` when the daemon requires one |
| `av api stop` | mutating | Stop the running api daemon | |
| `av gui` | diagnostic | Start the local API and open its dashboard in a browser | `--no-open` prints the URL instead |
| `av watch dry-run <repo>` | read-only | Preview what `av watch start` would post, posting nothing | `--label`, `--max-per-hour`, `--skill`, `--target`, `--limit` |
| `av watch status [repo]` | read-only | Show which repositories are allowlisted and what has been answered | |
| `av watch start <repo>` | mutating | Draft replies to new issues; posts only with `--yes`, which also allowlists the repository | `--daemon` keeps watching (diagnostic), `--foreground` |
| `av watch stop <repo>` | mutating | Stop a running watcher for the repository | |
| `av orchestrate status [run-id]` | read-only | Report a run's lifecycle state, or list every run | |
| `av orchestrate start <graph>` | mutating | Launch a new orchestrated run from a job graph file | |
| `av orchestrate resume <run-id> [graph]` | mutating | Reconnect to an existing run after a client or supervisor crash | |
| `av orchestrate stop <run-id>` | mutating | Terminate a run's live jobs (TERM, grace period, then KILL) | |
| `av content queue list` | read-only | Show queued posts | |
| `av content queue add` | mutating | Queue a post for later | `--channel <name>`, `--body <text>`, `--at <when>` |
| `av content queue remove <id>` | mutating | Drop a queued post | |
| `av content publish` | mutating | Publish a post to a channel; previews unless `--yes` | `--channel <name>`, `--body <text>` |
| `av content schedule` | mutating | Send every queued post that is due; previews unless `--yes` | one sweep, not a daemon |
| `av workflow run --validate <workflow>` | read-only | Compile and lint a workflow without probing or executing | |
| `av workflow run <workflow>` | mutating | Execute a versioned graph workflow | `--run-id`, `--initial-state <json>`, `--runtime`, `--runtime-version`, `--model`, `--instruction` |
| `av workflow status <run-id>` | read-only | Read durable status without invoking a provider | |
| `av workflow resume <run-id>` | mutating | Resume a durable run with the original graph and runtime identity | |
| `av workflow cancel <run-id>` | mutating | Request cooperative cancellation for an active run | |
| `av run <kit>/<skill> [args...]` | mutating | Dispatch a skill through an adapter (an agent run can write) | `--target <provider>`, `--timeout <duration>`, `--kits-dir <dir>` |
| `av run <workflow>` | mutating | Deprecated spelling of `av workflow run`; stops working in 1.4.0 | prefer `av workflow run` |
| `av run resume <run-id>` | mutating | Moved to `av workflow resume` | |
| `av run status <run-id>` | read-only | Moved to `av workflow status` | |
| `av run cancel <run-id>` | mutating | Moved to `av workflow cancel` | |

## Not in this binary

Verbs an agent may remember from another kit's CLI and must not run here.
None of these is registered; `av <name> --help` fails.

| Remembered verb | Here |
|---|---|
| login, logout, whoami, licenses | Nothing to log in to; the kit ships whole |
| dashboard start/status/stop under `config` | `av gui` opens the dashboard; `av api start`, `av api status`, `av api stop` run the daemon |
| kit repair-install-mode | `av doctor --fix` re-merges drifted hook bindings; files are installed directly, not as plugins |
| kit init / kit install / kit uninstall / kit validate / kit list-kits | `av init`, `av install`, `av uninstall`, `av validate`, `av list` — one embedded kit, so the verbs are top-level |
| config prefs set / unset / validate | Only `av config prefs resolve` exists; edit the config file directly |
| content schedule daemon, content queue cancel / run-pending | `av content schedule` is one due-sweep; `av content queue remove <id>` drops a post |
| plan phase close / plan phase update | `av plan phase <phase>` prints; `av plan update <phase> <status>` and `av plan check <phase>` set |
| codex agent-runtime serve / register | No in-session Codex spawn server; installed agents are files under `~/.codex/agents/` |
| verbose, quiet, fresh, no-interactive (global) | Not registered; `--no-interactive` exists only on `av setup` |
