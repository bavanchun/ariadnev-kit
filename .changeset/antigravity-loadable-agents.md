---
"ariadnev": minor
---

Agents installed for antigravity are now loadable by it. They were not before:
`agy` reads agent frontmatter by type, and a *known* key of the wrong YAML shape
makes it drop the whole file with no warning. Every kit agent carried Claude
Code's comma-separated `tools:` string where a sequence is required, and a
`model:` in an alias no shape of which agy was found to accept — so 16 agent
files sat in agy's own discovery root without one of them ever being listed.

The adapted copy now emits `tools:` as a sequence and drops `model:` entirely,
so the agent runs on agy's default model instead of not running at all. Entries
inside the sequence stay verbatim: this provider's tool-name cell is unverified,
and renaming on a guess would put invented identifiers into a file the user
reads as authoritative. The canonical kit is unchanged and every other provider
still receives both keys as before.

Hooks register in `~/.gemini/config/hooks.json`, which agy shares between
writers by giving each one a top-level key of its own; ariadnev owns `"av"` and
leaves the rest of the file alone. Only three of agy's five events have a kit
binding, so nine of the nineteen bindings are skipped per binding rather than
remapped onto an event that fires at a different time. A blocked tool call is
written as agy's own `{"decision":"deny"}` on stdout, because agy reads no exit
code — the exit status that is the deny on Claude Code and Codex would have been
a silent allow here.

The hook-merge prompt is no longer asked only when claude-code is among the
selected providers. Codex and antigravity each register bindings in a file of
their own, and installing either alone never offered the merge: the hook tree
was copied, the registry was never written, and the receipt recorded every
binding as unapplied. The prompt now names the exact files it is about to edit.
