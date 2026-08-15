---
"@ariadnev/cli": major
---

The kit is now the full upstream corpus, and the CLI grew the surfaces it needs.

**Content.** 101 ported skills beside the two this repo owns, 16 agents under
their upstream names, 10 rules, 14 hooks across 8 events, and a statusline.
Ported artifacts are marked as such and judged by validity rather than by this
project's authoring style — see ADR 0008.

**Configuration.** `~/.ariadnev/config.json` and a project file, with a
permission split: a project may set workspace-shaped keys, never the ones that
protect the user (privacy blocking, trust, script execution policy, notification
destinations, per-hook switches). `ariadnev config prefs resolve` shows what took
effect and what was rejected; a configured destination prints as `<redacted>`.

**New commands.** `plan use|show`, `kit install-path|refresh`,
`mcp list|show|add|remove|verify` (verify starts each server and checks the MCP
initialize handshake), `adapters regenerate`. Commands added from here on use one
exit-code table; `doctor` and the other pre-existing commands keep theirs,
because CI gates on them.

**Fixes.** Uninstall hashed files as utf8, so every binary looked user-modified
and was preserved — a full uninstall left 55 fonts and images behind. Hooks
resolved their shared library and the provider config dir by hard-coded relative
paths that are wrong in this layout, which silently disabled the scout guard.
Hook bindings now install in a declared order rather than alphabetically.

**Breaking.** Agents are renamed to their upstream names (`av-reviewer` →
`code-reviewer`, `av-developer` → `fullstack-developer`, `av-explore` →
`explore`, and so on). State from before the rename is not migrated; see
`docs/migration-from-the-old-name.md`.
