---
phase: 4
title: "Persisted worktree root configuration"
status: completed
priority: P2
effort: 7h
dependencies: []
---

## Overview

`kit/skills/worktree/scripts/worktree.cjs:336-378` resolves the worktree root
through five priorities: the `--worktree-root` flag, the `WORKTREE_ROOT` env var,
a superproject's `worktrees/`, a monorepo-internal `worktrees/`, and a sibling
`worktrees/`. There is no persisted setting, and `worktree.root` is absent from
`packages/cli/src/config/config-schema.ts`. The parity study measured this skill
at 67% of upstream and named it as one of two real content gaps: the capability
is missing, not relocated.

Upstream implements it with `resolve-worktree-root.cjs` (266 LOC) and
`mini-yaml-parser.cjs` (232 LOC). **Neither ports.** ariadnev's config is JSON,
so there is nothing to parse by hand, and the layer question upstream solves in
prose is already solved structurally here by
`packages/cli/src/config/filter-project-layer.ts`. What ports is the *rule*
inside those files, not the files.

Upstream's security rule does port and is the sharp edge of this phase: a project
config file is committed, so it can arrive from an untrusted clone. A rooted
value there would let a cloned repository choose where this machine writes
directories. The rule survives in intent, but not in upstream's shape: upstream
bounds a relative value to the repository's **parent**, which on a normal machine
is `$HOME` or a projects directory, and that is wide enough to be no bound at all
(see "Bounding rule" below). This phase bounds a project value to the repository
itself.

The phase also answers the parity study's open question — port, or declare the
flag/env pair sufficient — by porting, and records the answer in an ADR so the
question is not reopened.

**Effort raised from 4h to 7h.** The original estimate assumed one schema field
plus a reader in the skill script. The bound now lives in TypeScript with its own
tests, the generator gains a second output, and the `info` envelope has to grow a
warning channel it does not currently have.

## Requirements

1. Add `worktree.root` to the schema as a project-layer optional string.
2. Bound a project-layer value **in the config layer**, in
   `filter-project-layer.ts`, so `av config prefs resolve` and every future
   consumer see the same effective value the skill script sees.
3. Teach `worktree.cjs` to read the already-bounded value, inserted between the
   env var and the superproject probe.
4. State the project/user asymmetry: a project value is bounded to the repository
   directory; a user value may be absolute and is not bounded.
5. Report the new source through the existing `worktreeRootSource` field, and
   report a refusal through the JSON envelope's existing `warnings` array —
   which `cmdInfo` does not yet emit and has to gain.
6. Regenerate the JSON Schema, the hook field table, the new skill field table,
   and the embedded kit.
7. Record the decision in a new ADR.

## Architecture

### Layer choice: project, with the bound in the config layer

`worktree.root` answers "where do *this repository's* worktrees go", which is a
workspace fact. Making it user-only would delete the capability the parity gap is
about, and would be a scope cut. So it is `projectField.optionalStr(...)`
(`config-schema.ts:49`), which puts the untrusted-clone threat on the table.

The safety rule therefore belongs in the config layer, not in the skill script.
`filterProjectLayer` currently passes a project-layer key through structurally
unmodified — `filter-project-layer.ts:53` builds `PROJECT_PATHS`, and
`filter-project-layer.ts:72-76` copies any path in that set into the layer with
no value inspection at all. If the bound lived only in `worktree.cjs`, then
`av config prefs resolve` (`register-config-commands.ts:10-24`) would print the
raw unbounded value while the script silently refused it, and any second consumer
reading through `resolveConfig` would inherit no protection.

So `filterProjectLayer` gains one project-layer sanitizer for this key. It
already owns the machinery: `filter-project-layer.ts:78-87` drops a key with a
`DroppedKey` reason and a human warning, and `load-config.ts:89-90` forwards
those warnings to the caller. An out-of-bounds `worktree.root` is dropped the
same way, with reason `out-of-bounds value`. The project layer that reaches
`resolveConfig` then physically does not contain it, and the user value (if any)
applies instead — the same structural stance the file's header comment already
argues for.

`filterProjectLayer`'s second argument is `sourcePath`, the project config file
path (`load-config.ts:24-26, 89`). The bound's anchor is therefore
`path.dirname(path.dirname(sourcePath))` — the directory that owns the
`.ariadnev/` dir the value came from. In `worktree.cjs` that same anchor is
`gitRoot`, because that is the directory whose `.ariadnev/config.json` was read.
One definition, two surfaces.

### Bounding rule

Applies to a **project-layer** value only.

1. Reject a non-string, an empty/whitespace-only string, or one matching
   `/[\0\r\n]/` — the same control-character screen `validateWorktreeRoot`
   applies at `worktree.cjs:297-299`.
2. Reject `path.isAbsolute(value)`. Reject a value whose first character is `~`
   (an unexpanded home reference is not a relative path and must not become one).
3. `candidate = path.resolve(anchor, value)`.
4. Resolve symlinks on both sides, then check containment.
5. Containment is `rel = path.relative(realAnchor, realCandidate)`; accept only
   when `rel !== ""`, `rel !== ".."`, `!rel.startsWith(".." + path.sep)`, and
   `!path.isAbsolute(rel)`. Never a string-prefix comparison, which treats
   `/a/bc` as inside `/a/b`.

**The bound is the repository directory, not its parent.** Upstream bounds to
`dirname(gitRoot)`, and that admits `../<anything>`: a hostile clone at
`~/Codes/hostile` setting `"root": "../My-projects"` resolves into an unrelated
projects directory and passes, because `path.relative` yields `"My-projects"` —
not empty, no `..`, not absolute. Bounding to `gitRoot` itself removes the
class. The cost is that the default sibling layout (`worktree.cjs:377`) is not
expressible from a project file; it is still the auto-detected default, and a
user who wants it elsewhere sets it in their own config.

**Project vs user asymmetry, stated deliberately.** A user-layer value is not
bounded and may be absolute. `~/.ariadnev/config.json` is written by the person
at the keyboard on their own machine; `<repo>/.ariadnev/config.json` is a
committed file that arrives with a clone from someone else. Trust follows
authorship, not key name. This is the same asymmetry `config-schema.ts:1-11`
already encodes for user-only keys — the difference is that `worktree.root` stays
project-settable and is bounded, rather than being taken away from projects
entirely.

**Realpath procedure for a target that does not exist yet.** `path.resolve` is
purely lexical, so a committed in-repo symlink (`<gitRoot>/wt -> /`) with
`"root": "wt/tmp/x"` passes step 5 with no `..` anywhere in the value. But
`worktree.root` normally names a directory that has not been created yet, and
`fs.realpathSync` throws `ENOENT` on a non-existent path, so it cannot be applied
to the candidate directly. The procedure is:

```
realAnchor  = fs.realpathSync(anchor)            // the anchor always exists
tail = []
p = candidate
while (!fs.existsSync(p)) {
  const parent = path.dirname(p)
  if (parent === p) break                        // filesystem root always exists
  tail.unshift(path.basename(p))
  p = parent
}
realCandidate = path.join(fs.realpathSync(p), ...tail)
```

Walk up to the nearest existing ancestor, resolve *that*, re-join the segments
that did not exist, and run the containment check on the result. The symlinked
`wt` exists, so it resolves to `/`, `realCandidate` becomes `/tmp/x`, and
containment fails. `fs.realpathSync` is wrapped in try/catch: a throw means
refuse, never crash.

### Whether `validateWorktreeRoot` runs on the new branch

It does not run on its own. `validateWorktreeRoot` (`worktree.cjs:293-328`) is
called from exactly two places: `worktree.cjs:339` for the `--worktree-root`
flag, and `worktree.cjs:351` for the `WORKTREE_ROOT` env var. The superproject,
monorepo, and sibling branches (`worktree.cjs:361-377`) return their paths
unvalidated. A config branch modelled on those returns would be validated by
nothing.

So the new branch **calls `validateWorktreeRoot` explicitly**, inside the config
branch of `getWorktreeRoot`, on the absolute path produced by the bound check,
after that check passes. Its failure is handled differently from the flag and env
paths: those call `outputError` and terminate, and terminating on a value a
third-party clone controls would hand that clone a denial of service. The config
branch pushes `validation.error` onto the warnings array and falls through to the
next priority.

### How `worktree.cjs` reads config

Four routes were considered:

| Route | Verdict |
|---|---|
| `require` the hook lib `kit/hooks/_lib/av-config-client.cjs` | **Rejected.** Hooks are Claude-only and install to `.claude/hooks/av` (`paths.ts:37`), while skills install to several roots (`paths.ts:9, 23`, `installedSkillDirName`). After install there is no stable relative path from the skill tree to the hooks tree, and for a provider whose `hook` cell is unverified the tree is not written at all |
| Spawn `av config prefs resolve --json` | **Rejected.** The binary is not reliably on `PATH` even on a maintainer machine; a skill script that fails when `av` is missing is worse than no setting |
| A reader inside `worktree.cjs` that restates the layer rule | **Rejected.** `av-config-client.cjs:1-19` exists specifically so the layer rule is written once, in the generated table, and never restated in a second file. A hand-rolled reader is that second file |
| A reader inside `worktree.cjs` over a **generated** field table shipped beside it | **Chosen** |

`buildHookConfigTable()` (`hook-config-table.ts:14-43`) already renders the field
table from `CONFIG_FIELDS`. The generator gains a second output path beside
`HOOK_TABLE_FILE_RELATIVE` (`hook-config-table.ts:12`) writing the identical
content to `kit/skills/worktree/scripts/config-fields.generated.cjs`. The skill's
reader does `require('./config-fields.generated.cjs')` — a **sibling** path,
which resolves in the source tree and after install alike, because a skill
directory is copied as a unit; `kit-embedded.generated.ts` already carries
`kit/skills/worktree/scripts/worktree.test.cjs` alongside `worktree.cjs`, so a
non-`SKILL.md` file under a skill demonstrably travels. No new install machinery,
and the layer rule stays generated from the one TypeScript definition.

The reader itself is small because it reads **one key**: open
`<gitRoot>/.ariadnev/config.json` and `<home>/.ariadnev/config.json`, take
`worktree.root` from each subject to the generated table's `layer` for that path,
apply the bounding rule to the project one, and return the winner plus any
warnings. It does not merge or resolve anything else.

**Malformed-file contract, reconciled with the CLI.** The CLI does not fall
through silently: `load-config.ts:71-76` warns `… is not valid JSON — the whole
file was ignored`, and `filter-project-layer.ts:57-63` warns `… does not contain
a JSON object — the whole project layer was ignored` and returns an empty layer.
The skill reader matches that contract — same three outcomes (unreadable, not
JSON, not an object), each producing an empty layer **and a warning** in the
envelope — rather than the silent fall-through the earlier draft specified. An
absent file is not a warning on either side.

### Warning channel

Never `console.warn`. `SKILL.md` step 1 (`kit/skills/worktree/SKILL.md:21-28`)
runs `worktree.cjs info --json` and parses stdout; stderr is not part of that
contract, so a warning written there may never reach the agent.

The channel is the existing `warnings` array in the JSON envelope, which
`output()` also renders in text mode at `worktree.cjs:167-170`.

- `getWorktreeRoot` returns `{ dir, source, warnings }`. Existing callers that
  ignore `warnings` keep working.
- `cmdCreate` already has a `warnings` array (`worktree.cjs:808`) emitted at
  `worktree.cjs:975` and `worktree.cjs:1065`; the config refusals are pushed onto
  it at the `getWorktreeRoot` call site (`worktree.cjs:935`).
- `cmdInfo` has **no** warnings channel today: its envelope
  (`worktree.cjs:707-719`) has no `warnings` key, and `output()`'s `data.info`
  branch (`worktree.cjs:171-192`) never prints one. Both gain it — the envelope
  key, and a print block in the info branch mirroring `worktree.cjs:167-170`.

### Precedence, after the change

```
0  --worktree-root flag
1  WORKTREE_ROOT env
2  project  <gitRoot>/.ariadnev/config.json  worktree.root  (bounded to gitRoot)
3  user     ~/.ariadnev/config.json          worktree.root  (unbounded)
4  superproject worktrees/
5  monorepo internal worktrees/
6  sibling worktrees/
```

Project above user matches `resolveConfig`'s own order for a project-layer field
(`resolve-config.ts:85-91`), so the two surfaces cannot disagree about which file
wins — and, with the bound in `filterProjectLayer`, they cannot disagree about
the value either.

### Sources reported

`worktreeRootSource` gains `project config` and `user config` as values.
`SKILL.md` step 1 already parses the field generically and needs no edit;
`worktree.cjs:179` prints it as-is.

## Related Code Files

**Create**
- `docs/decisions/0019-worktree-root-is-a-bounded-project-setting.md` — why the setting is project-layered, why the bound lives in the config layer rather than the skill script, why the bound is the repository and not its parent, why a user value is not bounded, and why upstream's two modules did not port.
- `kit/skills/worktree/scripts/config-fields.generated.cjs` — generated; a second rendering of `buildHookConfigTable()`, reachable from the skill after install.

**Modify**
- `packages/cli/src/config/config-schema.ts` — a `worktree: { root: projectField.optionalStr(...) }` branch.
- `packages/cli/src/config/config-schema.test.ts` — the layer and documentation assertions.
- `packages/cli/src/config/filter-project-layer.ts` — the project-layer bound for `worktree.root`, using the existing `DroppedKey` + warning path.
- `packages/cli/src/config/filter-project-layer.test.ts` — the bound's cases, including the symlink and non-existent-target ones.
- `packages/cli/src/config/hook-config-table.ts` — the second output path constant.
- `packages/cli/scripts/generate-config-schema.ts` — write that second file.
- `schemas/av-config.schema.json` — regenerated (`SCHEMA_FILE_RELATIVE`, `json-schema.ts:14`).
- `kit/hooks/_lib/config-fields.generated.cjs` — regenerated (`HOOK_TABLE_FILE_RELATIVE`, `hook-config-table.ts:12`).
- `kit/skills/worktree/scripts/worktree.cjs` — the reader, the config branch in `getWorktreeRoot`, the `warnings` return, and the `cmdInfo` envelope; plus the info print block in `output()`.
- `kit/skills/worktree/scripts/worktree.test.cjs` — precedence and behavioural reader cases.
- `kit/skills/worktree/SKILL.md` — document the setting and its precedence position.
- `packages/cli/src/kit/kit-embedded.generated.ts` — regenerated; see step 11.
- `README.md` — only if it lists config keys.

**Delete** — none.

## Implementation Steps

1. Write the failing schema test in
   `packages/cli/src/config/config-schema.test.ts`: `worktree.root` exists, is
   project-layered, and defaults to `null`.
2. Add the `worktree` branch to `packages/cli/src/config/config-schema.ts` using
   `projectField.optionalStr`.
3. Write the failing bound tests in
   `packages/cli/src/config/filter-project-layer.test.ts`, all through
   `filterProjectLayer(raw, sourcePath)` with a real temp directory so the
   symlink cases are genuine: an absolute value is dropped with a warning; a
   `~`-prefixed value is dropped; a control-character value is dropped; `..`
   escaping the anchor is dropped; `../<sibling-of-anchor>` is dropped (the case
   upstream's parent bound admits); a value under a symlink pointing outside the
   anchor is dropped; a plain relative value naming a directory that does not yet
   exist is kept; `.` (resolving to the anchor itself) is dropped. Assert on the
   returned `layer`, `dropped`, and `warnings` — not on a thrown error.
4. Implement the bound in `packages/cli/src/config/filter-project-layer.ts`,
   including the walk-up realpath procedure from the Architecture section.
5. Add the second table output: a new path constant in
   `packages/cli/src/config/hook-config-table.ts` for
   `kit/skills/worktree/scripts/config-fields.generated.cjs`, and a second
   `writeFileSync` in `packages/cli/scripts/generate-config-schema.ts`.
6. Run `pnpm --filter ariadnev generate:config-schema`. It rewrites
   `schemas/av-config.schema.json`, `kit/hooks/_lib/config-fields.generated.cjs`,
   and the new skill table. Confirm `json-schema.test.ts:50-56`'s drift check
   passes — note it covers `schemas/av-config.schema.json` only; there is no
   equivalent check for either generated `.cjs` table today, so the generator
   must actually be run rather than assumed.
7. Write the failing cases in `kit/skills/worktree/scripts/worktree.test.cjs`,
   exercising the reader's **behaviour** against temp `HOME` and repo dirs, not a
   layer label: flag beats env beats project beats user beats auto-detection; a
   project config with an out-of-bounds value plus a user config with a valid
   absolute one resolves to the user value, reports `user config`, and carries
   the refusal in `warnings`; a valid relative project value wins over a user
   value and reports `project config`; an unreadable file, a non-JSON file, and a
   JSON file that is not an object each yield the next priority plus a warning;
   an absent file yields the next priority with no warning.
8. Implement the reader and the config branch in
   `kit/skills/worktree/scripts/worktree.cjs`: `require('./config-fields.generated.cjs')`
   for the layer, the bound, then `validateWorktreeRoot` on the accepted absolute
   path with warn-and-fall-through on failure. Keep `getWorktreeRoot` under the
   file's existing structure and pass `gitRoot` in rather than reading
   `process.cwd()`.
9. Wire the warning channel: `getWorktreeRoot` returns `warnings`; `cmdCreate`
   (`worktree.cjs:935`) appends them to its existing array; `cmdInfo`
   (`worktree.cjs:691, 707-719`) gains a `warnings` key; `output()`'s info branch
   (`worktree.cjs:171-192`) gains a print block mirroring
   `worktree.cjs:167-170`. Confirm neither `getWorktreeRoot` call site changes
   signature.
10. Update `kit/skills/worktree/SKILL.md` with the setting, its JSON shape, its
    precedence position, and the note that an absolute value only takes effect
    from the user file.
11. Run `pnpm --filter ariadnev generate:embedded` — **last of the `kit/`
    steps**, after 5-10 have finished mutating it. Every file under `kit/`
    compiles into the single tracked artifact
    `packages/cli/src/kit/kit-embedded.generated.ts`. That file is a
    **single-writer artifact**: it is written only by
    `packages/cli/scripts/generate-embedded-kit.mjs`, never edited by hand, and
    never edited by a parallel task in the same session — a hand edit or a
    concurrent write silently ships a kit that does not match `kit/`. Running it
    before the last `kit/` edit ships an embedded kit one file behind the source.
12. Write `docs/decisions/0019-worktree-root-is-a-bounded-project-setting.md`.
13. Run `npx vitest run packages/cli/src/config --maxWorkers=2` and
    `node kit/skills/worktree/scripts/worktree.test.cjs`. The second file is a
    self-running script with its own pass/fail counters and `process.exit`, not a
    `node --test` suite, and it is not covered by the root `pnpm test` globs
    (`kit/hooks/**`, `kit/statusline/**`, `packages/cli/scripts/**`) — so run it
    directly, and see the risk table.

## Success Criteria

- [x] `worktree.root` is in `config-schema.ts` as a project-layer optional string and appears in `schemas/av-config.schema.json`, `kit/hooks/_lib/config-fields.generated.cjs`, and `kit/skills/worktree/scripts/config-fields.generated.cjs`.
- [x] `av config prefs resolve` shows the resolved value, and shows the *same* value the skill script uses — an out-of-bounds project value is absent from both, because `filterProjectLayer` dropped it before `resolveConfig` saw it.
- [x] `filterProjectLayer` drops an out-of-bounds `worktree.root` with a `DroppedKey` and a warning, asserted in `filter-project-layer.test.ts`; a valid relative value survives unchanged.
- [x] The bound is `gitRoot`, not `dirname(gitRoot)`: a project value of `../<sibling-directory>` is refused, asserted by test.
- [x] A project value reaching outside the anchor through an in-repo symlink is refused, asserted by a test using a real symlink; a value naming a directory that does not exist yet is accepted, proving the walk-up realpath procedure does not throw `ENOENT`.
- [x] An absolute, `~`-prefixed, or control-character project value is refused; the next priority wins; the command still succeeds and exits zero.
- [x] An absolute user-layer value is accepted and reported as `user config`.
- [x] Precedence flag > env > project > user > auto-detection is asserted by test.
- [x] The refusal reaches the agent through the JSON envelope's `warnings` array for both `info` and `create` — `cmdInfo`'s envelope and `output()`'s info branch both carry it — and nothing is written to stderr for this path.
- [x] The config branch calls `validateWorktreeRoot` on the accepted path and, on failure, warns and falls through instead of calling `outputError`.
- [x] The skill reader takes its layer rule from the generated sibling table and restates no key list of its own; its tests assert reader behaviour (which layer wins, what is refused), not that a field carries a `"project"` label.
- [x] The reader's malformed-file behaviour matches the CLI's: unreadable, non-JSON, and non-object files each produce an empty layer plus a warning, and an absent file produces neither.
- [x] `worktreeRootSource` reports `project config` / `user config`, and `SKILL.md` step 1 needs no parsing change.
- [ ] `pnpm --filter ariadnev generate:embedded` has been run after the last `kit/` edit, and `packages/cli/src/kit/kit-embedded.generated.ts` is staged with the change.
- [x] ADR 0019 records the decision, including the project/user asymmetry and why the two upstream modules did not port.

## Risk Assessment

| Risk | Observable signal | Pre-decided response |
|---|---|---|
| An untrusted clone's project config redirects worktree creation | A cloned repo's `.ariadnev/config.json` sets `worktree.root` and the worktree lands outside that repo | The bound lives in `filterProjectLayer`, so it applies before any consumer sees the value; absolute, `~`, and escaping values are refused before any fs write; containment uses `path.relative`, never a string prefix. Tested in step 3 |
| Two surfaces disagree about the effective value | `av config prefs resolve` prints a value the skill refuses, or vice versa | The bound is in the config layer, not the script. The skill reads what the config layer would have produced; the success criteria assert both surfaces on the same input |
| Upstream's parent-directory bound is copied by habit | `path.dirname(gitRoot)` appears in the implementation, and `../<sibling>` resolves outside the repo yet passes | The bound is `gitRoot`; a dedicated test asserts `../<sibling-of-anchor>` is refused, which is exactly the case a parent bound admits |
| A symlink defeats the lexical resolve | A committed in-repo symlink plus a relative value with no `..` lands outside the repo | Both sides are realpath-resolved. The candidate uses the walk-up procedure (nearest existing ancestor, then re-join), because `fs.realpathSync` throws `ENOENT` on the not-yet-created target the setting normally names. A `realpathSync` throw means refuse |
| Refusal terminates the command and a hostile clone gains a denial of service | `av:worktree` exits non-zero on a repo with a bad config value | Refusal warns and falls through. `outputError` is deliberately not used on this path, unlike the flag (`worktree.cjs:339-344`) and env (`worktree.cjs:351-356`) paths |
| The refusal is invisible to the agent | The agent proceeds as if the configured root applied | The warning goes into the JSON envelope's `warnings` array, which `SKILL.md` step 1 already receives, never to stderr. `cmdInfo` gains the key and `output()`'s info branch gains the print block, since neither exists today |
| The skill reader drifts from the CLI's layer rule | The CLI treats the key as user-only while the script still honours a project value | The reader reads the generated sibling table, so there is no second hand-kept list to drift. A layer flip changes both renderings at once |
| The generated skill table is not reachable after install | `require('./config-fields.generated.cjs')` throws for some provider | It is a sibling inside the skill's own directory, and skill directories install as a unit — `kit-embedded.generated.ts` already carries `worktree.test.cjs` beside `worktree.cjs`. Verify by installing to a scratch dir for one non-Claude provider before the PR |
| Neither generated `.cjs` table has a drift check | A commit lands with the definition changed and the tables stale | Known gap: `json-schema.test.ts:50-56` covers `schemas/av-config.schema.json` only. Step 6 runs the generator explicitly, and all generated files are staged together. Adding a drift test for the two tables is a candidate follow-up, not this phase's scope |
| `worktree.test.cjs` is not in the default suite | New bounding tests never run in CI, and a regression ships green | The load-bearing bound tests live in `filter-project-layer.test.ts`, which vitest does run (`include: packages/**/src/**/*.test.ts`). The skill file's tests are the integration layer and are run by hand in step 13 |
| The embedded kit ships stale | The binary installs a `worktree.cjs` without the reader, or without the generated table beside it | Step 11 regenerates `kit-embedded.generated.ts` after the last `kit/` edit. It is a single-writer artifact — generator only, never hand-edited, never written by two tasks at once |
| Adding a schema branch shifts an assertion elsewhere | An unrelated config test fails | Expected; update the assertion, do not loosen it |
| Users expect `av config set worktree.root` | A bug report that the setting cannot be written from the CLI | There is no `config set` — only `config prefs resolve` (`register-config-commands.ts:10-24`). `SKILL.md` documents editing `.ariadnev/config.json` directly. Adding a writer is out of scope here |
