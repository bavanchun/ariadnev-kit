# Probe: session file layouts

Captured 2026-08-28 on darwin against `ak` 2.14.0 and the live agent
directories on this machine. Evidence for phase 5 step 2, whose rule is that a
layout which cannot be confirmed is **unsupported, not guessed**.

Both layouts were confirmed. Neither needs guessing.

## Claude Code — confirmed

```
~/.claude/projects/<slugified-cwd>/<session-uuid>.jsonl
```

30 project directories present. The directory name is the project's absolute
path with every `/` replaced by `-`, e.g.
`-Users-vchun-Codes-My-projects-vcskill-kit`.

One JSON object per line, discriminated by a top-level `type`. Observed types
in a single real session:

| type | carries |
|---|---|
| `user`, `assistant` | `message`, `timestamp`, `uuid`, `parentUuid`, `cwd`, `gitBranch`, `version` |
| `system` | hook results, `subtype`, `level` |
| `attachment` | injected context |
| `file-history-snapshot`, `file-history-delta` | edit tracking |
| `mode`, `permission-mode`, `last-prompt`, `bridge-session`, `ai-title`, `queue-operation`, `pr-link` | session metadata, no conversation text |

An `assistant` record's `message` carries what the summary needs:

- `message.model` — e.g. `claude-opus-5`
- `message.usage` — `input_tokens`, `output_tokens`,
  `cache_creation_input_tokens`, `cache_read_input_tokens`, plus a nested
  `iterations` array

**Most record types are not messages.** A `message_count` that counted lines
would be wrong by a wide margin: the file surveyed held 1,862 `attachment` and
127 each of four metadata types against 348 `user` and 599 `assistant`.

## Codex — confirmed

```
~/.codex/sessions/YYYY/MM/DD/rollout-<ISO-ish-stamp>-<uuid>.jsonl
```

Date-sharded, unlike Claude Code's per-project directories. Also one object per
line with a top-level `type`, but every record wraps its body in `payload`:

| type | carries |
|---|---|
| `session_meta` | `payload.session_id`, `payload.cwd`, `payload.model_provider`, `payload.cli_version`, `payload.originator` |
| `response_item` | model output |
| `event_msg` | tool and lifecycle events |
| `turn_context`, `world_state` | per-turn state |

The project a Codex session belongs to comes from `session_meta.payload.cwd`,
not from the path — the path carries only a date.

### `~/.codex` holds credentials

`~/.codex/auth.json` sits beside `sessions/`. Discovery must be rooted at
`~/.codex/sessions/` and never walk the parent. This is the strongest reason in
the probe to keep the session roots as explicit constants rather than deriving
them from an agent home.

## What the oracle actually does, versus what it says

`ak sessions list|show|tail|redact --help` all say "Claude Code session JSONL
files". The behaviour is broader:

- `ak sessions list --json` returned entries whose `id` is
  `rollout-2026-08-24T14-19-20-01a032a3-…` — a Codex rollout filename. It reads
  both agents.
- `ak sessions stats --json` reported rows for `claude-code`, `codex` **and**
  `opencode`, with a `provenance` map giving per-runtime, per-metric quality
  (`exact` / `unavailable`).

So the help text is stale relative to the implementation. Matching the help
would have produced a reader half the size of the one the envelope describes.
Since both layouts are confirmed here by direct observation, ariadnev supports
both on evidence. OpenCode is **not** confirmed on this machine and is
therefore unsupported and reported as such.

## Envelope field names, for `summarize.ts`

`sessions.list`, per session:

```
id, project_id, started_at, ended_at, message_count,
model, duration_ms, last_message_preview, size_bytes
```

`sessions.stats`: `rows[]` of
`{ metric, dimension, key, label, runtime, value, quality }`, plus `total`,
`metric`, `dimension`, and the `provenance` map.

Both wrap in the shared envelope with one top-level `schema_version` and a
`kind`. As in phases 3 and 4, there is no `schema_version` repeated inside
`data`.

## Two hazards this probe confirms

### `last_message_preview` leaks live content

`ak sessions list --json` printed, verbatim, a sentence written seconds earlier
in the session running this very probe — along with previews from two unrelated
projects, one containing a user's own prose. This is exactly the risk the phase
flagged. It is not hypothetical and it is not rare: it is the default output of
the most-used verb.

**Consequence for the port:** the preview is truncated hard and is absent from
`--json` unless explicitly requested by a flag.

### Upstream `redact` can write

`ak sessions redact --help` documents `--apply`: *"Rewrite changed session files
after taking a session-root backup"*, gated on `--apply` plus `--yes`.

The phase pre-decided not to port this, and the probe confirms the flag is real
rather than imagined. ariadnev's `redact` prints a plan and writes nothing under
any flag. These are the user's files and another tool's format; a rewrite path
needs its own phase and its own backup design.

## Sizes, for the streaming requirement

Session files on this machine reach **20,086,868 bytes** (11,295 messages) —
twenty times the 1 MB the phase anticipated. `readFileSync` is not an option,
and the largest file is the one currently being appended to.
