---
name: av:av
description: Operate the av control-plane CLI itself. Use when the next action is running an av subcommand or interpreting its output, deciding read-only vs mutating, or picking install scope.
user-invocable: true
when_to_use: "Invoke when the next concrete action is running an av subcommand, choosing between inspection and mutation, disambiguating project vs global scope, or reading --json output. Not for skill authoring, task routing, or plan/journal content."
category: cli
keywords: [av, cli, install, doctor, validate, audit, contract, eval, migrate, adapters, scope]
argument-hint: "[goal or subcommand]"
metadata:
  author: vchun
  version: "1.0.0"
---

# av — operate the CLI

Teach an agent to run the `av` control-plane CLI safely: which subcommand
answers which intent, the read-only/mutating split, scope flags, and where
`--json` exists. `av <cmd> --help` is always authoritative over this file —
flags and subcommands can change on the next release; this skill keeps the
command list short on purpose rather than duplicating a table that will drift.

## Boundaries

| Intent | Route to |
|---|---|
| Author or refine a Claude/other-provider skill | `av:skill-creator` |
| Decide which installed skill/agent fits a task | `av:ariadnev` (task router) |
| Write or execute an implementation plan | `av:plan`, `av:plan-i18n` |
| Write a technical journal entry | the journal-writing workflow (`av journal create` is the CLI surface it calls) |
| Run *the `av` binary itself* | this skill |

## Safe operating protocol

1. **Triage the goal.**
   - `read-only` — inspects and never mutates disk or remote state: `list`,
     `query`, `contract`, `validate`, `audit` (`--strict` only changes which
     findings fail the report, it never writes), `plan show|list|resolve|search|phase`,
     `journal list|show|validate`, `mcp list|show|verify`, `kit
     install-path`, `config prefs resolve`, `telemetry status`, `backups`
     with the `list` action, `run --validate` / `run status`.
   - `mutating` — writes durable state: `install`, `uninstall`, `update`
     (without `--check`), `migrate`, `doctor --fix`, `add-skill`, `plan
     use|update|check|uncheck|status|close|archive|cleanup`, `journal
     create`, `mcp add|remove`, `kit refresh`, `adapters regenerate`,
     `skill install|verify|repair|upgrade|remove|run`, `backups restore`,
     `workflow run` (executing a workflow), `workflow resume|cancel`.
   - `diagnostic` — inspects and reports health, safe to run anytime:
     `doctor` (without `--fix`).
2. **Inspect before acting.** Run `av <cmd> --help` (and nested `av <cmd>
   <subcmd> --help` for grouped commands: `plan`, `journal`, `kit`, `mcp`,
   `adapters`, `config`, `workflow`, `skill`) for the intended command before
   using it — this skill's list may lag the installed binary. For read-only
   scripted work, pass `--json` where the command supports it (see below) so
   output is parseable instead of scraped.
3. **Confirm scope.** `--home <dir>` and `--cwd <dir>` at the top level
   override where `av` reads/writes; most commands also take `--global` to
   act on `~/` instead of the current project. Confirm which scope a
   mutating command targets before running it — `install`/`uninstall`
   default to project scope (`./`), `--global` switches to `~/`.
   `--dry-run` (top-level) plans a mutation without writing; `--yes` skips
   interactive prompts. Use `--dry-run` first on any command you have not
   run in this project before.
4. **Prefer inspection before lifecycle mutation.** Before `update`,
   `migrate`, `uninstall`, `kit refresh`, or `backups restore`, run the
   read-only counterpart first: `update --check`, `doctor`, `audit`,
   `backups list`, `plan show`. Preview conflicts instead of guessing.
5. **Never invent a flag or subcommand.** If it is not in `av <cmd> --help`,
   it is not shipped. Do not carry a flag over from another agent-kit CLI:
   `av`'s surface is its own command set (see Boundaries above), and a
   name that looks familiar elsewhere is not evidence it exists here.
6. **Report the exact command, scope, and result.** Name what changed on
   disk (or would change, under `--dry-run`) and any provider or artifact
   that was skipped.

## Command index by task

Full flags live behind `--help`; this is only the map from intent to
command.

- **Install / remove / repair** — `av install [--provider <list>]
  [--global]`, `av uninstall [--provider <list>] [--global]`, `av doctor
  [--global] [--fix]`, `av backups list|restore <timestamp> [--global]
  [--file <rel>]`, `av migrate [--provider <id>] [--global]`.
- **Update** — `av update [--check] [--global]` for the latest release;
  `av update --to <x.y.z> [--global]` to pin an exact version (downgrade or
  cross-grade). `--to` accepts only an exact `x.y.z`, never a range or
  `latest`; the CLI checksum-verifies the release before installing it. A
  downgrade can leave installed artifacts ahead of the binary's schema —
  re-run `av install` afterward if `av doctor` reports drift.
- **Inspect the kit source** — `av validate [--check]` (lint frontmatter,
  sizes, references, cross-skill routing; `--check` also gates the README
  provider matrix), `av contract [--json]` (provider×artifact capability
  matrix), `av audit [kit|scripts] [--global] [--json] [--strict]`.
- **See what's installed** — `av list [--global]`, `av query
  [installs|doctor|history]`.
- **Author a skill** — `av add-skill <name> [--description <text>]`
  (frontmatter scaffold only; see `av:skill-creator` for content).
- **Plans** — `av plan use|show|list|resolve|update|check|uncheck|
  status|close|phase|search|reindex|archive|cleanup` (run `av plan --help`
  for the current subcommand list; most take `--json`). No plan-authoring
  subcommand exists — plan content is written as files by the agent, per
  `av:plan`.
- **Journal** — `av journal create|list|show|validate`.
- **MCP servers** — `av mcp list|show|add|remove|verify`. `add`/`remove`
  default to project scope; pass `--global` for your own config.
- **Kit source location** — `av kit install-path <provider>`, `av kit
  refresh` (discard and re-extract the embedded/cached kit).
- **Adapter artifacts** — `av adapters regenerate` (deterministic rebuild
  from the install receipt).
- **Per-skill Python environments** — `av skill install|verify|repair|
  upgrade|remove|run <name> [--deep] [--json]`.
- **Quality scoring** — `av eval [--skill <name>] [--suite] [...]` (tier-1
  static always; `--suite` adds tier-2 behavioral scenarios).
- **Config** — `av config prefs resolve [--json]`.
- **Telemetry** — `av telemetry [status]` (off unless configured; opt out
  via `ARIADNEV_TELEMETRY_DISABLED=1`).
- **Graph workflows** — `av workflow run [--validate] [--json] <workflow>`,
  `av workflow resume|status|cancel <run-id>`. `av run <workflow>` is the
  deprecated spelling and stops working in 1.4.0.

## `--json` availability

Present on: `plan` subcommands, `journal validate`, `audit`, `contract`,
`config prefs resolve`, `skill` actions, `workflow`. Absent on plain-text
commands like `list`, `doctor`, `validate`, `query`, `mcp list|show|verify`,
`kit install-path`, `telemetry status` — confirm with `--help` before
assuming an envelope exists; do not parse text output as if it were JSON.

## Output format

Report the exact command run (with scope flags), whether it was read-only or
mutating, and the outcome: for mutations, what changed on disk and in which
scope; for inspection, the relevant fields from the result (or the `--json`
envelope when used). Name any provider/artifact the command skipped and why.

## Quality gates

- [ ] Every command named in the report was confirmed against live `--help`
      in this session, not assumed from this skill's text
- [ ] Scope (project vs `--global`) is stated explicitly for any mutation
- [ ] A mutating command was preceded by its read-only counterpart when one
      exists (`update --check` before `update`, `doctor`/`audit` before
      `migrate`/`uninstall`, `backups list` before `restore`)
- [ ] No flag or subcommand appears that is not present in this session's
      captured `--help` output

## Workflow position

**Typically follows:** the router (`av:ariadnev`) deciding the next action
is a direct CLI operation rather than skill authoring or plan/journal work.
**Typically precedes:** `av:skill-creator` (once `av add-skill` has
scaffolded a skill and content needs writing), or nothing — many `av`
invocations are terminal status checks.
**Related:** `av:skill-creator` (skill content), `av:plan`/`av:plan-i18n`
(plan content), `av:ariadnev` (task routing).
