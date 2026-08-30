---
name: av:av
description: Operate the av control-plane CLI itself. Use when the next action is running an av subcommand or interpreting its output, deciding read-only vs mutating, or picking install scope.
user-invocable: true
when_to_use: "Invoke when the next concrete action is running an av subcommand, choosing between inspection and mutation, disambiguating project vs global scope, or reading --json output. Not for skill authoring, task routing, or plan/journal content."
category: cli
keywords: [av, cli, lifecycle, install, doctor, validate, audit, backups, recover, update, scope, json]
argument-hint: "[goal or subcommand]"
metadata:
  author: vchun
  version: "1.1.0"
---

# av — operate the CLI

Teach an agent to run the `av` control-plane CLI without breaking user-owned
state. This skill owns the **operating model**: which subcommand answers which
intent, the read-only/mutating/diagnostic split, scope and preview gates, and
how to read `--json`. It does not own the flag reference — `av <cmd> --help` is
always authoritative. The per-command class table in
[references/command-classification.md](references/command-classification.md)
is a starting index that can lag the installed binary; read it when triaging
a command this file does not name.

## Boundaries

| Intent | Route to |
|---|---|
| Author or refine a skill (content, scripts, references) | `av:skill-creator` |
| Decide which installed skill or agent fits a task | `av:ariadnev` (task router) |
| Explain what `av` can do, or list installed skills, without running anything | `av:help` |
| Write or execute an implementation plan | `av:plan`, `av:cook`, `av:plan-i18n` |
| Write a technical journal entry | `av:journal` (`av journal create` is the CLI surface it calls) |
| Run a graph of headless CLI jobs | `av:orchestrate` (`av orchestrate` is its CLI surface) |
| Run *the `av` binary itself* | this skill |

`av:ariadnev` decides *which skill runs*; `av:av` runs *the binary*.

## Safe operating protocol

Follow the steps in order. Do not skip the inspect step because a command name
looks familiar — the installed binary may be older or newer than this skill.

1. **Triage the goal.** Every command falls into one class:
   - `read-only` — inspects; never writes disk, config, or remote state. The
     inspection verbs of every group (`list`, `show`, `search`, `status` with
     no argument, `verify`, `resolve`, `parse`, `validate`, `phase`, `graph`,
     `stats`, `dry-run`), plus `list`, `query`, `versions`, `changelog`,
     `validate`, `contract`, `audit` (`--strict` only changes which findings
     fail; it never writes), `doctor` without `--fix`, `update --check`,
     `backups list|show|verify`, `plan reindex` (reports; nothing to rebuild),
     `data retention` without `--apply`, `sessions redact` (reports; never
     rewrites), `diagnostics export`, `feedback` without `--submit`,
     `workflow run --validate`, `kit install-path`, `config prefs resolve`,
     `telemetry`.
   - `mutating` — writes durable state: `install`, `uninstall`, `init`, `new`,
     `setup`, `update` without `--check`, `migrate`, `doctor --fix`,
     `recover`, `backups create|restore|prune`, `unlock`, `add-skill`, the
     `plan` verbs that set state (`create`, `add-phase`, `use`, `update`,
     `check`, `uncheck`, `status <status>`, `close`, `archive`, `cleanup
     --archive`, `migrate`), `journal create`, `mcp add|remove|link`, every
     `install`, `remove`, `enable`, `disable`, `delete`, `refresh`, `rebuild`,
     `add`, `prune`, `stop`, `start`, `resume`, `cancel` verb, `skill
     install|repair|upgrade|remove|run`, `kit refresh`, `adapters regenerate`,
     `data retention --apply`, `data ingest`, `content publish|schedule`,
     `feedback --submit`, `workflow run`, and `run` (dispatches an agent).
   - `diagnostic` — long-running or interactive; user judgement is the main
     side effect: `api start`, `gui`, `watch start --daemon`, `activity tail`,
     `sessions tail`, `plan kanban`, `eval`.
2. **Inspect before acting.** Run `av <cmd> --help` — and the nested
   `av <cmd> <subcmd> --help` for grouped commands — before using a command
   for the first time in a session. For scripted read-only work pass `--json`
   so the output is a versioned envelope you parse instead of scrape (see
   `--json` envelopes below).
3. **Confirm scope.** Three axes, each stated before a mutation runs:
   - *Project vs global.* `install`, `uninstall`, `doctor`, `list`, `audit`,
     `migrate`, `backups`, `recover`, `unlock`, `adapters regenerate`, `kit
     install-path`, the `skills`, `agents` and `commands` groups, and `mcp
     add|remove` default to the project (`./`); `--global` switches to `~/`.
     `mcp link` copies a server between the two scopes (`--to-project` picks
     the direction; env values stay out of the repository unless
     `--allow-secrets`).
   - *Provider.* `--provider <list>` on `install`, `uninstall`, `init`, `new`;
     `--provider <id>` on `migrate` and on per-artifact `install|remove`
     (default `claude-code`). An unverified provider×artifact cell is skipped
     and logged, never guessed — `av contract` is the truth for what each
     provider receives.
   - *Roots.* Top-level `--home <dir>` and `--cwd <dir>` override where `av`
     reads and writes. Point both at a scratch location for any smoke test of
     install, refresh, migration, uninstall, or recovery so real state is
     never touched.
4. **Preview first; `--yes` is the human gate.** Several mutations preview by
   default and apply only with the top-level `--yes`: `uninstall`, `recover`,
   `content-search delete`, `content publish`, `content schedule`, `watch
   start` (which also allowlists the repository), `feedback --submit`.
   Top-level `--dry-run` plans any mutation without writing. Never pass
   `--yes` (or `setup --no-interactive`) to a mutating command without
   explicit user approval in this conversation — it removes the only prompt
   between the agent and the disk. Use `--dry-run` on any command you have
   not run in this project before.
5. **Inspect before lifecycle mutation.** Run the read-only counterpart first
   and preview conflicts instead of guessing:

   | Before | Run first |
   |---|---|
   | `update` | `update --check`, `versions`, `changelog --since-current` |
   | `install --force`, `migrate`, `uninstall` | `doctor`, `audit` |
   | `recover`, `backups restore <ts>` | `backups list`, `backups verify <ts>` |
   | `kit refresh`, `adapters regenerate` | `audit`, `kit install-path <provider>` |
   | `plan update`, `plan check`, `plan close`, `plan archive` | `plan show`, `plan validate` |
   | `mcp add`, `mcp remove`, `mcp link` | `mcp list`, `mcp show <name>`, `mcp verify` |
   | `watch start` | `watch dry-run <repo>`, `watch status` |
   | `content publish`, `content schedule` | `content queue list` |
   | `data retention --apply` | `data retention` (preview), `data status` |
   | `analytics delete`, `analytics rebuild`, `content-search delete`, `content-search rebuild` | that group's `status` |

6. **Snapshot before you mutate.** Before `recover`, `backups restore`,
   `uninstall`, `migrate`, or `doctor --fix`, run `av backups create` (or
   confirm a current one with `av backups list`) so the change is reversible.
   `av migrate rollback` and `av backups restore --latest` are the undo paths.
7. **Preserve files you did not install.** `av` mutates only paths it owns.
   `--force` on `install` and `init` overwrites files edited since the last
   run, and on `uninstall` also deletes them — never files `av` did not
   install. There is no wipe-everything flag; do not propose a destructive
   reset unless the user asked for one. Surface a conflict; never silently
   overwrite.
8. **Never invent a flag or subcommand.** If it is not in `av <cmd> --help`,
   it is not shipped. Do not carry a name over from another agent-kit CLI:
   this binary has no login, logout, whoami or licenses verbs (nothing to
   log in to), no dashboard verbs under `config` (the dashboard is `av gui`,
   the daemon `av api start|status|stop`), no kit repair verb (`av doctor
   --fix` covers hook drift), and no verbose, quiet, or fresh flags.
9. **Report the exact command, scope, and result.** Name what changed on
   disk (or would change, under `--dry-run`), the scope it targeted, and any
   provider or artifact that was skipped and why.

## Command index by task

Intent → command. Flags live behind `--help`; the reference carries every
command's class and one-line purpose.

- **Bootstrap** — `av init [dir]` sets up and registers a project, `av new
  <name>` creates one, `av setup` configures `av` itself (writes no
  credentials), `av projects list|show|add|remove|prune` is the registry.
- **Install / remove / repair** — `av install [--provider <list>] [--global]`,
  `av uninstall`, `av doctor [--fix]`, `av migrate [prefs|rollback]`,
  `av unlock` (clear a leaked lifecycle lock; only when nothing is running).
- **Update** — `av update [--check]` (alias `self-update`) for the latest
  release; `av update --to <x.y.z>` pins an exact version (downgrade or
  cross-grade). `--to` takes only an exact `x.y.z`, never a range; the release
  is checksum-verified before install. A downgrade can leave installed
  artifacts ahead of the binary's schema — re-run `av install` afterward if
  `av doctor` reports drift.
- **Backups and recovery** — `av backups create|list|show <ts>|verify
  <ts>|restore <ts>|prune`; `av recover [timestamp]` replays a snapshot to
  its original paths (`--allow-root <dir>` authorizes writes outside the
  project root).
- **Inspect the kit source** — `av validate [--check] [--strict]`,
  `av contract`, `av audit [kit|scripts] [--strict]`, `av eval [--skill
  <name>] [--suite]` (tier-1 static always; `--suite` adds tier-2 scenarios).
- **See what is installed** — `av list`, `av versions`, `av query
  [installs|doctor|history]`, `av skills list [--installed]` (same shape
  under `agents` and `commands`), `av skills graph [name]`.
- **Catalog by artifact** — `av skills show|search|install|remove <name>`
  (same verbs under `agents` and `commands`) act on one artifact for one
  provider.
- **Author a skill** — `av add-skill <name>` scaffolds frontmatter only;
  content is `av:skill-creator`'s job.
- **Plans** — `av plan create <title>` and `av plan add-phase <title>`
  scaffold the directory and phase files; everything inside them is written
  per `av:plan`. Tracking: `av plan use|show|list|resolve|update|check|
  uncheck|status|close|phase|kanban|parse|validate|search|reindex|archive|
  cleanup|migrate` (`--plan <name>` targets a plan other than the branch's).
- **Journal** — `av journal create|list|show|validate`.
- **MCP servers** — `av mcp list|show|add|remove|link|verify`; `add`,
  `remove` and `link` default to project scope.
- **Kit source and adapters** — `av kit install-path <provider>`,
  `av kit refresh`, `av adapters regenerate` (deterministic rebuild from the
  install receipt).
- **Per-skill Python environments** — `av skill install|verify|repair|
  upgrade|remove|run <name> [--deep]`; `av skill run <name> -- <script>` runs
  a skill script inside that environment.
- **Local data plane** — `av activity list|tail|stats`, `av sessions
  list|show|tail|stats|redact` (read-only; `redact` reports, never rewrites),
  `av analytics status|enable|disable|delete|refresh|rebuild`, `av data
  status|retention|ingest`, `av content-search status|search|enable|disable|
  rebuild|delete` (plaintext shard, opt-in per project, never inferred).
- **Daemons and dashboards** — `av api start|status|stop` (read-only local
  API; loopback unless `--auth-token`), `av gui [--no-open]`, `av watch
  dry-run|start|status|stop <repo>`, `av orchestrate start|status|resume|
  stop`, `av content publish|queue list|queue add|queue remove|schedule`.
- **Support** — `av diagnostics export` (redacted bundle), `av feedback
  [--submit]`, `av changelog [--since-current] [--full]`, `av telemetry`
  (off unless configured; `ARIADNEV_TELEMETRY_DISABLED=1` opts out).
- **Graph workflows and dispatch** — `av workflow run [--validate]
  <workflow>`, `av workflow resume|status|cancel <run-id>`. `av run
  <kit>/<skill>` dispatches a skill through an adapter (`--target`,
  `--timeout`); `run` takes a skill reference only, never a workflow ID.

## `--json` envelopes

Every leaf command takes `--json`; a group parent (`av plan`, `av mcp`, …)
runs nothing on its own. Two shapes exist:

| Shape | Commands |
|---|---|
| `{ "schema_version": <n>, "kind": "<group>.<verb>", "data": { … } }` — the versioned envelope; `kind` is dot-namespaced (`plan.list`, `doctor.diagnose`, `update.run`) | everything not in the next row |
| The command's own older contract: `contract` (`protocol_version: "2"`, a string), `audit` (`protocol_version` with the payload flat), `config prefs resolve`, `workflow`, `eval` (camelCase `schemaVersion`, payload flat) | those five |

`--json` never changes what a command does — a mutating command with `--json`
still mutates. `eval --suite` always emits JSON. Never parse text output as if
it were JSON; check for the envelope key on the first line.

## Version skew

`av update` advances the binary on its own; installed skill copies (this file
included) move only on the next `av install`. After an update, this skill and
its reference may describe an older or newer surface than the binary. Order of
authority:

1. `av <cmd> --help` — always current for the running binary.
2. The `--json` envelope — versioned, parseable, `kind`-tagged.
3. This skill and its reference — a starting index. The reference's stamp
   names the binary it was checked against; `av versions` shows the running
   CLI and kit versions, `av changelog --since-current` what changed since.

Never rely on this skill's flag list for a mutating command.

## Anti-patterns

| Do not | Because |
|---|---|
| Pass `--yes` to a mutating command on your own initiative | It removes the only human gate; preview-by-default exists so the user sees the plan first |
| Run `recover`, `backups restore`, `uninstall`, or `migrate` without a fresh `backups create` | Irreversible without a snapshot |
| Smoke-test install, refresh, migration, uninstall, or recovery against the real home or project | Point `--home <dir>` and `--cwd <dir>` at a scratch location |
| Invent a flag or subcommand, or carry one over from another kit's CLI | Not in `--help` means not shipped; the kit's invocation lint fails on phantom commands |
| Treat a source-tree capability as active in the installed binary | Confirm with `av versions` and `av doctor` |
| Infer one provider's install paths from another's | `av contract` and `av kit install-path <provider>` are the truth per provider |
| Report a mutation without its resolved scope | "Installed the kit" is not enough — say project vs global, provider, and any conflict skipped |
| Re-run a mutating command just to see more output | Inspect partial state with `doctor`, `audit`, `backups list`, or `diagnostics export`; confirm the retry first |

## Output format

Report the exact command run (with scope flags), its class (read-only,
mutating, diagnostic), and the outcome: for mutations, what changed on disk
and in which scope, and whether it ran as a preview or applied under `--yes`;
for inspection, the relevant fields from the result (or the `--json` envelope
when used). Name any provider or artifact the command skipped and why.

## Quality gates

- [ ] Every command named in the report was confirmed against live `--help`
      in this session, not assumed from this skill's text or its reference
- [ ] Scope (project vs `--global`, provider, `--home`/`--cwd`) is stated
      explicitly for any mutation
- [ ] A mutating command was preceded by its read-only counterpart when one
      exists (`update --check` before `update`, `doctor`/`audit` before
      `migrate`/`uninstall`, `backups list` before `restore`)
- [ ] `--yes` or `setup --no-interactive` was passed only after explicit user
      approval, and a snapshot exists before any restore, recover, uninstall,
      or migrate
- [ ] No flag or subcommand appears that is not present in this session's
      captured `--help` output

## Workflow position

**Typically follows:** the router (`av:ariadnev`) deciding the next action
is a direct CLI operation rather than skill authoring or plan/journal work.
**Typically precedes:** `av:skill-creator` (once `av add-skill` has
scaffolded a skill and content needs writing), `av:plan` (once `av plan
create` has scaffolded a plan directory), or nothing — many `av` invocations
are terminal status checks.
**Related:** `av:help` (explain the CLI without running it),
`av:skill-creator` (skill content), `av:plan`/`av:plan-i18n` (plan content),
`av:journal` (journal content), `av:orchestrate` (job graphs),
`av:ariadnev` (task routing).
