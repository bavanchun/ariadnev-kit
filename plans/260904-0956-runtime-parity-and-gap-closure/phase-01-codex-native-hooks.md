---
phase: 1
title: "Codex native hooks and output adapter"
status: completed
priority: P1
effort: 8h
dependencies: [0]
---

## Overview

Closes issue #134, the only open issue in the repository. Codex 0.153.1 has a
real, stable, schema-strict hook surface; `spec-verified.ts:95-112` records
`hook: none(...)`, so the hook gate in `planHooks` emits a skip op for all 14
hooks and `README.md:276` renders `hook | … | skip`. Codex users are therefore
left on legacy wrappers, where a blocking `PreToolUse` result is rejected as
invalid JSON instead of producing a clean deny.

Phase 0 makes the hooks tree provider-directed and separates the install-write
switch (`hooksInstall`) from the ladder grade. This phase supplies codex's
values for that surface, writes the `hooks.json` merger, and makes the shared
hook corpus emit Codex-schema-valid output. It does not re-plumb any path — that
work is done before this phase starts.

### The grade this reaches, and why it stops there

The cell lands at **`convention`**, not `observed`.

The tempting evidence is `~/.codex/config.toml`'s `[hooks.state]` table: Codex
parsed `~/.codex/hooks.json`, a project-local `Capstone/.codex/hooks.json`, and
three plugin-bundled `hooks/hooks.json` files, split each into `(event, group,
hook)` triples, and persisted a `trusted_hash` per
`<source>:<event_snake_case>:<group_idx>:<hook_idx>` key.

That proves the *file format and the discovery paths* are real, and that Codex
loads them. It does not prove Codex loaded **ariadnev's** hooks, because
ariadnev has never written one — every entry in that table belongs to another
tool. The ladder's `observed` rung requires the provider to have been run and
seen to load *the artefact this kit installs*. Confirming that needs a Codex
session with ariadnev's hooks trusted through the TUI, which spends model
credits, and this plan does not spend them.

`convention` is the honest and sufficient rung, and it is exactly how `cursor`,
`omp` and `antigravity` are already handled: the layout is the one observed
working — here, observed working *in Codex itself* for three other tools, which
is stronger than the neutral-cross-tool-layout case `convention` usually rests
on. The note must say precisely that, and must not imply ariadnev's own hooks
were watched loading.

`observedVersion` and `observedOn` on the codex row are **not** re-pinned. They
date the `skill` and `agent` cells' `codex debug prompt-input` observation on
0.147.0; moving them to 0.153.1 without re-running that probe would silently
re-date evidence nobody re-collected. Phase 0 splits `OBSERVED_ON` so this row
has its own literal; this phase leaves that literal alone and puts the 0.153.1
version into the hook cell's note, where it is scoped to the cell it describes.

## Requirements

1. Lift `codex.paths.hook` from `none` → `convention`, with a note that names
   codex-cli 0.153.1, names the `[hooks.state]` evidence, and states explicitly
   that the observed loads were other tools' hooks. Leave `observedVersion` and
   `observedOn` untouched.
2. Set codex's Phase 0 hooks fields: `hooksDir: CODEX_HOOKS_DIR`,
   `hooksConfigFile: CODEX_HOOKS_CONFIG_FILE`, `hooksConfigFormat:
   "codex-hooks-json"`, `hooksInstall: true`.
3. Write `~/.codex/hooks.json` **merge-safely**: read-modify-write, one
   ariadnev-owned group per event, ours identified by the install-dir command
   prefix, idempotent on re-install, and removing only our groups on uninstall.
4. Emit Codex-schema-valid decisions from the shared hook corpus, driven by the
   runtime marker Phase 0 made provider-directed.
5. Fix the pre-existing latent Codex incompatibility at
   `kit/hooks/plan-format-kanban/hook.cjs:99`.
6. Detect a legacy `ck migrate` wrapper **without executing it**, and report it
   with a copy-pasteable remediation.
7. Tell the user, in the install summary, that Codex hook trust is an
   interactive TUI step the installer cannot perform.
8. Regenerate the provider matrix and README block; the drift gate proves it.

## Architecture

### What Phase 0 already provides

`ProviderConfig` carries `hooksDir`, `hooksConfigFile`, `hooksConfigFormat` and
`hooksInstall`; `planHooks` builds every destination from `r.hooksTarget(ctx)`;
the `hook-settings` op carries a `format` field and `opContent`
(`install-execute.ts:52-62`) dispatches on it; `uninstall-plan.ts:237-246` reads
the same two resolver values; and `provider-paths.cjs` resolves the config dir
from the runtime marker rather than a directory named `.claude`.

This phase therefore adds **no new op action**. It adds a second merger behind
the existing `hook-settings` action's `format` discriminator. That is what keeps
the reconciler (`shared-writes.ts:48-50`), the consent gate
(`install-execute.ts:91`), the receipt and the uninstall path correct without
five parallel edits.

### Path constants

`CODEX_HOOKS_DIR = ".codex/hooks/av"` and `CODEX_HOOKS_CONFIG_FILE =
".codex/hooks.json"` go in `packages/cli/src/adapt/paths.ts` beside
`CLAUDE_HOOKS_DIR` (`paths.ts:37`) — the single-source rule — and are referenced
only from codex's resolver literal.

### Merge module

`packages/cli/src/install/codex-hooks-merge.ts`, modelled on
`hook-settings-merge.ts:39-50`: pure, no fs, throws on unparseable input rather
than clobbering. The Codex envelope is
`{"hooks": {"<EventName>": [{ "matcher"?, "hooks": [handler] }]}}`. Ariadnev
adds **one group per event** into that event's array — the file's own extension
point — never appending into another writer's `hooks[]`. Ownership predicate:
every handler `command` in the group starts with the ariadnev hooks install
prefix. Handler fields are restricted to `{type: "command", command, timeout}`,
the only shape observed on disk; `command_windows`, `statusMessage`,
`additionalContextLimit`, `async` and the `mcp_tool` handler type are docs-only
and are not designed against.

Codex's `hooks.json` has no `statusLine` key and no statusline concept, so
codex's `statusline` cell stays `none` and no statusline op is planned for it —
Phase 0's conditional emission handles that without a special case here.

### Output adaptation — the design fork issue #134 leaves open

Two candidates: per-provider wrappers generated at install time, or one corpus
that switches on a runtime marker. This plan takes the **runtime-marker** route,
because the marker already exists and already names codex:
`kit/hooks/_lib/runtime-state-identity.cjs:13` reads
`SUPPORTED_RUNTIMES = new Set(['claude-code', 'codex'])`, and the marker is
already a planned write. Wrappers would mean a second artefact per hook to
install, back up, receipt and uninstall — the DRY loss is not paid for by
anything.

A new `kit/hooks/_lib/hook-output.cjs` becomes the single emitter. It exposes
`emitDecision(event, decision)` and `emitContext(event, text)` and shapes them
per runtime. The Codex shapes are the fetched schemas, all
`additionalProperties: false`:

| Event | Valid top level | Nested |
|---|---|---|
| PreToolUse | `continue`, `decision: "approve"\|"block"`, `reason`, `stopReason`, `suppressOutput`, `systemMessage` | `hookSpecificOutput.{hookEventName:"PreToolUse", permissionDecision:"allow"\|"deny"\|"ask", permissionDecisionReason, additionalContext, updatedInput}` |
| PostToolUse | `continue`, `decision:"block"`, `reason` | `hookSpecificOutput.{hookEventName:"PostToolUse", additionalContext, updatedMCPToolOutput}` |
| PermissionRequest | — | `hookSpecificOutput.{hookEventName:"PermissionRequest", decision:{behavior, message}}` |
| SessionStart | `continue`, `stopReason`, `suppressOutput`, `systemMessage` | `hookSpecificOutput.{hookEventName:"SessionStart", additionalContext}` |

Three rules the emitter enforces and a test names: `permissionDecision` is never
a top-level key (that exact shape is what #134 reproduces); `additionalContext`
is never a top-level key; and `interrupt` / `updatedInput` / `updatedPermissions`
are never emitted on `PermissionRequest` — the schema's own description says
hooks "currently fail closed if present", so setting them denies rather than
no-ops.

**SessionStart output is always wrapped for the codex runtime.** Whether 0.153.1
also tolerates plain-text stdout there is unknown and can only be settled by a
live session, which this plan does not run. The wrapped
`hookSpecificOutput.additionalContext` form is schema-valid either way, so it is
the correct choice under uncertainty rather than a fallback waiting on a probe.

Validation is hand-rolled (four small shape checks), matching the repo's
no-ESLint, hand-rolled-adapter posture, rather than adding `ajv` to the hook
surface. `packages/cli` already depends on `ajv` for config, but the hook corpus
is dependency-free by design.

**Exit-2 path is unchanged.** `privacy-block` and `scout-block` already use
`process.exit(2)` + stderr, which Codex documents as equivalent to
`{"decision":"block","reason":"<stderr>"}` and which takes priority over any
JSON. No adaptation needed; a contract test pins the behaviour.

**Event coverage.** All 8 events the kit binds (`PostToolUse` ×4,
`UserPromptSubmit` ×4, `PreToolUse` ×3, `Stop` ×3, `SubagentStart` ×2,
`SessionStart`, `SubagentStop`, `PreCompact` — 19 bindings) exist in Codex's
wire protocol, and all except `PreCompact` had live trust entries on the
observation machine. `PreCompact` had a `config.toml` trust key but no observed
firing; `precompact-capture` is the only hook bound to it and already exits
without writing when the runtime marker is missing, so a `PreCompact` that never
fires on Codex degrades to nothing rather than to an error.

### Legacy wrapper handling — inspect, never execute

An earlier draft of this phase proposed running each foreign `command` from an
installed `hooks.json` against a synthetic `PreToolUse` fixture and validating
its stdout. **That is remote code execution at install time.** `hooks.json` is a
file ariadnev does not own; a project-local `<repo>/.codex/hooks.json` arrives
with a cloned repository, and executing its commands means `av install` runs
arbitrary code from that clone. This is the same threat `install-surface.ts:1-17`
already documents for `backups restore` — a manifest inside the clone cannot be
trusted to describe what may run.

Detection is therefore **static and read-only**:

- Parse the `hooks.json` files at the three discovery paths.
- Report every group whose handler commands are *not* ariadnev-owned, by
  command string, with no interpretation of what they do.
- Flag the specific legacy shape by path, not by behaviour: a handler whose
  command resolves inside a known upstream install directory, or whose command
  string matches the documented `ck migrate` wrapper form.
- Print the copy-pasteable remediation and stop. The user runs it, or does not.

Auto-heal fires only on groups ariadnev owns by the install-dir prefix — those
are files this binary wrote, so rewriting them executes nothing foreign. A
foreign wrapper is never healed and never executed. The cost is that a
dynamically-built legacy JSON emitter cannot be positively identified; that is
the correct trade, and the remediation text covers it by describing the symptom
(`Hook failed` on a blocking decision) rather than asserting a diagnosis.

## Related Code Files

**Create**
- `packages/cli/src/install/codex-hooks-merge.ts` — pure `hooks.json` merger/remover.
- `packages/cli/src/install/codex-hooks-merge.test.ts` — merge-safety, idempotence, uninstall.
- `packages/cli/src/install/codex-legacy-wrapper.ts` — static detection + remediation text, no execution.
- `packages/cli/src/install/codex-legacy-wrapper.test.ts`
- `packages/cli/src/cli/install-command.test.ts` — the trust notice and the legacy-wrapper report, from files read and never run.
- `kit/hooks/_lib/hook-output.cjs` — the single runtime-aware emitter.
- `kit/hooks/_lib/__tests__/hook-output.test.cjs`
- `kit/hooks/__tests__/codex-hook-contract.test.cjs` — the #134 fixtures (deny, exclusion-glob allow) as provider-contract tests.

**Modify**
- `packages/cli/src/providers/spec-verified.ts:95-112` — codex `hook` cell → `convention`; nothing else on the row.
- `packages/cli/src/providers/resolver.ts` — codex's four Phase 0 hooks fields.
- `packages/cli/src/adapt/paths.ts` — add `CODEX_HOOKS_DIR`, `CODEX_HOOKS_CONFIG_FILE` beside line 37.
- `packages/cli/src/install/install-execute.ts:52-62` — `opContent` dispatches `format: "codex-hooks-json"` to the new merger.
- `packages/cli/src/uninstall/uninstall-execute.ts:64-76` — the same dispatch on the unmerge side.
- `packages/cli/src/doctor/hook-repair.ts` — repair a codex hooks.json binding, not only a settings.json one.
- `packages/cli/src/install/hook-settings-merge.ts` — `renderHookSettingsSnippet` takes the merged file and its destination, so the declined-merge block names the registry the provider actually reads.
- `packages/cli/src/install/hook-settings-merge.test.ts`, `packages/cli/src/cli/cli-commands.test.ts` — the same, asserted per provider.
- `packages/cli/src/cli/install-command.ts:123-137` — the trust-step notice, beside `renderNoTargetWarning` (`:81`) and `renderHealSummary` (`:56`). *(An earlier draft named `install-surface.ts`; that file is a write allowlist and renders nothing.)*
- `packages/cli/src/providers/provider-matrix.test.ts:32` — the codex hook lock.
- `packages/cli/src/providers/spec-evidence.test.ts` — codex hook assertions.
- `kit/hooks/plan-format-kanban/hook.cjs:99` — nest `additionalContext`.
- `kit/hooks/README.md` — the Claude-Code-only framing in the opening paragraph.
- `README.md:267-279` — regenerated matrix block.
- `docs/decisions/0006-provider-verification-evidence.md` — codex hook evidence.
- `packages/cli/scripts/test-codex-runtime.mjs:19` — pin bump to `0.153.1` (edit only; the script is gated behind `ARIADNEV_LIVE_CODEX=1` and spends credits, so it is not run).

**Delete** — none.

## Implementation Steps

1. Write the failing test in `codex-hooks-merge.test.ts` first: a fixture
   `hooks.json` carrying two third-party groups plus a plugin-bundled group,
   asserting that merging ariadnev's bindings preserves every foreign group
   byte-for-byte, that a second merge is a no-op, and that removal deletes only
   groups whose handler commands start with the ariadnev prefix.
2. Implement `packages/cli/src/install/codex-hooks-merge.ts` against it.
3. Add `CODEX_HOOKS_DIR` and `CODEX_HOOKS_CONFIG_FILE` to
   `packages/cli/src/adapt/paths.ts`.
4. Fill codex's four hooks fields in the resolver. Update
   `packages/cli/src/providers/resolver.test.ts` for the new codex targets, and
   assert every other provider's hook target is unmoved.
5. Register `"codex-hooks-json"` in the `hooksConfigFormat` union and dispatch it
   in `opContent` (`install-execute.ts:52-62`) and in the unmerge branch
   (`uninstall-execute.ts:64-76`).
6. Write the failing `kit/hooks/__tests__/codex-hook-contract.test.cjs` fixtures
   from issue #134: a `PreToolUse` payload reading `node_modules/pkg/index.js`
   must produce a schema-valid deny with no top-level `permissionDecision`; the
   command `find . -name package.json -not -path '*/node_modules/*'` must stay
   allowed. Assert the emitted JSON shape, not just the exit code.
7. Implement `kit/hooks/_lib/hook-output.cjs` and migrate the emitting hooks to
   it one at a time: `descriptive-name`, `secret-output-guardrail`,
   `simplify-gate`, `subagent-init`, `team-context-inject`,
   `cook-after-plan-reminder`, `plan-format-kanban`, `session-init`. Claude Code
   output must be byte-identical to today's for every one of them — assert that
   explicitly before adding any codex branch.
8. Fix `kit/hooks/plan-format-kanban/hook.cjs:99` to emit
   `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":…}}`
   through the emitter.
9. Implement `packages/cli/src/install/codex-legacy-wrapper.ts` as a **pure
   parser**: it takes the parsed `hooks.json` contents and the ariadnev install
   prefix and returns a report. It does not read files, does not spawn
   processes, and its test asserts that — a test that fails if the module ever
   imports `child_process`. Wire the report into the install summary.
10. Add the trust notice at `packages/cli/src/cli/install-command.ts:123-137`:
    after a codex hook install, state that hooks stay untrusted until the user
    runs Codex's TUI `/hooks`, and that `--dangerously-bypass-hook-trust` is a
    per-session user flag, not an install fix. Verified in the research: no
    `codex hooks` CLI subcommand exists in `codex --help`'s command list.
11. Flip `packages/cli/src/providers/spec-verified.ts` codex `hook` to
    `convention` with the note specified in the Overview. Update
    `spec-evidence.test.ts` and `provider-matrix.test.ts:32`. Confirm
    `observedVersion` and `observedOn` on that row are unchanged in the diff.
12. Regenerate the matrix: `pnpm --filter ariadnev generate:matrix`, then run
    `packages/cli/src/providers/matrix-drift.test.ts`.
13. Update `docs/decisions/0006-provider-verification-evidence.md` and
    `kit/hooks/README.md`; bump the pin in
    `packages/cli/scripts/test-codex-runtime.mjs:19`.
14. `npx vitest run packages/cli/src/install packages/cli/src/providers`, then
    `node --test kit/hooks/__tests__/codex-hook-contract.test.cjs` and the
    emitter suite, then `pnpm lint`.
15. Run `pnpm --filter ariadnev generate:embedded` as this phase's last step.
    Deferring it to whichever `kit/`-touching phase lands last is not an option:
    `embedded-kit.test.ts` guards the artifact against drift, so any phase that
    adds a `kit/` file and does not regenerate leaves the suite red for every
    phase after it. The single-writer constraint from phase 0, step 14 still
    holds and is what makes this safe — phases 1, 4 and 5 regenerate one after
    another, never two at once.

## Success Criteria

- [x] A Codex `PreToolUse` fixture reading `node_modules/pkg/index.js` is denied with schema-valid JSON and no top-level `permissionDecision`.
- [x] `find . -name package.json -not -path '*/node_modules/*'` remains allowed under the same fixture harness.
- [x] Claude Code hook output is byte-identical before and after the emitter migration, and every existing hook test passes unchanged.
- [x] `ariadnev install --provider codex --dry-run` plans writes to `~/.codex/hooks/av/*.cjs` and a `~/.codex/hooks.json` merge, and no other provider's hook target moved.
- [x] Merging into a `hooks.json` fixture containing two third-party groups and a plugin group leaves every foreign group unchanged; a second merge is a no-op; removal deletes only ariadnev groups.
- [x] `plan-format-kanban` emits `hookSpecificOutput.additionalContext` with `hookEventName: "PostToolUse"` and no top-level `additionalContext`.
- [x] `codex-legacy-wrapper.ts` executes nothing: a test asserts the module has no `child_process` / `execFile` / `spawn` reference, and detection runs against parsed JSON only.
- [x] A legacy wrapper fixture produces a copy-pasteable remediation; an ariadnev-owned wrapper is healed instead.
- [x] The install summary states the TUI trust step.
- [x] README matrix regenerated; `matrix-drift.test.ts` green; `provider-matrix.test.ts` codex hook expectation updated.
- [x] `spec-verified.ts` codex `hook` reads `convention`, its note names codex-cli 0.153.1 and states the observed loads were other tools' hooks, and the row's `observedVersion` / `observedOn` are untouched in the diff.
- [x] Codex uninstall removes only ariadnev's `hooks.json` groups and touches no `~/.claude/settings.json` (Phase 0's guarantee, re-asserted here with codex as the concrete provider).
- [ ] Issue #134 closed referencing all five of its checkboxes.

## Risk Assessment

| Risk | Observable signal | Pre-decided response |
|---|---|---|
| `convention` is read as "verified, therefore safe to write blindly" | A future phase flips another provider's cell and writes appear | Phase 0's `hooksInstall` switch is the write authority; the assertion that `hooksInstall` implies a verified cell is one-directional by design |
| Wrapped `SessionStart` output is not what Codex wants either | A live user reports session context missing on Codex | The wrapped form is schema-valid by the fetched schema; if it still fails, the fix is in the emitter's codex branch alone, and the Claude Code branch is untouched by construction |
| `PreCompact` / `SessionEnd` never fire outside experimental app-server mode | No trust entry appears for the ariadnev PreCompact group after a real session | Leave the binding in place; `precompact-capture` already no-ops without a runtime marker. Record the non-firing in the evidence note rather than claiming the event works |
| The merger clobbers a third party's `hooks.json` on a real machine | Foreign group count drops in the post-install file | The fixture test in step 1 is written before the merger and is the gate; if it ever fails, the install op is not emitted at all — a skip is correct, a clobber is not |
| Hook hash changes on release silently invalidate trust | A trusted hook stops firing after `av update` with no message | Surface it in the install summary alongside the trust step; the exact re-trust behaviour is an open question that cannot be resolved without a live session |
| The emitter migration changes Claude Code output subtly | Any existing hook test diff | Step 7's byte-identity assertion runs before any codex branch is added; migrate one hook at a time |
| Static wrapper detection misses a dynamically-built legacy emitter | A user reports `Hook failed` that the installer never flagged | Accepted. The remediation text describes the symptom rather than asserting a diagnosis, and executing foreign commands to close this gap is the vulnerability this phase deliberately does not ship |

## Rollback

The merger, the emitter and the legacy detector are new files; the evidence cell
and the four resolver fields are one-line reverts. Reverting the phase leaves
codex's `hook` cell at `none` and the installer skipping, which is the current
behaviour. No installed Claude Code tree is affected at any point.
