# av hooks

Event hooks shipped with the kit. Two providers install them, each into its own
tree and its own registry: `claude-code` copies each `hook.cjs` to
`.claude/hooks/av/` and — after a y/n confirmation — merges the event bindings
into `.claude/settings.json`; `codex` copies to `~/.codex/hooks/av/` and merges
into `~/.codex/hooks.json`, which it shares with whatever else the user runs, so
the merge touches only ariadnev's own groups. Other providers skip-and-log.

A Codex hook stays inert until the user trusts it in Codex's own TUI (`/hooks`)
— there is no CLI subcommand for it. Codex also validates hook stdout against
schemas declared `additionalProperties: false`, so a key in the wrong place is
not ignored: the whole decision is thrown away and the user sees `Hook failed`
where a deny was meant. Every hook here writes its stdout through
`_lib/hook-output.cjs` for that reason — it is the one place the envelope is
shaped, and it refuses the misplacements rather than emitting them.

Every hook is **fail-open**: an internal error exits 0 so a hook can never take
down the session it was watching. The two guards below are the exception, and
only in one direction — they exit 2 to *stop a tool call*, never because they
themselves failed.

## What ships

19 bindings across 8 events. Order inside an event matters and is declared, not
inherited from however the directory happens to be listed.

| Hook | Event(s) | What it does |
|---|---|---|
| `session-init` | `SessionStart` | Detects project type, package manager, framework, git branch; writes `AV_*` context lines. |
| `subagent-init` | `SubagentStart` | Injects a compact context brief into a freshly spawned subagent. |
| `team-context-inject` | `SubagentStart` | Adds the active team's shared context to a spawned subagent. |
| `privacy-block` | `PreToolUse` (Read\|Write\|Edit\|Bash) | Blocks `.env`, key material, and credentials; emits an AskUserQuestion marker with an approval path. Exits 2 to block. |
| `scout-block` | `PreToolUse` (Bash\|Read) | Blocks context-wasting reads inside generated trees (`node_modules`, `dist`, `.venv`); `.avignore` extends or negates the defaults. Exits 2 to block. |
| `descriptive-name` | `PreToolUse` (Write) | Rejects a vague new-file name before the file exists. |
| `secret-output-guardrail` | `UserPromptSubmit` | Warns the model away from echoing secrets, before the prompt is answered. |
| `simplify-gate` | `UserPromptSubmit` | Gates ship-shaped prompts on a simplification pass when the working diff is large. |
| `dev-rules-reminder` | `UserPromptSubmit`, `PostToolUse` (Write\|Edit) | Surfaces the project's development rules on prompt and after a write. |
| `plan-format-kanban` | `PostToolUse` (Edit\|Write) | Keeps plan files in the format the plan commands expect. |
| `session-state` | `PostToolUse` (task tools), `Stop`, `SubagentStop` | Persists a per-project session snapshot. |
| `usage-quota-cache-refresh` | `PostToolUse`, `Stop`, `UserPromptSubmit` | Refreshes the cached usage figures the statusline reads. |
| `cook-after-plan-reminder` | `Stop` | Reminds you to run the implementation workflow once a plan is accepted. |
| `precompact-capture` | `PreCompact` | Captures the session state compaction is about to discard. |

Cost, measured on an installed tree: about 60–70ms per hook, nearly all of it the
cold `node` start each one pays. `SessionStart` runs one hook (~100ms); the
heaviest event is `PostToolUse` at four (~280ms).

## Layout

Shared helpers live in `_lib/` — underscore-prefixed directories are not
installable hooks, and `loadKit` skips them. A hook finds them by probing for
`_lib` beside itself and one level up, because the kit checkout nests hooks one
directory deeper than the installed tree does.

The installer also writes `.ariadnev-runtime.json` next to `_lib` in the
installed tree (`{"schemaVersion":1,"runtime":"claude-code"}`). The session-state
family — `session-state`, `precompact-capture`, `cook-after-plan-reminder`,
`team-context-inject` — reads it to learn which runtime launched it and exits
without writing when it is absent; `ariadnev doctor` reports a hook install that
has lost it. The kit checkout deliberately carries no marker.

The kit's `output-styles/` belong to `session-init`, not to a provider surface:
the installer writes them (receipted, like any hook file) into this hooks
directory, under `output-styles/`. `session-init` reads one when `codingLevel`
in the project's `.ariadnev/config.json` is `0`–`5`, after first probing
`<config dir>/output-styles/`, which stays reserved for styles the user authors
natively and wins when both exist. `codingLevel: -1` (default) injects
nothing.

`_lib/notifications/` is not bound to any event. Sending a session's activity to
a third-party service is opt-in: set `notifications.enabled` and a destination in
**your** config (`~/.ariadnev/config.json`), then wire `notify.cjs` into the event
you want. A destination must be an https URL on an allowlisted host, and the
payload is the event name plus, for a subagent, its type — nothing that describes
the machine, the project, or what was said.

## Config

`hook.json` declares each hook's bindings:

```json
{
  "bindings": [
    { "event": "PostToolUse", "matcher": "Write|Edit", "order": 10 },
    { "event": "UserPromptSubmit", "order": 30 }
  ],
  "description": "…"
}
```

`order` fixes the position within an event (ascending; undeclared binds last).
`matcher` is per-binding, because a hook can want a tool matcher on one event and
none on another. `event` / `events[]` remain valid shorthand for the simple case.

Hooks read settings through `_lib/av-config-client.cjs`, which reads the config
files directly — no CLI spawn — and honors the layer split: a project file may
set workspace keys, never `privacyBlock`, `trust.*`, `scripts.executionPolicy`,
or a notification destination.

To see the settings snippet without installing:
`ariadnev install --provider claude-code --dry-run`.
