---
phase: 5
title: "sessions reader"
status: completed
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


## What shipped, and where it diverged

Recorded for phase 13's audit. The probe that grounds all of this is
`plans/reports/probe-260828-session-layouts.md`.

### Codex is supported, because its layout was confirmed

The phase expected Codex to be unconfirmable and planned to report it
unsupported. It was found on disk: `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`,
date-sharded, every record wrapping its body in `payload`. Supported on
evidence, per the rule rather than against it.

**OpenCode is the one reported unsupported.** It appears in the oracle's `stats`
output and was not found here, so `--runtime opencode` fails by name and the
stats envelope carries an `unreadable_runtimes` list. A silent zero would be
indistinguishable from an agent nobody used.

### Discovery is rooted at each sessions directory, not each agent home

`~/.codex/auth.json` sits one level above `~/.codex/sessions/`. Rooting the walk
lower keeps the credential file outside the traversal entirely, rather than
excluding it with a filter someone has to keep correct. The Codex walk is also
depth-bounded to the observed `YYYY/MM/DD` shape.

### `redact` has no write path, and the absence is the guarantee

The oracle's `redact` does carry `--apply` — *"Rewrite changed session files
after taking a session-root backup"* — so this was a real decision, not a
hypothetical. `redact.ts` names no function that could open one, and a test
asserts that. Detection reuses `security/credential-sanitizer.ts`, the CLI's own
output boundary, so a plan can never disagree with what this tool would mask on
the way out.

Findings report a line position and a match count, never the matched value: a
report quoting the credential it found is a second copy of the problem.

### `message_count` counts messages; the oracle counts lines

`ak sessions list` reported 11,295 for a session where this reports 2,617. The
difference is not a bug on either side: these files carry ten-plus record types
and most are machinery. The session surveyed for the probe held 1,862
`attachment` records against 348 `user` messages. A field named `message_count`
that includes file-history snapshots is the one that needs explaining.

### `--limit` counts messages, which is what its help says

Found by running the compiled binary against a real 21 MB session, not by the
suite: `show --limit 2` returned an **empty page**, because the limit was
applied to lines and a real session opens with several metadata records before
its first message. `readRecords` now takes a `keep` predicate and applies the
limit to what survives it, with the cursor still advancing over what was
dropped so the next page does not re-read it.

### The preview is absent unless asked for

`ak sessions list --json` printed a sentence written seconds earlier in the
session running the probe, plus prose from two unrelated projects — the default
output of the most-used verb. Here it is off by default, behind `--preview`, and
truncated to 80 characters with newlines collapsed.

### Tailing uses a byte offset, not a line cursor

The first implementation re-read from the start each poll and skipped lines,
which is twenty megabytes of reads per second to find one new message. `readFrom`
resumes at a byte offset, stops before a trailing partial line so the next poll
picks it up once the writer finishes, and starts over when the file shrinks —
a file the owner truncated would otherwise be read mid-record.

## Verification

- 1688 tests passing, lint clean, typecheck clean.
- The parser was measured against the **real** live session: 20,366,897 bytes on
  disk, **65,536 bytes read** for a five-record window; a full scan parsed
  11,469 records with 0 skipped.
- Driven against the compiled binary on real data: `list` returned both runtimes
  with Codex projects resolved from each session's own `cwd`; `stats` reported
  Codex token counts as `unavailable` rather than zero; `--runtime opencode`
  refused by name; `redact` found real credential matches in a Codex session and
  left every file byte-identical, verified by comparing a size-and-mtime digest
  across all session files before and after.

## Unresolved

- `packages/cli/src/cli/activity-command.ts` contains a raw NUL byte inside a
  template literal, used as a composite map key separator. It works, but it makes
  the file binary to `ripgrep` and similar tools. Spelling it `\u0000` would
  produce the same string and keep the source searchable. Phase 3 code, left
  alone here rather than widening this phase.
