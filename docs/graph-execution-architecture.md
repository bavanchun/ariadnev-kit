# Graph execution architecture

## Overview

`vc run` is vcskill's local execution control plane. It compiles a canonical,
provider-neutral workflow from `kit/workflows/`, enforces policy before provider
execution, and records enough private durable state to resume after interruption.
Codex and Claude Code implement the same executor contract; provider settings do
not appear in Graph IR.

The public surface is intentionally narrow:

```text
GraphIRV1 -> compiler/lint -> policy -> event-sourced runner -> executor registry
                                                           -> Codex
                                                           -> Claude Code
```

This does not change provider installation plans. Workflows are execution-only
kit assets and are embedded in standalone binaries alongside their schema.

## Command lifecycle

Validate a canonical graph without probing a runtime:

```bash
vc run read-only-delivery --validate --json
```

Probe a selected runtime and show whether the graph can run, without creating a
run:

```bash
vc --dry-run run read-only-delivery --runtime claude-code --json
```

Start and operate a durable run:

```bash
vc run read-only-delivery \
  --runtime claude-code \
  --instruction "Find the module that owns routing and cite the source file" \
  --json

vc run status <run-id> --json
vc run resume <run-id> --runtime claude-code --instruction "..." --json
vc run cancel <run-id> --json
```

`resume` requires the original instruction digest, workspace identity, compiled
graph digest, runner contract, runtime, runtime version, and model. A mismatch is
reported; vcskill never silently switches providers. A terminal run resumes
idempotently without invoking a provider.

The current canonical workflows are `read-only-delivery`,
`bugfix-delivery`, and `safe-change-delivery`. Public active execution is
read-only. `safe-change-delivery` can be validated, but dry-run and execution
remain policy-denied until a real public side-effect executor and approval input
surface exist; vcskill does not simulate a successful mutation.

## Runtime contract

Runtime and model configuration stays outside Graph IR. Defaults in this release
are pinned and probed before use:

| Provider | Runtime | Default model | Isolation |
|---|---:|---|---|
| Codex | `0.147.0` | `gpt-5.4-mini` | Controller-owned home; only the auth file is linked |
| Claude Code | `2.1.226` | `sonnet` | `--safe-mode`; only Read/Glob/Grep; isolated config for API-key auth, normal auth home for OAuth |

Use `--runtime-version` and `--model` only with an explicit `--runtime`. A run
manifest pins the resulting identity. If a newer local CLI does not match, the
probe returns `runtime-version-drift` instead of attempting compatibility.

Optional runtime-location overrides:

- `VCSKILL_CODEX_HOME`: controller-selected Codex home.
- `VCSKILL_CLAUDE_CONFIG_DIR`: isolated Claude configuration directory, useful
  with `ANTHROPIC_API_KEY`.
- `VCSKILL_CLAUDE_AUTH_HOME`: Claude OAuth authentication home. Safe mode still
  disables CLAUDE.md, skills, plugins, hooks, MCP servers, custom commands,
  agents, and other customizations.

Both adapters use argument arrays with no shell, send the untrusted instruction
through stdin, require schema-bound output, restrict evidence to workspace-
relative paths, bound output and time, and reap their complete owned process
tree on success, failure, timeout, or cancellation. Claude exposes only
Read/Glob/Grep and therefore does not claim the broader `process:execute`
capability.

## Durable state and privacy

Run data lives under `~/.vcskill/runs/<run-id>/` by default. Run storage must be
outside the read-only workspace.

| File | Purpose | Content boundary |
|---|---|---|
| `manifest.json` | Immutable graph/runtime/workspace/instruction identity | Digests and categorical metadata only |
| `events.jsonl` | Append-only control transitions | No prompt or application-state values |
| `checkpoint.json` | Durable reduced control state | Graph/node/status/version metadata |
| `state-current.json` | Application state for exact resume | May contain sensitive task state |
| `state-previous.json` | Previous write-ahead state | Crash-consistency fallback |
| `cancel-request.json` | Cooperative cancellation marker | Timestamp and integrity seal |

Directories are forced to mode `0700` and files to `0600` where the platform
supports POSIX modes. Stored envelopes are strict, size-bounded, sealed, and
fail closed on corruption. Application snapshots use write-ahead persistence:
the state for sequence N is durable before event N, while the previous slot
preserves sequence N-1 if the event append fails.

The command's JSON response may intentionally contain result state for the
caller. Do not redirect it to a public log when the task is sensitive.

## Stable machine output

Every lifecycle response is a JSON object with `schemaVersion: 1`, `action`,
`ok`, and `status`. Available fields add workflow/run/runtime identity, a graph
summary, the capability probe, and the normalized run result. Provider stdout,
stderr, prompts, and raw traces are not forwarded into durable control records.

Common non-success states include:

- `unsupported`: missing runtime, version/flag drift, missing capability, or
  ambiguous capability-driven selection.
- `policy-denied`: graph authority exceeds the public command's read-only policy.
- `approval-required` or `reconciliation-required`: the internal runner reached
  a guarded side-effect boundary.
- `cancelled` or `failed`: terminal durable outcomes.

## Recovery and cancellation

The event stream is authoritative for control state. Checkpoints accelerate and
verify recovery; they do not replace replay. Resume rejects truncated or
semantically corrupt records, incompatible graph/runner versions, missing exact
state snapshots, workspace drift, instruction drift, and runtime identity drift.

`cancel` writes a sealed marker. The active controller reads an existing marker
before execution and then polls it into an `AbortSignal`; each adapter terminates
and force-reaps only its owned process group. Status and emergency cancellation
remain available across graph upgrades, while resume still refuses incompatible
graph or runner identity. Cancellation is idempotent, including when a run is
already terminal.

### Upgrade and paused-run policy

V1 has no automatic run-state migration. A paused run is bound to its compiled
graph digest and runner contract, plus the original runtime version and model.
After an incompatible vcskill upgrade, `resume` fails with an actionable refusal:
use the original vcskill version to finish the run or start a new run. `status`
and emergency `cancel` continue to operate from the stored manifest even when
the currently installed graph has changed.

Never move a release tag or reinterpret persisted events to repair an
incompatible run. If a future release adds migration, it must be explicit,
versioned, idempotent, reversible, and tested against frozen old-state fixtures.

## Context retrieval boundary

Local context lookup uses a lexical metadata index plus a bounded deterministic
artifact graph. The graph derives only source-declared workflow handlers,
scenario subjects, `vc:*` references, and relative documentation links. Results
carry repository-relative provenance and a content digest; refresh replaces the
in-memory index so updates and deletions cannot retain stale bytes, and private
artifacts are excluded before edges are built.

This layer has no graph database, vector store, embedding/model call, temporal
memory, or provider-side persistence. The lexical index remains the rollback
path. Adoption evidence and the threshold decision are recorded in
[decision 0005](decisions/0005-context-graph-adoption.md).

## References

- [Graph-native control-plane decision](decisions/0004-graph-native-control-plane.md)
- [Context graph adoption decision](decisions/0005-context-graph-adoption.md)
- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-usage)
- [Claude Code headless mode](https://code.claude.com/docs/en/headless)
- [Claude Code permission modes](https://code.claude.com/docs/en/permission-modes)
- [Claude Code sessions](https://code.claude.com/docs/en/sessions)
