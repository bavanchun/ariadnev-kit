---
"ariadnev": patch
---

The usage-quota refresh hook now runs only on the runtime that renders the
statusline it feeds. Giving Codex and antigravity hook surfaces of their own
registered it there too, where every `PostToolUse`, `Stop` and
`UserPromptSubmit` would read the Claude Code credential and call the usage
endpoint for a display those runtimes have no way to show. An installed tree
whose runtime marker is missing still refreshes, matching the fall-back the rest
of the hook library already uses.

The `worktree.root` bound resolves real paths through the native resolver rather
than the JavaScript one. The latter returns whatever casing the caller passed,
so on macOS and Windows — where `.GIT` and `.git` are one directory — a value
spelled `.GIT/worktrees` resolved to itself, missed the check, and landed on
git's metadata on exactly the filesystems that fold case.
