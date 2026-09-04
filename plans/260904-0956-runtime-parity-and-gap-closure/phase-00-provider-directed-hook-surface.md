---
phase: 0
title: "Provider-directed hook surface"
status: pending
priority: P1
effort: 7h
dependencies: []
---

## Overview

The hook installer is written for exactly one provider. Not by configuration —
by constant. `CLAUDE_HOOKS_DIR` (`paths.ts:37`), `CLAUDE_SETTINGS_FILE`
(`paths.ts:38`) and `CLAUDE_OUTPUT_STYLES_SIDECAR_DIR` (`paths.ts:47`) are
joined directly into every destination `planHooks` produces, `ProviderConfig`
(`resolver.ts:34-46`) has no field that could redirect any of them, and
`targetPathFor` returns `${base}/${CLAUDE_HOOKS_DIR}/*.cjs` for the `hook` case
and `${base}/${CLAUDE_HOOKS_DIR}/av-statusline.cjs` for `statusline`
(`resolver.ts:273-283`) regardless of which provider `r` is.

That is invisible today because exactly one provider has a verified `hook` cell.
The moment a second one does, the installer writes that provider's hooks into
`~/.claude/hooks/av/`, appends its bindings to `~/.claude/settings.json`, and
stamps a runtime marker claiming the tree belongs to it. `spec-verified.ts:217-224`
already says so out loud: grok's `hook` cell is held at `none` **for this
mechanical reason**, not for lack of evidence —

> `~/.grok/hooks` exists, but the hook target resolves to `.claude/hooks/av/`
> for every provider; verifying this cell would install into claude-code's tree
> rather than grok's

Phase 1 lifts codex's `hook` cell. Without this phase first, that lift is the
defect grok's note predicts.

Three things have to change together, because fixing any one alone leaves a
half-migrated tree that is worse than the current honest single-provider state:

1. **Every** hooks-tree destination becomes provider-directed — not the two
   obvious `.cjs` writes, but also the `_lib` tree, the runtime marker, the
   output-styles sidecar, the statusline, and the hook library's own
   config-directory resolution at runtime (`provider-paths.cjs:25-34`, which
   walks parents for a directory literally named `.claude`).
2. **The install-write decision is split from the ladder grade.** Today
   `planHooks` gates on `isVerified(r.id, "hook")` (`install-plan.ts:112-114`),
   and `convention()` returns `{verified: true, …}`. So moving a cell from
   `none` to `convention` — a documentation act — silently turns on file writes
   into a path nobody watched the provider read. Phases 1-3 all grade cells;
   none of them should be able to start writing as a side effect.
3. **Uninstall and heal gain the same provider direction.** `uninstall-plan.ts:237-246`
   hardcodes `join(root, CLAUDE_SETTINGS_FILE)` and `ownedDir: join(root, CLAUDE_HOOKS_DIR)`
   with no provider check at all. A codex uninstall on a machine with Claude
   Code installed unmerges Claude Code's bindings and, via
   `unmergeStatusLine`'s `current.command.includes(ownedDir)` predicate
   (`hook-settings-merge.ts:128-133`), deletes Claude Code's statusline. On a
   machine without Claude Code it creates `~/.claude/settings.json` out of
   nothing.

This phase does all three and ships no new provider evidence. Every cell in
`spec-verified.ts` keeps the rung it has today except grok's `hook` note, whose
stated reason stops being true and must be rewritten to the real one.

## Requirements

- `ProviderConfig` carries the hooks surface explicitly: `hooksDir`,
  `hooksConfigFile`, and `hooksConfigFormat`. `null` on `hooksConfigFile` means
  "this provider has no settings file to merge bindings into" and the
  binding-merge op is not emitted at all.
- No destination under the hooks tree is built from a `CLAUDE_*` constant at a
  call site. The constants stay in `paths.ts` (that is the repo rule) but become
  claude-code's *values*, read through the resolver.
- The hook library resolves its own config dir from the runtime marker it is
  installed beside, not from a directory name.
- A provider installs hooks only when an explicit per-provider switch says so.
  `isVerified` continues to decide what the matrix renders; it no longer decides
  what is written.
- Uninstall removes exactly what install wrote for that provider, and touches no
  other provider's settings file, statusline, or owned directory.
- Whatever new op action this introduces is handled by the reconciler
  (`shared-writes.ts:48-50` currently narrows to `action === "write"`, so a new
  action is invisible to collision and divergence resolution), by
  `opContent` (`install-execute.ts:52-62`), and by the consent gate
  (`install-execute.ts:91`) in the same commit.
- Claude Code's on-disk layout is byte-identical before and after. This phase is
  a refactor with a behaviour gate added; it is not a migration.

## Architecture

### The resolver owns the hooks surface

Add to `ProviderConfig` (`resolver.ts:34-46`):

```ts
  /** Root of the owned hooks tree, relative to the scope base. */
  hooksDir: string;
  /**
   * Relative path of the settings file bindings are merged into; null when the
   * provider discovers hooks by directory and has no binding registry.
   */
  hooksConfigFile: string | null;
  /** Which merger writes that file. */
  hooksConfigFormat: "claude-settings-json" | null;
  /**
   * Whether an install writes into that tree. Independent of the `hook` cell's
   * evidence level: a `convention` grade documents a layout, it does not
   * authorise writing to it.
   */
  hooksInstall: boolean;
```

claude-code takes `hooksDir: CLAUDE_HOOKS_DIR`, `hooksConfigFile:
CLAUDE_SETTINGS_FILE`, `hooksConfigFormat: "claude-settings-json"`,
`hooksInstall: true`. Every other provider takes `hooksInstall: false` and
`hooksConfigFile: null` until a phase that owns that provider changes it. Phase
1 supplies codex's three values; phase 2 decides antigravity's.

`targetPathFor`'s `hook` and `statusline` branches (`resolver.ts:273-283`) read
`hooksDir` off the config instead of the module constant. The comment at
`resolver.ts:277-281` explaining why the statusline lives beside the hooks stays
true and stays.

### Four destinations, not two

`planHooks` (`install-plan.ts:110-205`) builds five kinds of path. All five move:

| Line | Destination | Today | After |
|---|---|---|---|
| `:122` | hook `.cjs` | `join(base, CLAUDE_HOOKS_DIR, …)` | `r.hooksTarget(ctx)` |
| `:143` | `_lib` tree | `join(base, CLAUDE_HOOKS_DIR, "_lib")` | under `r.hooksTarget(ctx)` |
| `:149-155` | runtime marker | `hookRuntimeMarkerPath(base)` | `hookRuntimeMarkerPath(r.hooksTarget(ctx))` |
| `:162-170` | output-styles sidecar | `join(base, CLAUDE_OUTPUT_STYLES_SIDECAR_DIR, …)` | `join(r.hooksTarget(ctx), "output-styles", …)` |
| `:178-193` | statusline + its settings op | `join(base, CLAUDE_HOOKS_DIR, …)` / `CLAUDE_SETTINGS_FILE` | `r.hooksTarget(ctx)` / `r.hooksConfigTarget(ctx)` |

`hook-runtime-marker.ts` currently takes the *scope root* and appends
`CLAUDE_HOOKS_DIR` itself. It changes to take the already-resolved hooks
directory, which removes its `paths.js` import entirely and makes the function
honest about what it is given.

`CLAUDE_OUTPUT_STYLES_SIDECAR_DIR` is defined as `${CLAUDE_HOOKS_DIR}/output-styles`
(`paths.ts:47`) — a composition, not an independent location. It stays exported
for the rewrite tables that reference the literal string, but the sidecar
*write* composes from the resolved hooks dir instead.

### The binding-merge op stops being unconditional

`install-plan.ts:197-203` pushes the `hook-settings` op outside every branch and
outside every condition except the `isVerified` gate 85 lines above. It becomes:

```ts
  const hooksConfig = r.hooksConfigTarget(ctx);
  if (hooksConfig !== null) {
    ops.push({ action: "hook-settings", kind: "hook", name: basename(hooksConfig),
               dest: hooksConfig, format: r.hooksConfigFormat!, bindings });
  }
```

A provider that discovers hooks by directory alone gets its `.cjs` files, its
`_lib`, its marker, and no settings file it never had.

The `format` field is what lets phase 1 add a second merger without a second op
action — which matters, because a new action would need parallel handling in
`opContent` (`install-execute.ts:52-62`), in the two-action consent gate
(`install-execute.ts:91`), in the reconciler's `isWrite` narrowing
(`shared-writes.ts:48-50`), in `uninstall-execute.ts:64-76`, and in the receipt.
Reusing the action with a pluggable merger keeps all five in one place. If a
provider's config format eventually cannot be expressed this way, the new action
lands together with those five call sites, not before them.

### The hook library stops looking for `.claude`

`provider-paths.cjs:25-34` walks up from `__dirname` for a directory whose
basename is exactly `.claude`, falling back to `path.join(cwd, '.claude')`. Its
own header explains why the walk exists — ariadnev installs one level deeper
than the kit it came from, so `path.dirname(__dirname)` misses. The walk solved
that. It does not survive a second provider: under `~/.codex/hooks/av/` the walk
finds nothing and the fallback invents `<cwd>/.claude`, so a codex hook reads
Claude Code's configuration, or a file that does not exist — and the hooks fail
open, so nothing reports it.

The runtime marker already sits beside `_lib` and already records which runtime
owns the tree (`hookRuntimeMarkerContent`). Resolution becomes: walk up from
`__dirname` to the directory containing the marker; the provider config dir is
its parent chain per the marker's runtime. `claudeConfigDir` keeps its name and
its Claude Code behaviour as the fallback for an unmarked tree — an existing
install has no marker until it is re-run, and a hook that hard-fails on a
missing marker would break every currently installed tree.

`SUPPORTED_RUNTIMES` (`runtime-state-identity.cjs:13`) is `new Set(['claude-code',
'codex'])` and `readRuntimeMarker` returns `null` for anything outside it. That
set is the runtime allowlist for state identity and must be extended in the same
commit as any provider whose marker will carry a new id — phase 2 for
antigravity, if it gets there. This phase adds no id.

### Uninstall and heal

`uninstall-plan.ts:237-246` gains the same two resolver reads. The `unmerge-settings`
op is emitted only when the provider being uninstalled has a `hooksConfigFile`,
its `path` is that file, and its `ownedDir` is that provider's hooks dir — so
`unmergeStatusLine`'s `includes(ownedDir)` test (`hook-settings-merge.ts:128-133`)
can no longer match a bar another provider's install wrote.

`planHeal` (`install-heal.ts:110-131`) needs nothing structural: it diffs the
previous receipt's claimed paths against the next one's and removes what fell
out. Because every path this phase moves is a *planned* op, it is in the
receipt, so a provider whose hooks dir changes between versions heals correctly
by construction. What it does need is a test proving that, since no test
currently exercises heal across a hooks-tree relocation.

### `OBSERVED_ON`

`spec-verified.ts:66` is one shared `const OBSERVED_ON = "2026-08-15"`, consumed
by claude-code (`:81`), codex (`:97`) and opencode (`:154`). Phases 1 and 3
re-observe two of those three on different days; opencode is re-observed by
neither. Editing the shared constant would silently re-date opencode's row to a
run that never happened for it.

Split it into per-row literals now, while no phase is mid-edit: opencode keeps
`"2026-08-15"`, and claude-code and codex get their own values that phases 3 and
1 respectively overwrite. This is a mechanical change with no grade movement.

### What `convention` actually covers

The ladder's doc comment describes `convention` as one thing: the path is the
neutral cross-tool layout observed working elsewhere. Two later phases rest a
cell on a second ground that wording does not cover — the **provider's own
shipped artefact** naming the path. Phase 1 grades codex's `hook` cell from
`~/.codex/config.toml`'s `[hooks.state]` table, which Codex itself wrote; Phase 3
grades claude-code's `outputStyle` cell from strings and a plugin schema key in
Claude Code's own binary. Left unwidened, both phases would either read as
violating the ladder or quietly redefine it in passing, in two places, with two
wordings.

Widen it here, once, before either phase touches the file. `convention` covers
both grounds, and they mean the same thing operationally: **the path is right,
and nobody watched it load.** What the rung still excludes is the ground Phase 2
removes — a directory populated by this tool's own lineage, which certifies
nothing. `spec-verified.ts:184-186` already states that exclusion in the `omp`
row's comment; the widened doc comment cites it so the boundary is written where
the rung is defined rather than in one provider's aside.

This is a comment and a shared understanding, not a behaviour change: no cell
moves in this phase.

## Related Code Files

**Modify:**

- `packages/cli/src/providers/resolver.ts` — `ProviderConfig` (`:34-46`), every
  provider literal, `targetPathFor` hook/statusline branches (`:273-283`), plus
  new `hooksTarget` / `hooksConfigTarget` accessors alongside `scriptsTarget`
- `packages/cli/src/install/install-plan.ts` — `planHooks` (`:110-205`), the five
  destinations tabulated above and the conditional `hook-settings` tail (`:197-203`)
- `packages/cli/src/install/hook-runtime-marker.ts` — `hookRuntimeMarkerPath`
  takes a hooks dir; drops the `paths.js` import
- `packages/cli/src/install/install-types.ts` — `format` field on the
  `hook-settings` op
- `packages/cli/src/install/install-execute.ts` — `opContent` (`:52-62`) selects
  the merger by `format`
- `packages/cli/src/install/hook-settings-merge.ts` — the existing merger becomes
  the `claude-settings-json` implementation behind a small dispatch; the
  `unmergeStatusLine` predicate (`:128-133`) is unchanged, it just gets a correct
  `ownedDir`
- `packages/cli/src/uninstall/uninstall-plan.ts` (`:237-246`) — provider-directed
  path and `ownedDir`, emitted conditionally
- `packages/cli/src/providers/spec-verified.ts` — `OBSERVED_ON` split (`:66`,
  `:81`, `:97`, `:154`); grok `hook` note rewritten (`:217-224`)
- `kit/hooks/_lib/provider-paths.cjs` (`:25-34`) — marker-derived resolution with
  the current walk as fallback
- `kit/hooks/_lib/runtime-state-identity.cjs` — export the marker-directory
  lookup `provider-paths.cjs` needs; `SUPPORTED_RUNTIMES` (`:13`) untouched this
  phase

**Create:**

- `packages/cli/src/install/hooks-surface.test.ts` — the per-provider destination
  assertions
- `kit/hooks/_lib/provider-paths.test.cjs` — marker-derived resolution, including
  the unmarked-tree fallback

**Read (not modified):**

- `packages/cli/src/install/shared-writes.ts` (`:48-50`) — confirm the op set the
  reconciler sees is unchanged by this phase
- `packages/cli/src/install/install-heal.ts` (`:110-131`)
- `README.md:267-279` — the generated matrix block; this phase changes no cell,
  so `matrix-drift.test.ts` must stay green **without** regenerating it

## Implementation Steps

1. Write the failing test first: `hooks-surface.test.ts` asserts that for a
   provider configured with `hooksDir: ".codex/hooks/av"` and `hooksConfigFile:
   null`, `planHooks` produces hook `.cjs`, `_lib`, marker and output-style
   destinations all under `.codex/hooks/av/`, and **no** `hook-settings` op. Use
   a synthetic provider config, not a real provider id — no provider's evidence
   changes in this phase.
2. Add the four fields to `ProviderConfig` and fill them for all nine providers
   plus `test-provider`. Only claude-code gets `hooksInstall: true`.
3. Add `hooksTarget(ctx)` and `hooksConfigTarget(ctx)` to the resolver beside
   `scriptsTarget`, and switch `targetPathFor`'s two branches to `hooksDir`.
4. Change `hookRuntimeMarkerPath` to take the hooks dir. Update its one caller.
5. Rewrite the five destinations in `planHooks` per the table. Keep the existing
   comments — they explain invariants that are still true, only relocated.
6. Replace the `isVerified(r.id, "hook")` gate at `install-plan.ts:112-114` with
   `r.hooksInstall`, and keep a skip op with the same reason string shape for a
   provider that does not install. Add an assertion that a provider with
   `hooksInstall: true` also has a verified `hook` cell — the switch may be
   narrower than the grade, never wider.
7. Make the `hook-settings` tail conditional on `hooksConfigTarget(ctx) !== null`
   and carry `format`. Thread `format` through `install-types.ts` and dispatch in
   `opContent`. Leave the consent gate at `install-execute.ts:91` matching on the
   two action names it already matches — the action names do not change.
8. Uninstall: same two resolver reads in `uninstall-plan.ts:237-246`, op emitted
   only when the provider has a config file. Add a test installing a hooks-tree
   provider with `hooksConfigFile: null`, uninstalling it, and asserting
   `~/.claude/settings.json` is neither created nor read.
9. Add the heal test: a receipt whose hooks tree sat at path A, a next receipt at
   path B, and `planHeal` removing every file under A.
10. `provider-paths.cjs`: marker-derived resolution plus the unmarked fallback,
    with `provider-paths.test.cjs` covering a marked codex-shaped tree, a marked
    claude-shaped tree, and an unmarked tree that still resolves the old way.
11. Split `OBSERVED_ON` into three literals. Rewrite grok's `hook` note to the
    remaining true reason — no grok binary on PATH to observe a load, the same
    reason its other cells give — and keep the cell at `none`.
12. Widen the `convention` doc comment in `spec-verified.ts` to both grounds,
    citing the `omp` row's exclusion at `:184-186`. No cell moves.
13. `npx vitest run packages/cli/src/install packages/cli/src/providers`, then
    `node --test kit/hooks/_lib/provider-paths.test.cjs`, then `pnpm lint`.
14. `pnpm --filter ariadnev generate:embedded` last, and only once. It rewrites
    `packages/cli/src/kit/kit-embedded.generated.ts` wholesale (10 MB, tracked,
    one header line naming the version), so it is a **single-writer artefact**:
    exactly one phase may regenerate it per branch, and it is regenerated after
    the last `kit/` edit lands, never in parallel with another phase that also
    touches `kit/`.

## Success Criteria

- [ ] No file under `packages/cli/src/install/` joins `CLAUDE_HOOKS_DIR`,
      `CLAUDE_SETTINGS_FILE` or `CLAUDE_OUTPUT_STYLES_SIDECAR_DIR` into a
      destination; `grep -rn 'CLAUDE_HOOKS_DIR\|CLAUDE_SETTINGS_FILE\|CLAUDE_OUTPUT_STYLES_SIDECAR_DIR' packages/cli/src/install packages/cli/src/uninstall`
      returns nothing outside `resolver.ts`'s claude-code literal
- [ ] `hooks-surface.test.ts` proves all five destination kinds follow `hooksDir`
      for a non-claude provider config
- [ ] A provider with `hooksConfigFile: null` produces no `hook-settings` op and
      no `statusline-settings` op
- [ ] `planHooks` gates on `hooksInstall`, and a test asserts no provider has
      `hooksInstall: true` with an unverified `hook` cell
- [ ] Installing then uninstalling a hooks-tree provider with no config file
      leaves `~/.claude/settings.json` untouched (and uncreated) — proven by a
      test, not by inspection
- [ ] `planHeal` removes the old tree when a provider's `hooksDir` changes
      between receipts
- [ ] `provider-paths.cjs` resolves from the runtime marker, and still resolves
      correctly in a tree that has no marker
- [ ] Claude Code's planned destinations are byte-identical to before: the
      existing install/uninstall/receipt fixtures pass unmodified
- [ ] The `convention` doc comment names both grounds and the excluded one, and
      no cell's level changed in this phase — verified by diffing the graded literals.
- [ ] `spec-verified.ts` has three independent observation dates; opencode's is
      still `2026-08-15`
- [ ] grok's `hook` note no longer cites a resolver hard-wire that no longer
      exists, and the cell is still `none`
- [ ] `README.md:267-279` is unchanged and `matrix-drift.test.ts` passes without
      regeneration
- [ ] `pnpm test` and `pnpm lint` green; `pnpm coverage` ≥90% on `adapt/`

## Risk Assessment

**Silently relocating Claude Code's tree.** The whole phase is a refactor of the
paths one live provider already writes; an error here moves a real user's hooks
without an uninstall of the old location. *Mitigation:* claude-code's
`hooksDir` is literally `CLAUDE_HOOKS_DIR`, so its resolved destinations are
string-identical by construction, and the existing fixtures assert that. *Signal
it broke:* any existing install or receipt fixture needing an edit. *Pre-decided
response:* stop — a fixture that has to change means the refactor changed
behaviour, and the fix is in the refactor, not the fixture.

**The unmarked-tree fallback becomes permanent.** Every already-installed tree
lacks a marker until re-run, so the `.claude` walk has to stay; the risk is that
it stays forever and a second provider quietly depends on it. *Mitigation:* the
marker is a planned write, so any `av install` writes one; the fallback is
reached only by a tree installed before this phase. *Signal:* a new provider's
hook reading Claude Code's config in the wild. *Response:* make the fallback
claude-code-only rather than removing it.

**`hooksInstall` and the evidence cell drift apart.** Two switches for one
concept invites one being flipped without the other. *Mitigation:* step 6's
assertion makes the narrow direction the only legal drift. *Signal:* that
assertion firing. *Response:* it is a real defect in the phase that flipped it,
not a test to relax.

**A later phase needs a second op action after all.** If codex's config format
cannot be produced by a pluggable merger behind one action, the five call sites
listed in Architecture all need parallel handling. *Signal:* phase 1 finding the
`hook-settings` op shape cannot carry what `~/.codex/hooks.json` needs.
*Response:* add the action and all five handlers in one commit — never the
action alone, which is how an op reaches disk past the consent gate and the
reconciler.

## Rollback

Every change is additive-then-switched: the four `ProviderConfig` fields can be
added and populated without any call site reading them, and each destination
switches independently. Reverting the phase is reverting the commits in reverse
order; no on-disk layout changes, so no installed tree needs migrating back.
