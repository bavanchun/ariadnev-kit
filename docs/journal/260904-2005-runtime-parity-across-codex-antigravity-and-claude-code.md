# Runtime parity across codex, antigravity and claude-code

**Date**: 2026-09-04 20:05
**Component**: install
**Status**: Resolved

## What happened

## What happened

Six phases closed the gaps a parity study found across three providers. The
through-line: every cell the installer acted on had to be graded on what the
provider's own tooling answered, not on what a previous ariadnev install had
written.

- A provider-directed hook surface replaced the assumption that hooks are a
  claude-code-only concept. Three providers now register into three different
  files — `~/.claude/settings.json`, `~/.codex/hooks.json`,
  `~/.gemini/config/hooks.json` — two of them shared with other tools.
- Codex hooks landed natively. Its `hooks.json` keys trust on
  `<source>:<event>:<group index>:<hook index>`, so foreign groups are never
  reordered; ours are appended and the trust bookkeeping is reported.
- Every hook's stdout now goes through one runtime-aware emitter instead of
  bare `console.log`, so a deny antigravity cannot express is rejected rather
  than silently dropped.
- Claude-code's `outputStyle` cell turned out to be stale `skip`; it writes to
  the native path now.
- `worktree.root` became a project-overridable setting with a bounded *value*:
  relative, resolving inside the repo, symlinks followed, `.git/` excluded.

## The antigravity finding

The plan's premise was that ariadnev wrote agents to the wrong path. A probe
falsified it. `~/.gemini/config/agents/` **is** a real discovery root — a planted
file is enumerated immediately. The kit's own 16 agents sat there unlisted
because `agy` parses frontmatter by type: `tools:` must be a YAML sequence, and
the canonical kit writes Claude's comma-separated string. One key of the wrong
type drops the whole agent — no warning, no partial load. `model:` does the same
in all three spellings tried, with no accepted shape, so it is dropped rather
than translated.

So the path was right and the content was wrong. The rationale defending it was
still circular — it cited 16 files this kit's own lineage had written — and was
replaced regardless. Being right for the wrong reason is not evidence.

## What review caught

Reviewing the shared-file writers found the expensive class of bug: ownership
was a naked substring test, so a foreign command that merely *mentioned* our
hooks directory read as ours. Uninstall would have deleted another tool's entry;
the statusline slot would have taken over one the user chose. Ownership now
compares the script argument the command actually runs.

Tightening it turned two tests red — and they were wrong, not the fix. Their
`ownedDir` was a trailing-slash fragment no caller produces; both real callers
pass a resolved absolute directory. The fragment only ever passed because the
old check was a substring test. The test had been encoding the defect as if it
were the contract.

Two mergers also now refuse a file whose bytes parse but whose shape is not
theirs, rather than losing the registration at stringify time.

## Decision

Grade a provider cell only on what that provider's own tooling answers. A
listing that enumerates a planted artefact is a load check; a directory that
looks right is not. Where no listing exists — agy has no `skill` subcommand —
say so and let the cell rest on its own separate evidence.

## Next steps

- Open the PR against `dev` and close #134 with the per-checkbox commit map.
- Fetch the two Codex output schemas the flow-control emitters ride on
  (UserPromptSubmit, Stop); the other four were fetched and all set
  `additionalProperties: false`.
- Open question: does agy's `tools` sequence gate anything at runtime, or is it
  parsed and ignored? Answering it costs a real model turn.
