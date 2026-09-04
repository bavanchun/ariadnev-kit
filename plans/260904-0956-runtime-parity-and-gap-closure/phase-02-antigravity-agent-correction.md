---
phase: 2
title: "Antigravity: correct the agent cell, lift the hook cell"
status: in-progress
priority: P1
effort: 8h
dependencies: [0]
---

## Overview

This phase corrects a **live installer defect**: ariadnev writes 16 agent files
to `~/.gemini/config/agents/*.md` on a rationale that does not hold.

### What is actually wrong

The rationale in the source is circular. `resolver.ts:112-134` and
`spec-verified.ts:137` justify the cell on the grounds that "the 16 `.md` files
in `~/.gemini/config/agents/` are that observation" and that they "predate
ariadnev, so something else wrote a full agent roster into exactly this path."
Those 16 files are `advisor.md`, `brainstormer.md`, `code-reviewer.md`,
`code-simplifier.md`, `debugger.md`, `docs-manager.md`, `Explore.md`,
`fullstack-developer.md`, `git-manager.md`, `journal-writer.md`, `kongming.md`,
`planner.md`, `project-manager.md`, `researcher.md`, `tester.md`,
`ui-ux-designer.md` — this kit's own agent roster, verbatim, all stamped
2026-08-08 in a single write. That predates the rename (1.0.0 shipped
2026-08-16), so they were written by upstream agentkit: the same lineage making
the same unverified assumption, not third-party corroboration. **The cell rests
on the installer having observed its own output.**

`spec-verified.ts:184-186` already states the standard this breaks, in the `omp`
row's own comment: *"Both directories exist and are populated on the observation
machine, so a directory listing would have 'confirmed' either one — which is
exactly the confusion this ladder exists to catch."*

### What is *not* wrong

An earlier draft of this phase concluded from the same reading that antigravity
has no agent concept at all and that `agentPath` should become `null`. Direct
inspection of the 1.1.25 binary falsifies that:

- `agy agent --help` prints `Usage: agy agent [flags]` / `List available agents`.
  A subcommand named "list available agents" is not a tool without agents.
- The binary contains the literal string `.agents/agents/`.
- Its string table contains `stepfile_uriSKILL.mdagent.md` — the runtime knows
  an `agent.md` filename alongside `SKILL.md`.
- Frontmatter vocabulary counts in the binary: `subagent` ×592, `mainAgent` ×4,
  `inheritMcp` ×2, `commandExecutionPolicy` ×4.
- The binary documents `<workspace>/.agents/skills/<name>/` as a discovery root,
  so `<workspace>/.agents/agents/` is the symmetric workspace location the
  `.agents/agents/` string points at.

The bundled customization guide
(`~/.gemini/antigravity-cli/builtin/skills/agy-customizations/SKILL.md`, type
table at lines 19-29, discovery locations at 39-54) lists five customization
types and no agents, and the `docs/` beside it has no `agents.md`. So the guide
is incomplete relative to the binary — which is itself worth knowing, because
this plan otherwise treats that guide as authoritative.

The defect is therefore narrower and more specific than "no agents exist":
**ariadnev writes agents to the wrong path, in the wrong shape, on a
self-certifying rationale.** `agy agent` returns empty against those 16
populated files — consistent with `~/.gemini/config/agents/*.md` not being a
discovery root, and with the binary naming a *directory-per-agent* shape
(`.agents/agents/<name>/agent.md`) rather than a flat `<name>.md`.

### What the probe found

Step 1 has run. The transcript is
`plans/reports/probe-260904-1246-antigravity-agent-discovery.md`; no model call,
no credits. It took a third outcome neither pre-decided branch predicted.

**`~/.gemini/config/agents/` is a real discovery root.** A file planted there is
enumerated by bare `agy agent` immediately, with no project setup, in both the
flat (`<name>.md`) and directory-per-agent (`<name>/agent.md`) shapes. The
workspace root `.agents/agents/` works too, in both shapes, via
`agy --add-dir <absolute path>`.

**The 16 files are rejected for their content.** `agy` parses agent frontmatter
strictly: unknown keys pass through, but a *known* key whose value has the wrong
YAML shape makes it drop the whole agent silently — no warning, no partial load.
`tools:` must be a sequence. Every one of the 16 carries Claude Code's
comma-separated string, and rewriting only that line in verbatim copies of
`Explore.md` and `kongming.md` — `tools: Glob, Grep, Read, Bash` into
`tools: ["Glob", "Grep", "Read", "Bash"]` — makes both list.

**`model:` is a second, independent rejection, and the kit does emit it.** The
per-key bisection recorded `model` rejecting on one of agy's own ids; a later
end-to-end run took that further and found no accepted shape at all. Planted on
an agent agy had already listed, the kit's alias (`haiku`), a real id from
`agy models` (`gemini-3.8-flash-low`), and an object wrapping that id each made
the agent disappear from the listing again. Kit agents carry `model: haiku`,
`model: opus`, and `model: fable`, so fixing `tools:` alone still leaves every
one of them unloadable — running the real adapt pipeline over `Explore.md` and
`kongming.md` with the `tools:` fix in place produced two files agy listed
neither of, and stripping the `model:` line from those same two outputs made
both list. The key cannot be translated, only dropped; the agent then runs on
agy's default model. `commandExecutionPolicy` rejects too, and no kit artefact
emits it.

So the path is not the defect and `agentPath` stays
`~/.gemini/config/agents/<name>.md`. The defect is in the **adapted content**,
which puts the fix in the adapt engine's frontmatter serializer
(`adaptFrontmatterTools`, `packages/cli/src/adapt/frontmatter.ts:63-81`) — a
function that today rewrites `allowed-tools` / `disallowed-tools` /
`argument-hint` and never touches the agent `tools:` key at all.

The evidence rung is stronger than the phase assumed, and stronger than this
phase first recorded: the provider's own listing command enumerated an artefact
planted at the exact path the installer writes to, on 1.1.25. This phase
originally held the cell at `convention` on the grounds that nothing was watched
*using* the agent. That is a rung the ladder does not define. The table's header
grades `observed` as "listed it by name, **or** the content appeared in the
prompt", and ADR 0006 repeats it; `opencode.agent` and `codex.agent` are both
`observed` on exactly this kind of listing. The evidence here is stronger than
either, because `agy agent` is a parse — an empty control directory lists
nothing, and a file agy rejects is dropped from the listing — and because the
two agents enumerated came out of the real adapt pipeline rather than being
written by hand.

So the cell is `observed`, with `observedOn: "2026-09-04"`. The alternative was
not neutral: `spec-evidence.test.ts` requires a date whenever any cell in a row
is `observed`, so "observed with no date" is not a state the table can hold, and
grading strictly stronger evidence lower than opencode's would teach the next
reader a rule the file does not state.

One consequence to carry forward: the cell now rests on adapt output rather than
on a path alone. A regression that re-emits `model:` or a scalar `tools:` would
void the observation silently, which is what the frontmatter tests are for.

The circular rationale is deleted regardless. It was defending a conclusion that
happens to be right, on grounds that were never evidence, and leaving it in
place would teach the next reader the wrong rule.

**`agy skill list` does not exist.** 1.1.25 has `agent`, `agents`, `changelog`,
`help`, `install`, `mcp`, `mic-serve`, `models`, `plugin`, `plugins`, `update`.
Requirement 3 and step 1's second half cannot be run as written, so the `skill`
cell cannot be held to the same listing standard as `agent`. Its separate
evidence — a third party's `obsidian-second-brain-note` in
`~/.gemini/config/skills/` — is untouched by this probe and stands on its own.
The phase states that asymmetry as a bounded gap instead of pretending to close
it.

### The other cells

The `hook` cell is lifted `none` → `convention` — not `observed`, because no
hook was watched firing under `agy`'s control; the observable
`~/.gemini/config/hooks.json` was written by Orca, not by antigravity.

The `statusline` cell stays **`none`**. `antigravity-cli/settings.json` carries
a literal `"statusLine": {"type":"","command":"","enabled":true}` key, which is
a lead worth recording in the note but is three empty strings — nothing was
observed rendering from it, and an empty scaffold key is not a verified target.

The `skill` cell is **not** demoted alongside `agent`, and the difference is
worth stating because the two cells look symmetric. `~/.gemini/config/skills/`
holds exactly one skill, `obsidian-second-brain-note` — a third party's, and
none of this kit's ~105 skills. That is a different lineage writing into the
root, which is precisely the corroboration the agents root lacks. Step 1 runs
`agy skill list` alongside `agy agent` to check that this root is in fact
enumerated; if it is not, the `skill` cell comes down too, and this phase says
so rather than leaving the asymmetry unexamined.

## Requirements

1. Replace the falsified rationale in both `spec-verified.ts` and `resolver.ts`
   with what was actually verified, in every case.
2. Set `antigravity.paths.agent` and `agentPath` from the probe: the path
   stands, the note says what `agy agent` enumerated and on which version.
3. Emit `tools:` as a YAML sequence **and drop `model:`** for antigravity, so
   the agents this installer writes are the ones `agy` will load. Both are
   required: each key rejects the whole agent on its own. State the `skill`
   cell's bounded gap:
   1.1.25 has no `skill` subcommand, so no listing standard exists for it.
4. Handle the 16 files already on disk correctly — which is not the same as
   deleting them (see Architecture).
5. Lift `antigravity.paths.hook` `none` → `convention`, citing the vendor's
   bundled `docs/hooks.md` cross-checked against the live
   `~/.gemini/config/hooks.json` with no disagreement, plus binary-string
   corroboration.
6. Leave `statusline` at `none`, with the settings.json key recorded in the note
   as a lead.
7. Record `observedVersion: "1.1.25"` and `observedOn: "2026-09-04"`, the date
   `agy agent` enumerated the adapted agents. The row comment must scope the
   date to that one cell — every other cell in the row is `convention` and was
   not observed that day.
8. Keep `toolNames` at `none`; carry the binary-extracted mapping as a
   documented design hypothesis only.
9. Merge-safely install into the multi-tenant `~/.gemini/config/hooks.json`.
10. Name and resolve the workspace-vs-global precedence interaction.
11. Regenerate the matrix and README block.

## Architecture

### Hook config shape

Antigravity's `hooks.json` is *not* Codex's and not Claude Code's. Top-level
keys are **hook names chosen by the writer** (Orca uses `"orca-status"`), each
mapping to an event-config object. Five events only: `PreToolUse` and
`PostToolUse` take grouped `[{matcher, hooks:[…]}]` entries; `PreInvocation`,
`PostInvocation`, `Stop` take flat `[{type,command,timeout}]` arrays. There is
no `SessionStart`, `UserPromptSubmit`, `SubagentStart`, `SubagentStop`, or
`PreCompact` equivalent, and `Pre/PostInvocation` are model-turn-scoped, not
session-scoped. Decision vocabularies differ per event: `PreToolUse` returns
`{"decision":"allow"|"deny"|"ask"|"force_ask", "reason"?}`; `PostToolUse`
expects `{}`; `Stop` returns `{"decision":"continue"|…}`.

This is a third distinct hook wire format, so it is a third
`hooksConfigFormat` value (`"antigravity-hooks-json"`) behind Phase 0's
`hook-settings` action, and a third pure merger
(`packages/cli/src/install/antigravity-hooks-merge.ts`). What is shared is the
*pattern* — pure module, ownership by a provable predicate, idempotent, foreign
entries preserved — not the code, because collapsing three genuinely different
envelopes would need a fourth abstraction with one user each.

Because ariadnev's top-level key is its own (`"av"`), ownership is trivially
provable here and uninstall removes exactly that key. A `hooks.json.bak` already
exists beside the live file, written by some other participant in this
ecosystem, so ariadnev must not assume it owns that filename; backups follow the
repo's own atomic-write + keep-last-3 convention in its own backup root.

### Which hooks can bind at all

Of the kit's 19 bindings, only the `PreToolUse` (3), `PostToolUse` (4) and
`Stop` (3) ones have an antigravity event to bind to. The other 9
(`SessionStart`, `UserPromptSubmit` ×4, `SubagentStart` ×2, `SubagentStop`,
`PreCompact`) have no equivalent and must be skipped and logged per binding —
not silently dropped, and not remapped onto `PreInvocation`, which fires per
model turn rather than per session.

### The 16 files on disk: report, do not assume heal

An earlier draft's acceptance criterion was *"a re-install against a receipt
claiming the 16 files removes them rather than orphaning them."* That criterion
is not achievable as stated. `planHeal` (`install-heal.ts:110-131`) diffs the
**previous ariadnev receipt** against the next one and removes what fell out; it
only ever removes paths a prior ariadnev install claimed. The 16 files were
written by upstream agentkit on 2026-08-08, before ariadnev existed under that
name, so no ariadnev receipt claims them and heal will correctly never touch
them.

Two cases, and the phase must handle both:

- **The user has run `av install --provider antigravity` since.** That install
  overwrote and claimed those paths, so a later install after this phase drops
  them from the plan and heal removes them. This is the mechanism working as
  designed and needs a test, not a change.
- **The user has not.** The files are foreign — written by a different tool — and
  ariadnev must **report** them, never delete them. Deleting files this binary
  did not write, on the strength of recognising their names, is exactly the
  ownership violation `install-heal.ts`'s hash record exists to prevent.

The probe narrows what "handle correctly" means here. Those 16 paths are exactly
the ones this installer writes, so the frontmatter fix does not orphan or delete
anything: the next install overwrites each of them with an agent `agy` can
actually parse. Nothing is ever removed on the strength of a recognised name,
and the no-delete-without-a-receipt invariant is still worth a test — it is the
rule that keeps the *next* provider's remediation honest.

### Installing hooks means teaching `kit/` a third runtime

The phase was written as touching no file under `kit/`. Turning `hooksInstall`
on for antigravity makes that false, and the reason is not cosmetic:

- `kit/hooks/_lib/runtime-state-identity.cjs:13` is
  `SUPPORTED_RUNTIMES = new Set(['claude-code', 'codex'])`, and three separate
  guards (lines 93, 124, 141) reject a record whose runtime is not in it. An
  antigravity marker makes every one of them return `null`, so the hooks that
  key state on session identity do nothing and say nothing.
- `kit/hooks/_lib/hook-output.cjs`'s `resolveRuntime` is
  `runtime === 'codex' ? 'codex' : DEFAULT_RUNTIME`. Every other value collapses
  to `claude-code`, so an antigravity hook would emit Claude Code's
  `hookSpecificOutput.permissionDecision` envelope into a runtime whose
  `PreToolUse` schema expects `{"decision": "allow"|"deny"|"ask"|"force_ask"}`.
  That is issue #134's failure mode again, against a third provider.

So the emitter gets an antigravity branch with that runtime's own decision
vocabulary per event, `SUPPORTED_RUNTIMES` gains the third value, and the
embedded kit is regenerated — which makes this phase one of the writers deferring
to phase 0's single-writer rule for `kit-embedded.generated.ts`, not an exception
to it. `doctor/diagnose.ts` and `doctor/hook-repair.ts` read the same registry
and marker, so both have to recognise the third runtime or `av doctor` reports a
correct antigravity install as broken.

### Tool-name mapping is a hypothesis, not evidence

The binary strings yield `run_command` (Bash), `view_file` (Read),
`write_to_file` (Write), `edit_file` / `multi_replace_file_content` /
`propose_code` (Edit), `grep_search` (Grep), `find_by_name` (Glob),
`invoke_subagent` + `manage_subagents` (Task), `codebase_search` (no kit
equivalent). No `AskUserQuestion` equivalent exists; `manage_task` governs
background tasks and must **not** be mapped to `TodoWrite`. This came from
static string extraction, so `toolNames` stays `none` and `tool-rewrites.ts:34`
keeps its identity mapping. The table belongs in the phase record and in a
source comment as a design hypothesis, never in an evidence note.

### Do not treat `~/.gemini/settings.json` as an antigravity signal

The top-level file (not the one under `config/`) contains a Claude-Code-shaped
hook config with `$CLAUDE_PROJECT_DIR` and `.claude/hooks/*.cjs` commands. It
belongs to an unrelated tool sharing the `~/.gemini` home. Any probe script that
walks `~/.gemini` needs a comment saying so, or the next reader misattributes
Claude Code semantics to antigravity.

### Workspace vs global precedence, now load-bearing

The guide's priority order (lines 64-75) is: workspace project (CWD→repo root) >
declared configs (`skills.json`/`plugins.json`) > global `~/.gemini/config/` >
built-ins > global declared configs. Workspace `.agents/` **outranks** the global
root ariadnev targets, and `paths.ts:9` already puts `.agents/skills` in play for
codex, cursor, omp and generic. So an `agy` session run inside a repo where
ariadnev installed for any of those providers may read those files at higher
priority than the antigravity install. That is a cross-provider interaction the
matrix does not model and `shared-destinations.ts` does not know about.

If step 1's probe lists the workspace-planted agent, this stops being a footnote
and becomes the mechanism: `.agents/agents/` is a workspace root, and a project
install is how agents reach agy at all.

## Related Code Files

**Create**
- `packages/cli/src/install/antigravity-hooks-merge.ts` — pure named-key merger for agy's `hooks.json`.
- `packages/cli/src/install/antigravity-hooks-merge.test.ts` — Orca-entry fixture, idempotence, removal.
- `plans/reports/` observation record: the probe transcript, the guide excerpt, the binary strings, the 16 filenames and their mtime, and the `agy skill list` output.

**Modify**
- `packages/cli/src/adapt/frontmatter.ts:63-81` — emit the agent `tools:` key as a YAML sequence for antigravity; today the function never looks at it.
- `packages/cli/src/adapt/frontmatter.test.ts` — the failing assertion for that, and proof no other provider's output changes.
- `kit/hooks/_lib/hook-output.cjs` — an antigravity branch in `resolveRuntime` and the per-event decision vocabulary behind it.
- `kit/hooks/_lib/runtime-state-identity.cjs:13` — `SUPPORTED_RUNTIMES` gains the third runtime.
- `packages/cli/src/doctor/diagnose.ts`, `packages/cli/src/doctor/hook-repair.ts` — recognise the third runtime, so a correct install is not reported as broken.
- `packages/cli/src/install/hook-settings-merge.ts` — `mergeHooksConfig` / `unmergeHooksConfig` gain the `"antigravity-hooks-json"` case; the snippet renderer reads `merged.hooks`, which is `{}` for a named-key file and needs a format-aware path.
- `packages/cli/src/kit/kit-embedded.generated.ts` — regenerated, never hand-edited.
- `packages/cli/src/providers/spec-verified.ts:132-151` — `agent` per the probe branch; `hook` → `convention`; `statusline` note; `observedVersion: "1.1.25"`, `observedOn: null`; `toolNames` note names the extraction method.
- `packages/cli/src/providers/resolver.ts:112-134` — replace the falsified rationale comment; set `agentPath` per the probe branch; fill antigravity's Phase 0 hooks fields for `.gemini/config`.
- `packages/cli/src/providers/provider-matrix.test.ts:33-36` — the antigravity agent expectation currently asserts `verified: true`.
- `packages/cli/src/providers/spec-evidence.test.ts:69-70` — antigravity assertions.
- `packages/cli/src/providers/resolver.test.ts` — antigravity agent target.
- `packages/cli/src/install/install-plan.ts` — per-binding skip for events antigravity has no equivalent for.
- `packages/cli/src/cli/install-command.ts:123-137` — the foreign-files notice for `~/.gemini/config/agents/`.
- `README.md:267-279` — regenerated matrix block.
- `docs/decisions/0006-provider-verification-evidence.md` — the corrected antigravity evidence and the reason the prior one was withdrawn.

**Delete** — no source files, and no user files. See "The 16 files on disk".

## Implementation Steps

1. ~~The probe.~~ **Done** — `plans/reports/probe-260904-1246-antigravity-agent-discovery.md`.
   Both roots, both shapes, the per-key frontmatter bisection, and the
   confirmation on two unmodified kit agents. `agy skill list` does not exist in
   1.1.25, so that half of the step is unrunnable and is recorded as such.
2. Record the evidence: the guide's type table, the discovery-locations list,
   the binary strings (`.agents/agents/`, `stepfile_uriSKILL.mdagent.md`, the
   frontmatter vocabulary counts), the 16 filenames with their 2026-08-08 mtime,
   and the probe transcript from step 1.
3. Write the failing assertions before the source change: the note no longer
   cites the 16 files as evidence, and `adaptFrontmatterTools` emits antigravity
   a `tools:` sequence and no `model` key, while leaving every other provider's
   frontmatter byte-identical.
4. Apply the change in `packages/cli/src/providers/spec-verified.ts` and rewrite
   the rationale at `packages/cli/src/providers/resolver.ts:112-134`. The
   replacement comment must state that a populated directory written by this
   tool's own lineage is not evidence — the rule the `omp` row already states at
   `spec-verified.ts:184-186` — and must state what the probe showed.
5. Fix the serializer: `adaptFrontmatterTools` emits `tools:` as a sequence for
   antigravity and removes the `model` key there. Then a test proving the installer plans **no delete** for a path
   no ariadnev receipt claims, and a heal test for the case where a prior
   ariadnev receipt *does* claim those paths, proving they are removed. The
   install summary needs no foreign-files notice for this directory — the next
   install overwrites those 16 paths with parseable agents — so
   `install-command.ts` is left alone unless the tests say otherwise.
6. Write the failing `antigravity-hooks-merge.test.ts`: fixture containing
   Orca's `"orca-status"` key across all five events; merging ariadnev's `"av"`
   key must leave Orca's untouched; a second merge is a no-op; removal deletes
   only `"av"`. Cover both the grouped (`Pre/PostToolUse`) and flat
   (`PreInvocation`/`PostInvocation`/`Stop`) shapes.
7. Implement `packages/cli/src/install/antigravity-hooks-merge.ts` and register
   `"antigravity-hooks-json"` in Phase 0's `hooksConfigFormat` union, with the
   dispatch in `opContent` and in the unmerge branch.
8. Extend `planHooks` to emit a per-binding skip with an explicit reason for
   each of the 9 bindings whose event antigravity does not have, and to bind
   only the 10 that map.
9. Lift the `hook` cell to `convention`, note citing
   `~/.gemini/antigravity-cli/builtin/skills/agy-customizations/docs/hooks.md`
   cross-checked against the live `~/.gemini/config/hooks.json` and the binary
   strings (`"pre-tool hook %s not registered"`, `"prompt hooks are not
   currently supported"`). State in the note why it is not `observed`.
10. Set `observedVersion: "1.1.25"` and `observedOn: "2026-09-04"`, leave `statusline`
    at `none` with the settings.json key as a recorded lead, and update
    `toolNames`'s note to say the mapping is static binary-string extraction and
    that flipping the cell needs a real `agy -p` run with the user's consent.
    Put the mapping table in a source comment marked as a hypothesis.
11. Reconcile the precedence interaction: a test alongside
    `packages/cli/src/install/shared-destinations.test.ts` covering an
    antigravity user running inside a repo where ariadnev installed for
    codex/cursor/omp/generic, where the workspace `.agents/` tree outranks the
    global `~/.gemini/config/` install. Document the expectation in `README.md`'s
    matrix prose if it changes what a user should expect.
12. Regenerate the matrix (`pnpm --filter ariadnev generate:matrix`), run
    `matrix-drift.test.ts`, and update
    `docs/decisions/0006-provider-verification-evidence.md` with both the new
    evidence and the withdrawal of the old.
13. Give the emitter its antigravity branch and add the third value to
    `SUPPORTED_RUNTIMES`, teach `doctor/diagnose.ts` and `doctor/hook-repair.ts`
    the same runtime, then regenerate the embedded kit
    (`pnpm --filter ariadnev generate:embedded`) under phase 0's single-writer
    rule. Verify with `node --test "kit/hooks/__tests__/*.test.cjs"
    "kit/hooks/_lib/__tests__/*.test.cjs"`, then
    `npx vitest run packages/cli/src/install packages/cli/src/providers
    packages/cli/src/adapt`, then `pnpm lint`.

## Success Criteria

- [x] `plans/reports/` holds the probe transcript: both discovery roots, both file shapes, the per-key frontmatter bisection, and the confirmation on two unmodified kit agents.
- [x] No comment in `resolver.ts` or `spec-verified.ts` still justifies an antigravity cell by the presence of files this tool's lineage wrote.
- [x] `antigravity.paths.agent` and `agentPath` keep `~/.gemini/config/agents/<name>.md`, and the note says what `agy agent` enumerated there, on which version.
- [x] An antigravity-adapted agent carries `tools:` as a YAML sequence and no `model:` key, and every other provider's frontmatter is byte-identical to before.
- [x] Two kit agents adapted for antigravity are enumerated by `agy agent` after a real install — the same check the probe ran by hand. Confirmed on 1.1.25: `Explore` and `kongming` through the real adapt pipeline, planted, both listed, then removed.
- [x] The installer plans **no delete** for `~/.gemini/config/agents/*.md` when no ariadnev receipt claims them.
- [x] A heal test proves those paths *are* removed when a prior ariadnev receipt claims them.
- [x] The `skill` cell's bounded gap is stated: 1.1.25 ships no `skill` subcommand, so no listing standard exists for it, and the cell rests on its own separate evidence.
- [x] `antigravity.hook` is `convention` with a note that states why it is not `observed`.
- [x] `antigravity.statusline` is `none`, and its note records the empty `statusLine` key as a lead rather than as evidence.
- [x] `observedVersion` is `"1.1.25"` and `observedOn` is `"2026-09-04"`, scoped by a comment to the one cell that was observed.
- [x] `antigravity.agent` is `observed`, and its note says what `agy agent` enumerated, that the listing is a parse rather than a directory echo, and what is still unobserved.
- [x] `toolNames` stays `none`; the mapping appears only as a marked hypothesis.
- [x] Merging into a `hooks.json` fixture holding Orca's entries preserves them across both the grouped and flat event shapes; a second merge is a no-op; removal deletes only `"av"`.
- [x] The 9 unmappable bindings are skipped with per-binding reasons, and none is remapped onto `PreInvocation`.
- [x] The workspace-vs-global precedence interaction has a named test and a documented expectation.
- [x] `SUPPORTED_RUNTIMES` accepts the third runtime and the emitter renders antigravity's own per-event decision vocabulary rather than collapsing to Claude Code's.
- [x] The gap that tick does not close is written into the `hook` note rather than left implied: agy's stdin is camelCase protojson (`toolCall.{name,args}`, `workspacePaths`, `conversationId`) and its matchers are agy tool names, where the kit's hooks read Claude Code's fields and match Claude Code's tool names — so the registered bindings answer in agy's vocabulary but do not yet fire on it.
- [x] `av doctor` reports a correct antigravity hook install as healthy.
- [x] The embedded kit is regenerated, not hand-edited, and the kit hook suites are green.
- [x] README matrix regenerated; `matrix-drift.test.ts` green.

## Risk Assessment

| Risk | Observable signal | Pre-decided response |
|---|---|---|
| The probe is inconclusive — `agy agent` errors, or needs a project the scratch workspace does not look like | Non-empty stderr, or a usage error rather than an empty list | Treat as "does not list": `agentPath: null`, cell `none`. An inconclusive probe is not evidence, and skipping is the safe default the ladder already prescribes |
| Changing the agent cell reads as a regression to a user who saw "antigravity: agents ✓" | A user asks why antigravity lost agent support | The install summary skip reason and README prose both state that the previous target was never read — a capability that never worked is not a capability lost |
| Deleting the 16 files because their names are recognisable | Any plan or heal op targeting `~/.gemini/config/agents/*.md` without a receipt entry | Forbidden by construction and by the step-5 test; the summary reports and hands the user the `rm` |
| The bundled guide is out of date relative to the binary — already true for agents | Another type appears in the binary that the guide omits | This phase already treats the binary as the stronger source where they disagree; record each such disagreement in the evidence note so the guide's authority is bounded rather than assumed |
| A third merger is one merger too many (DRY concern) | Reviewer objects to three hook writers | The three wire formats genuinely differ — named keys vs array-of-groups vs settings.json — and the shared part is the pattern, not the code |
| The 10 bindable hooks emit Claude-shaped JSON that agy rejects | An agy session shows a hook parse error | The `hook` cell is only `convention`; the phase-1 emitter gets an antigravity branch or the bindings ship disabled. Do not lift to `observed` on the strength of a hook that merely did not visibly fail |
| Workspace `.agents/` silently overrides the global install | An agy session inside an ariadnev-installed repo behaves differently from outside it | Documented expectation plus the step-11 test; if confirmed harmful, the response is a warning in the install summary, not a path change that would break codex/cursor/omp |

## Rollback

The evidence cells and the resolver rationale are one-line reverts; the merger
is a new file. No user file is deleted at any point in this phase, so a revert
restores the previous behaviour exactly, including the 16 files already on disk.
