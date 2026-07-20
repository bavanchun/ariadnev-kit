# vc hooks

Claude Code event hooks shipped with the kit. Installing to `claude-code` copies
each `hook.cjs` to `.claude/hooks/vc/` and — after a y/n confirmation — merges the
event bindings into `.claude/settings.json`. Other providers skip-and-log.

Every hook is **fail-open**: any internal error exits 0 so a hook can never block
the session. The pure logic is exported for `node:test`; the file only acts when
run directly (`require.main === module`).

| Hook | Event(s) | What it does |
|---|---|---|
| `session-init` | `SessionStart` | Detects project type, package manager, framework, git branch; injects `VC_*` context lines. |
| `rules-inject` | `UserPromptSubmit` | Injects `.claude/rules/*.md` into context, throttled per session, re-injected when rules change. |
| `privacy-block` | `PreToolUse` (Read\|Edit\|Write\|Bash) | Blocks access to `.env`, key material, credentials; emits an AskUserQuestion marker with a `VC_APPROVED=1` retry path. |
| `scout-block` | `PreToolUse` (Bash\|Glob\|Grep\|Read) | Blocks context-wasting reads/searches inside generated trees (`node_modules`, `dist`, `.git`); `.vcignore` extends or negates defaults. |
| `session-state` | `Stop`, `SubagentStop` | Persists a per-project markdown session snapshot on stop; archives last 5, expires after 7 days. |
| `subagent-init` | `SubagentStart` | Injects ~200 tokens of context (agent type, paths, naming pattern, git branch) into a freshly spawned subagent. |

Shared helpers live in `_lib/` (underscore-prefixed dirs are not installable
hooks — `loadKit` skips them). Each hook's `hook.json` declares its event(s) and
a one-line description; the installer reads those to build the settings merge.

To see the settings snippet without installing:
`vcskill install --provider claude-code --dry-run`.
