---
phase: 5
title: "sessions reader"
status: pending
priority: P2
effort: "3-5d"
dependencies: [4]
---

# Phase 5: `sessions` reader

## Overview

`av sessions list|show|tail|stats|redact` over the session JSONL files that
Claude Code and Codex already write. This is a **read-only phase over third-party
files** — ariadnev owns none of them, writes none of them, and the only mutating
verb (`redact`) is dry-run.

The lowest-risk phase in the plan, and a genuinely useful one.

## Requirements

**Functional**
- `av sessions list` — sessions for registered projects.
- `av sessions show <project> <session>` — paginated messages.
- `av sessions tail <project> <session>` — stream appended messages.
- `av sessions stats` — aggregate local session analytics.
- `av sessions redact` — **dry-run** credential redaction preview.
- All support `--json`.

**Non-functional**
- **Read-only.** No session file is written, moved, or truncated. `redact` is
  dry-run and prints a plan; it does not edit.
- Malformed or partially-written JSONL lines are skipped with a count, never
  fatal — a session file is being appended to by a live agent while being read.
- Bounded memory: a 1 MB+ session (observed: 1,119,494 bytes, 551 messages) must
  stream, not load.
- Session content is the user's work. It is never emitted to the activity log and
  never leaves the machine.

## Architecture

**Oracle, and the finding that shapes this phase:** `ak sessions list --json`
returned real data on this machine — `id`, `project_id`, `started_at`,
`ended_at`, `message_count`, `model`, `duration_ms`, `last_message_preview`,
`size_bytes`. Cross-checked against `~/.claude/projects/*/`: **AgentKit is
reading Claude Code's own JSONL files.** There is no session store to build. The
`project_id` field ties back to the phase-4 registry, which is why this phase
depends on it.

So the work is a **reader plus a metadata extractor**, not a datastore:

```
sessions/
  discover.ts    registry → session file paths, per agent
  parse.ts       streaming JSONL, tolerant of partial trailing lines
  summarize.ts   the metadata envelope above
  redact.ts      credential-shaped detection → a dry-run plan
```

**Discovery is per-agent and must be evidence-gated the same way providers are.**
Claude Code's layout is observable here. Codex's is not confirmed — probe it in
step 1, and if it cannot be confirmed, the reader supports Claude Code and
*reports* Codex as unsupported rather than guessing a path. Same discipline as
`spec-verified.ts`, for the same reason.

**`last_message_preview` is a hazard.** It puts session content in a list output
that a user may paste into an issue. Truncate hard, and never include it in
`--json` unless explicitly requested via a flag.

## Related Code Files

- Create: `packages/cli/src/sessions/discover.ts` + test
- Create: `packages/cli/src/sessions/parse.ts` + test
- Create: `packages/cli/src/sessions/summarize.ts` + test
- Create: `packages/cli/src/sessions/redact.ts` + test
- Create: `packages/cli/src/cli/sessions-command.ts` + test
- Modify: `packages/cli/src/cli/register-maintenance-commands.ts`
- Modify: `packages/cli/src/storage/operational-paths.ts` — agent session roots
- Modify: `parity-manifest.json`
- Create: `plans/reports/probe-260828-session-layouts.md` — the discovery evidence

## Implementation Steps

1. **Oracle observation.** Capture `ak sessions <verb> --help` and a `--json`
   envelope from `list`, `show`, and `stats`. Record the exact field names —
   matching them costs nothing now and makes ariadnev's output drop-in later.
2. **Probe session layouts.** Confirm where Claude Code writes session JSONL and,
   separately, whether Codex does and where. Write both to the probe report. A
   layout that cannot be confirmed is unsupported, not guessed.
3. Failing tests first for `parse.ts`, with fixtures covering: a well-formed
   file, a file whose last line is a partial write, an empty file, and a file
   with an unparseable line in the middle. All four must be non-fatal.
4. Implement streaming parse. Never `readFile` a session — the observed sizes
   make that a memory problem, and a live agent is appending while you read.
5. Implement `discover.ts` against the phase-4 registry, gated on step 2.
6. Implement `summarize.ts` matching the oracle field names.
7. Implement `list`, `show` (paginated), `stats`.
8. Implement `tail`, reusing the follow logic from phase 3's activity tail
   including its rollover handling.
9. Implement `redact` as **dry-run only**: detect credential-shaped strings,
   print what would change, change nothing. Assert by test that no file is
   written under any flag.
10. Truncate `last_message_preview` hard; put it behind a flag in `--json`.

## Success Criteria

- [ ] All five verbs work with `--json`
- [ ] Field names match the oracle envelope
- [ ] Partial, empty, and corrupt-line files are handled non-fatally with a count
- [ ] A 1 MB+ session streams — memory does not scale with file size
- [ ] **No session file is ever written** — asserted across all verbs and flags
- [ ] Unsupported agents are reported as unsupported, not guessed
- [ ] Session content never reaches the activity log
- [ ] `pnpm test` green

## Risk Assessment

**Reading a file a live agent is writing.** Sessions are appended continuously;
a read can land mid-line.
*Signal:* a parse failure on a file that is fine moments later.
*Response:* step 3's partial-trailing-line fixture, and a tolerant parser that
counts skipped lines rather than throwing. This is the normal case, not an edge.

**A guessed layout reads the wrong files, or nothing.** Codex's location is
unconfirmed.
*Signal:* step 2 cannot confirm a layout. *Response:* report unsupported. The
provider matrix already establishes that skip-and-log is correct behavior; the
same rule applies to reading.

**Session content leaks.** Previews in list output, or content in the activity
log, both put the user's work somewhere they did not expect.
*Signal:* the redaction or leak test finds content outside `show`.
*Response:* preview truncated and flag-gated; a test asserts the activity log
never contains session text.

**`redact` grows a write path.** A dry-run tool acquiring an `--apply` flag is
how a read-only phase stops being read-only.
*Signal:* any write in `redact.ts`. *Response:* the no-write assertion covers all
flags. If real redaction is wanted later it is a separate phase with its own
backup design — these are the user's files, not ariadnev's.
