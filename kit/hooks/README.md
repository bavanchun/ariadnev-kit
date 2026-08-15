# av hooks

Claude Code event hooks shipped with the kit. Installing to `claude-code` copies
each `hook.cjs` to `.claude/hooks/av/` and — after a y/n confirmation — merges the
event bindings into `.claude/settings.json`. Other providers skip-and-log.

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
