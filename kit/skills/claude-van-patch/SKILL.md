---
name: vc:claude-van-patch
description: Patch the Claude Code binary to replace the "Claude Max" header badge with "Claude Van". Use this skill whenever the user mentions a new Claude Code version, says the badge is back to "Claude Max", asks to "rebrand", "rename", "rehide", "repatch" the header label, or says things like "Claude Code updated and Claude Max is showing again". Idempotent — safe to run after every Claude Code auto-update.
---

# Claude Van Patch

Replaces the "Claude Max" subscription badge in the Claude Code welcome header with "Claude Van" (length-preserving byte patch + ad-hoc codesign). Reapplies cleanly after each Claude Code auto-update.

## When to run

Run whenever:
- User says Claude Code updated / shows a new version
- User sees "Claude Max" badge back in the header
- User asks to repatch / reapply / rebrand the badge

## How

Run the script. It auto-detects the newest version binary in `~/.local/share/claude/versions/`, backs it up once, patches `return"Claude Max"` → `return"Claude Van"` (10→10 chars), re-signs ad-hoc, verifies with `claude --version`.

```bash
bash ~/.claude/skills/claude-van-patch/scripts/patch-claude-van.sh
```

Idempotent: if already patched, exits 0 with no changes. If no "Claude Max" string is found (binary format changed), exits 2 — report to user.

## After running

Tell user: restart Claude Code (new launches only — current session keeps old binary in memory).

## Scope

Does NOT modify settings.json, hooks, or any user config. Only patches the version binary at `~/.local/share/claude/versions/<ver>`. Original kept at `<ver>.orig-bak`.
