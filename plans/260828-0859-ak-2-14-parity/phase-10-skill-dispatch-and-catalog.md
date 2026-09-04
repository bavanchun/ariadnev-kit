---
phase: 10
title: "Skill dispatch and catalog"
status: completed
priority: P1
effort: "5-10d"
dependencies: [2, 9]
---

# Phase 10: Skill dispatch and catalog

## Overview

The command AgentKit users mean when they say `ak`: `av run <kit>/<skill>
--target <adapter>`, dispatching a skill to a coding agent as a subprocess and
streaming its output. Plus the per-skill runtime envs that dispatch activates,
the Codex MCP runtime, and the three catalog commands.

Large, and the phase where the `run` shim from phase 2 finally retires.

## Requirements

**Functional**
- `av run <kit>/<skill> [args…]` with `--target`, `--timeout`, `--json`,
  `--kits-dir`. SIGINT honored.
- `av skill install|remove|repair|upgrade|verify <kit>/<skill>` — per-skill
  runtime envs.
- `av agents install|list|remove|search|show`.
- `av commands install|list|remove|search|show`.
- `av skills install|list|remove|search|show|graph`.
- `av codex-agent-runtime serve|register|unregister`.
- The phase-2 `run` shim is **retained through 1.3.0** and removed in 1.4.0 —
  see `plan.md`, "The `run` collision". This phase makes dispatch work; it does
  not delete the fallthrough.
- `run` inherits **no** legacy JSON or exit-code exemption — phase 2 moved those
  to `workflow`, and dispatch must not silently acquire them.

**Non-functional**
- Streaming, not buffering. A dispatched skill can run for minutes; output
  appears as it is produced.
- SIGINT propagates to the child and the child is reaped. No orphans — the
  process-management rule is explicit that abandoned dev processes accumulate
  and exhaust the machine, and this command spawns processes by design.
- `--timeout` kills cleanly: TERM, grace, then KILL.
- Exit codes propagate from the child.
- Per-skill envs are ariadnev-owned and removable without touching the cache.

## Architecture

**Oracle.** `ak run --help`: *"Resolve `<kit>/<skill>` and dispatch it to the
configured adapter (`--target claude-code, codex, cursor, dsh, grok, omp`).
Streams stdout/stderr; honors SIGINT and `--timeout`."* `ak skill --help` draws
the boundary crisply: *"For catalog browsing — list, install, remove — see `ak
skills`. This command operates on a single per-skill runtime env"* — the
`skill`/`skills` split is deliberate, not a typo, and ariadnev should preserve it
even though it reads oddly.

**Four separable pieces**, and they should land as four commits:

1. **Resolution** — `<kit>/<skill>` → an on-disk skill directory, per `--kits-dir`
   or `$ARIADNEV_KITS_DIR` or `./kits`. Pure, easy to test, no subprocess.
2. **Dispatch** — build the adapter invocation and spawn. Per-adapter, and gated
   on phase 9's matrix: dispatching to an unverified provider is refused, not
   guessed, for the same reason installing to one is.
3. **Streaming and lifecycle** — pipe stdout/stderr through, forward SIGINT,
   enforce `--timeout`, reap, propagate exit code.
4. **Catalog** — `agents`/`commands`/`skills`, all read-mostly over the kit tree
   and the install receipt. These share one implementation over an artifact-kind
   parameter; three copies of the same five verbs is exactly the duplication
   `--json` envelope tests will later have to keep in sync.

**`codex-agent-runtime`** is different in kind: a long-lived MCP stdio server
registering discovered agents as tools, plus idempotent register/unregister
against `~/.codex/config.toml`. The registration half is small and safe; the
serve half is a daemon. Land registration first — it is independently useful and
independently revertable.

**The shim stays.** Once `run <kit>/<skill>` dispatches, the no-slash
fallthrough keeps working and keeps warning, through 1.3.0; it is deleted in
1.4.0. Deleting it here would ship a deprecation warning no stable user ever
sees. The discriminator stays unambiguous indefinitely (dispatch requires a
slash), so retaining it costs nothing. What this phase owes is that dispatch and
fallthrough coexist. The
release checklist verifies it rather than performing it.

## Related Code Files

- Create: `packages/cli/src/dispatch/resolve-skill-ref.ts` + test
- Create: `packages/cli/src/dispatch/adapter-invocation.ts` + test
- Create: `packages/cli/src/dispatch/spawn-stream.ts` + test — streaming, signals, timeout
- Create: `packages/cli/src/cli/run-dispatch-command.ts` + test
- Create: `packages/cli/src/cli/catalog-artifact-command.ts` + test — shared by three commands
- Create: `packages/cli/src/cli/agents-command.ts`, `commands-command.ts`, `skills-command.ts`
- Create: `packages/cli/src/skill-env/lifecycle.ts` + test
- Create: `packages/cli/src/cli/codex-agent-runtime-command.ts` + test
- Modify: `packages/cli/src/cli/skill-env-command.ts` — extend to the five verbs
- Modify: `packages/cli/src/cli/run-shim.ts` — the reserved-grammar branch now dispatches instead of erroring; the file is **not** deleted until 1.4.0
- Modify: `packages/cli/src/cli/register-harness-commands.ts` — drop the fallthrough
- Modify: `parity-manifest.json`

## Implementation Steps

1. **Oracle observation.** Capture `ak run --help`, `ak skill <verb> --help`,
   `ak agents|commands|skills <verb> --help`, `ak codex-agent-runtime --help`,
   and `--json` envelopes from `skills list` and `agents list`. Record the
   `skill`/`skills` boundary wording verbatim — it is the part most likely to be
   "tidied" into an inconsistency later.
2. Failing tests first for `resolve-skill-ref.ts`: valid ref, missing kit,
   missing skill, a ref with no slash (must error, since phase 2 reserved it).
3. Implement resolution. Pure — no spawn, no fs beyond a stat.
4. Implement `adapter-invocation.ts` per adapter, **gated on phase 9's matrix**.
   An unverified provider is refused with the same skip-and-log honesty the
   installer uses.
5. Implement `spawn-stream.ts`. Tests first for the three lifecycle properties:
   SIGINT reaches the child, `--timeout` escalates TERM → grace → KILL, and the
   child's exit code propagates. Assert **no orphan survives** any of the three
   paths — this is the phase that can leave processes behind.
6. Wire `av run <kit>/<skill>`.
7. **Keep `run-shim.ts`.** Assert dispatch and the warning fallthrough coexist:
   `av run kit/skill` dispatches, `av run <no-slash>` still runs the harness and
   still warns. Its comment names 1.4.0 as the removal release.
8. Implement `skill-env` lifecycle: install, verify, repair, upgrade, remove.
   `remove` drops the record and leaves the cache — the oracle is explicit about
   this and it is the right call, since re-resolving is cheap and re-downloading
   is not.
9. Implement the shared catalog command over an artifact-kind parameter; register
   it three times as `agents`, `commands`, `skills`. Add `skills graph`.
10. Implement `codex-agent-runtime register|unregister` — atomic write, prior file
    backed up. **Mechanism: a delimited managed block**
    (`# >>> ariadnev managed` … `# <<< ariadnev managed`), rewritten only between
    the markers. This is what makes "idempotent" and "never rewrite the whole
    file from a parsed model" compatible: string surgery on arbitrary TOML is not
    idempotent in general, and a parse-and-reserialize round trip silently drops
    whatever the parser did not understand — in a file shared with other tools.
    Then `serve`.
11. Emit activity events for dispatch start and exit.

## Success Criteria

- [x] `av run <kit>/<skill> --target <adapter>` dispatches and streams
- [x] SIGINT reaches the child; **no orphan process survives** — asserted
- [x] `--timeout` escalates TERM → grace → KILL
- [x] Child exit codes propagate
- [x] Dispatch to an unverified provider is refused, not guessed
- [x] **`av run kit/skill` dispatches and `av run <no-slash>` still warns** — both asserted; the shim survives into 1.3.0
- [x] All five `skill` env verbs work; `remove` leaves the cache
- [x] `agents`, `commands`, `skills` share one implementation
- [x] `codex-agent-runtime register` is idempotent and backs up the prior TOML
- [x] `pnpm test` green

## Risk Assessment

**Orphaned processes.** This command spawns coding agents; a mishandled signal
leaves them running. This machine has already been rebooted once by runaway
parallel test workers.
*Signal:* a process alive after the parent exits, in any of the three lifecycle
paths. *Response:* step 5 asserts all three. Track the child PID, reap on every
exit path including the error path, and escalate rather than assume TERM worked.

**Buffered output makes long runs look hung.** A dispatched skill can run for
minutes.
*Signal:* output appearing only at exit. *Response:* streaming is a success
criterion with its own test, not an implementation detail.

**Editing `~/.codex/config.toml` corrupts a user's config.** It is a file
ariadnev does not own, shared with other tools.
*Signal:* a non-idempotent register, or a lost unrelated key.
*Response:* atomic write, prior file backed up, idempotency asserted by running
register twice and diffing. Never rewrite the whole file from a parsed model —
that silently drops what the parser did not understand.

**Three catalog commands drift apart.** Five verbs × three artifact kinds is
fifteen chances to diverge.
*Signal:* a `--json` envelope differing in shape between `agents list` and
`skills list`. *Response:* one implementation, parameterized (step 9).

**The shim outlives its deprecation window.** The risk is no longer that it
survives this phase — it is meant to — but that 1.4.0 ships with it still there.
*Signal:* `run-shim.ts` present in a 1.4.0 release candidate. *Response:* its
own comment names 1.4.0, and removal is the first item of that release's scope.
Deprecation shims are famously immortal, so the date lives in the file rather
than in anyone's memory.


## Corrections to this phase document

Written during planning, before the code was read. Three items did not survive
contact with the repository.

**`codex-agent-runtime` is out of scope, not in it.** This document lists it in
Requirements, Related Code Files, Implementation Steps and Success Criteria.
`parity-manifest.json` marks it `"status": "excluded"`, and
`parity-ratchet.test.ts` pins it in a frozen list of "the six names this plan
decided to exclude" — a list whose own comment says it exists so that "a later
phase cannot improve the parity number by reclassifying a command instead of
building it." The manifest and its test are the parity authority; this prose is
not. Building it would have added a daemon and an editor for a TOML file
ariadnev does not own, in service of a command the plan had already decided it
does not need, for zero movement on the ratchet. The exclusion note is also
correct on the merits: ariadnev reaches codex through its harness executor,
which is not a command surface.

**`skill`'s five verbs already existed.** Step 8 and the Related Code Files
entry say to "extend `skill-env-command.ts` to the five verbs". All five —
install, verify, repair, upgrade, remove — plus `run` were already implemented
and registered. The one real difference from upstream is the argument: upstream
takes `<kit>/<skill>`, ariadnev takes a bare skill name, because ariadnev ships
one embedded kit. Nothing was changed here.

**Dispatch does not get exit codes 4 and 5.** Upstream's `ak run --help`
documents `4 unmet dependency` and `5 kit or skill not found`. This project has
a four-value exit table that predates dispatch and is pinned by a regression
test, and this phase's own requirement is that `run` inherits no exemption from
it. The two upstream codes therefore map onto the existing table — not found is
`2`, a missing adapter binary is `3` — and the compromise is recorded in
`resolve-skill-ref.ts`: a script cannot tell a typo from a deleted kit on the
code alone, only on the message.

## What the adapter table could actually verify

The plan says dispatch is "gated on phase 9's matrix". That gate is necessary
but not sufficient: phase 9 verified where a provider's *files* go, which says
nothing about how to *invoke* it. So the invocation table was built the same way
phase 9's matrix was — by measurement. Each entry was read off that binary's own
`--help` on this machine:

| provider | binary | non-interactive | prompt |
|---|---|---|---|
| claude-code | `claude` | `-p` | positional |
| codex | `codex` | `exec` | positional |
| cursor | `cursor-agent` | `-p` | positional |
| omp | `omp` | `-p` | positional |

`grok` and `dsh` are not installed here, so neither could be read the same way
and neither gets an entry. Both are refused with the skip-and-log honesty the
installer uses for an unverified cell.

## What binary verification caught

Two defects that no unit test in this phase would have found, because both were
defects in what the tests were asserting *about*:

1. **`list --installed` reported nothing after a successful install.** Installed
   state was derived from the receipt by matching an artifact's name against its
   file paths — but the installed directory is `av-scout`, not `scout`, so the
   match answered "no" for everything. Replaced with the resolver's own
   `targetFor` plus a filesystem check, which cannot be wrong in that way and
   also sees an install this command did not perform.
2. **`remove` left the artifact's directory standing.** Deleting the planned
   files left an empty `.claude/skills/av-scout`, and since `list` decides from
   that directory's existence, a removed skill still reported as installed. Now
   pruned with the same `cleanEmptyDirsUpward` helper uninstall uses, including
   its refusal to climb past a kind root.

## Ratchet

`agents`, `skills` and `commands` registered: missing 11 → 8.
