# Kongming checkpoint — phase 3 landed, phase 4 about to start

Date: 2026-09-04 · Model: Fable 5.1 (`claude-fable-5-1`) · Advisory only, nothing edited.

Grounded in: the phase-4 plan file, the 2.1.260 observation record, ADR 0006,
`spec-verified.ts` (claude-code row), `filter-project-layer.ts` **as it is in the
working tree right now** (the bound is already being implemented — `refuseWorktreeRoot`,
`realpathOfPossiblyAbsent`, `isStrictlyInside` are on disk uncommitted), the new
test block in `filter-project-layer.test.ts`, `worktree.cjs` (`getWorktreeRoot`,
`validateWorktreeRoot`, `cmdInfo`, `cmdCreate`, `output()`), `install-plan.ts`,
`project-detector.cjs`, the official Claude Code output-styles doc page (fetched
today), and two scratch experiments (dangling-symlink `mkdir`; `git worktree add`
into `.git/`).

## TL;DR

1. **Phase 3: GO as landed.** `convention` on the shipped-artefact ground is
   defensible and, given the provider's current docs, conservative. One wording
   correction: `/output-style` was not "interactive-only" on 2.1.260 — the
   provider removed it in 2.1.91; the interactive surface is `/config`. Fix the
   note text in `spec-verified.ts`, the observation record, and ADR 0006 so the
   record does not cite a command that does not exist.
2. **Phase 4 bound: sound. No escape found.** TOCTOU does not matter under this
   threat model (proved: `mkdir -p` cannot be pushed through a dangling symlink).
   Two cheap hardenings worth adding to *both* implementations: (a) refuse a
   candidate whose first segment under the anchor is `.git` — git 2.54 happily
   creates a checkout at `<repo>/.git/worktrees/<name>` and `<repo>/.git/hooks/<name>`
   (proved, exit 0); (b) use `lstatSync` instead of `existsSync` in the walk-up so
   a dangling in-repo symlink is refused now with a warning rather than failing
   later as `MKDIR_FAILED`.
3. **Biggest execution risk:** the security rule will exist twice — TypeScript in
   `filter-project-layer.ts` and JavaScript in `worktree.cjs` — and only the
   TypeScript copy runs in CI. Mirror the test cases one-for-one by name and
   either wire `worktree.test.cjs` into the root `test` script or accept the gap
   explicitly in the ADR.

## Q1 — Phase 3 go/no-go

**Verdict: GO.** Evidence, strongest first:

- The provider's current documentation (code.claude.com/docs/en/output-styles,
  fetched 2026-09-04) states custom styles load from `~/.claude/output-styles`
  (user) and `.claude/output-styles` (project), selected via `/config` or the
  `outputStyle` setting, with `name`/`description`/`keep-coding-instructions`
  frontmatter. That is a citation, not an observation, so it does not lift the
  cell to `observed` under ADR 0006 — but it means writing there is not a
  dead-letter path. `convention` on the binary's own enum is the right rung and
  is if anything under-claimed.
- All six kit styles already carry `keep-coding-instructions: true`
  (`kit/output-styles/*.md:1-5`). This matters: the doc says a custom style
  *replaces* the built-in SWE instructions unless that flag is set. Had it been
  missing, a user picking "Senior Engineer Mode" from `/config` would have
  silently lost Claude Code's coding instructions. It is present; no action.
- Ownership: every `write` op lands in the receipt (`install-receipt.ts:37-60`
  records `files` with kind + sha256), and `install-heal.ts:1-16` removes what an
  older receipt claimed and the new one does not. So if a later build stops
  writing native styles, heal owns the removal. No orphan hazard.
- Hook interplay: `project-detector.cjs:340-341` probes `<configDir>/output-styles/<name>.md`
  first, then the sidecar; both are now byte-identical from `style.raw`
  (`install-plan.ts:189-195`), so the probe order cannot change the injected text.

**Real but minor user-visible consequences, worth a changeset line, not a code change:**

- Six new entries ("ELI5 Mode (Level 0)" … "God Mode (Level 5)") now appear in
  every Claude Code user's `/config` output-style picker after a global install.
- If a user *both* selects one natively (Claude Code puts it in the system prompt)
  *and* has `codingLevel` set (session-init injects the same text at start),
  the guidance is present twice. Benign, but document: "pick one mechanism".
- Installing to `~/.claude/output-styles/coding-level-N-*.md` will overwrite a
  user file of exactly that name (backed up, last 3). The "user-authored native
  style wins" doctrine now only holds for a *different* filename. Acceptable;
  state it in the ADR paragraph that argues the sidecar stays.

**Correction to make:** the spec note, the observation table row for
`/output-style`, and ADR 0006 say "`/output-style` is interactive-only". Per the
provider's doc it was deprecated in 2.1.73 and removed in 2.1.91. Replace with:
"`/config` is the only selection surface and is interactive-only". Three
string edits; do it in the phase-4 commit or a tiny docs commit — it is a
factual error in a verification record and those are the records the whole
`spec-verified.ts` gate rests on.

## Q2 — Attacking the phase-4 bound

Read against the code now on disk (`filter-project-layer.ts:64-112`), which
matches the plan's Architecture section exactly.

### TOCTOU — does not matter here; do nothing about it

The threat is *data* (a committed `config.json`) choosing a directory. Data
cannot race a process. To exploit the gap between `realpathOfPossiblyAbsent`
and `mkdirSync`/`git worktree add`, an attacker needs a concurrently running
process with write access to the repo directory as this user — at which point
they already have everything the bound protects. Do not add `O_NOFOLLOW`
gymnastics or a post-mkdir re-check; it would be theatre.

Also proved in scratch: the kernel does not create through a dangling symlink.
With `<repo>/dangling -> /nonexistent`, `fs.mkdirSync("dangling/x", {recursive:true})`
→ `ENOENT`, and `mkdirSync("dangling", {recursive:true})` → `ENOENT`. So a
committed dangling link cannot be "activated" by the create step either.

The one thing that *is* structurally important is already true: `cmdCreate`
calls `getWorktreeRoot` itself (`worktree.cjs:935`) and then mkdirs
(`worktree.cjs:982`) in the same process. The bound must run in `create`, not
only in `info`. Keep it that way; add a test that `create --dry-run --json` with
an out-of-bounds project value reports the fallback root, not the config one.

### Dangling symlink in the walk-up — one-line hardening (recommended)

`realpathOfPossiblyAbsent` uses `existsSync`, which follows symlinks and returns
`false` for a dangling one. So `<repo>/wt -> /tmp/absent` with `"root": "wt/x"`
walks past `wt` as if absent, re-joins it, and *accepts* (`<repo>/wt/x` is
"inside"). Not an escape (see above), but the failure surfaces later as
`MKDIR_FAILED`, an `outputError` termination — exactly the DoS-by-clone the
plan says the config branch must not produce. Use `lstatSync` in a try/catch
instead of `existsSync`: the link then counts as existing, `realpathSync` on
it throws, and the value is refused with the warning the plan wants. Same
change in the `.cjs` twin. Add the case to both test lists.

### `.git` is inside the anchor — exclude it (recommended)

Proved with git 2.54.0: `git worktree add .git/worktrees/repo-feat -b feat`
exits 0, and the checkout's `.git` file, `index`, `HEAD`, `commondir`, `gitdir`
all land in **the same directory** as the admin dir git creates for it (name
collision). `.git/hooks/<name>` also exits 0. Nothing in the bound stops a
project value of `".git/worktrees"` or `".git/hooks"`. This is not an escape
and git could remove the collided worktree with `--force`, but it lets a clone
direct a checkout of its own content into this machine's git metadata
directory, and `git worktree prune`/`gc` behaviour on a collided admin dir is
undefined. One line in `isStrictlyInside`'s caller (refuse when
`rel.split(sep)[0] === ".git"`), one test, same in the twin. Also covers the
linked-worktree case where `.git` is a file (currently accepted, then
`ENOTDIR` later).

### `path.relative` containment — holds

`rel !== ""`, `rel !== ".."`, `!rel.startsWith(".." + sep)`, `!isAbsolute(rel)`
(`filter-project-layer.ts:77-81`) is correct on POSIX and win32. Checked the
usual tricks:

- `/a/bc` vs `/a/b`: `relative` yields `../bc` → refused. Good.
- Windows drive-relative `C:foo`: `isAbsolute` is false, so step 2 passes; but
  `resolve(anchor, "C:foo")` lands on drive C's cwd, `relative` across drives
  returns an absolute path → `isAbsolute(rel)` refuses. Step 5 is the real
  guard; steps 1-2 are messaging. Make sure the test file says that (one
  comment), so nobody later "simplifies" step 5 because "step 2 already checks
  absolute".
- Case-insensitive APFS: a casing mismatch can only make an inside path look
  outside (false refusal), never the reverse. Fine.
- `.ariadnev` symlinked elsewhere: anchor is `dirname(dirname(sourcePath))`,
  lexical, so the repo remains the boundary regardless of where the file really
  lives. Correct.

### Bound to `gitRoot`, not `dirname(gitRoot)` — correct, keep

The `../other-project` test (`filter-project-layer.test.ts` "refuses a sibling")
is the case that justifies the whole decision. Nothing to add.

### Bound in `filterProjectLayer` — correct, with one caveat to write down

Right place: `load-config.ts:89-90` forwards its warnings; `resolveConfig` never
sees the value. Caveat: `av config prefs resolve` anchors on `global.cwd`
(`register-config-commands.ts:19`) while the skill anchors on
`git rev-parse --show-toplevel` (`worktree.cjs:237`). From a subdirectory the
CLI finds no project file at all. Pre-existing for every project key, not this
phase's bug — but the success criterion "both surfaces show the same value" is
only true with cwd = repo root. Qualify the criterion and the ADR sentence;
do not fix it here.

### `validateWorktreeRoot` depth vs the bound — UX mismatch, document it

The bound accepts any depth; `validateWorktreeRoot` (`worktree.cjs:311-325`)
accepts at most one missing parent. So `"root": "a/b/c/worktrees"` passes the
bound and is then warned-and-skipped by the skill while `av config prefs resolve`
prints it as effective. Two surfaces disagreeing is the plan's own risk row.
Either relax `validateWorktreeRoot` for the config branch (it is followed by
`mkdirSync({recursive:true})` anyway, so the one-level rule protects nothing
there) or say in `SKILL.md` "at most one missing parent". Relaxing is the KISS
answer; state it in the ADR.

### Project above user — right for consistency, state the consequence

A user's global `~/.ariadnev` `worktree.root=/Volumes/fast/worktrees` is
overridden inside any clone that ships a valid relative value. That is what
"project-layer key" means everywhere else (`resolve-config.ts:85-91`), and the
bound makes the override harmless. Put the sentence in ADR 0019 so it is not
re-litigated as a bug.

## Q3 — Biggest risk, and the step list

**Biggest risk: the rule is written twice and only one copy is tested in CI.**
The plan says "one definition, two surfaces" — that is true of the *layer
table* (generated) but not of the *bound*, which will be hand-written in TS and
again in `worktree.cjs`, dependency-free by necessity. `worktree.test.cjs` is
outside every `pnpm test` glob (`package.json:10`). A future edit to one copy
ships green. Mitigations, cheapest first:

1. Name the test cases identically in both files and keep them in the same
   order — a reviewer can diff the two lists by eye.
2. Add `node kit/skills/worktree/scripts/worktree.test.cjs` to the root `test`
   script if it runs clean locally in a reasonable time. One line; makes the
   security tests run in CI. If it is flaky or slow, say so in the ADR instead
   of silently leaving it out.
3. Note for the ADR: the `hook-config-table.ts` header (line 6-7) promises "a
   test compares the checked-in file with this generator" — there is no
   `hook-config-table.test.ts`. The plan already lists the drift check as a
   follow-up; with a second generated output being added, a 10-line test that
   compares both checked-in files to `buildHookConfigTable()` is worth doing in
   step 6 rather than deferring. Optional; flag as beyond plan scope if skipped.

**Step list — keep the order; three additions, no drops:**

- Steps 1-4 are in flight. Add to step 3/4: the `.git` refusal, the
  dangling-symlink refusal (with `lstatSync`), and a `create --dry-run` twin of
  the `info` assertion.
- Step 6: consider the drift test above.
- Step 8: relax the one-missing-parent rule for the config branch, or document
  it. Decide before writing `SKILL.md` in step 10.
- Step 12: ADR 0019 must carry the four caveats above (cwd anchor, project>user,
  depth rule, twin implementations + CI gap) and the `/output-style` wording
  correction can ride the same commit if not done separately.
- Step 13: also run `pnpm lint` and `npx vitest run packages/cli/src/kit` after
  step 11 — the embed regeneration is the step most likely to be forgotten or
  run one file early, and the kit tests are what catch it.

## Assumptions

- The dangling-symlink and `.git` experiments were run on macOS with git 2.54.0
  and Node from this machine's PATH; Linux semantics are the same for `mkdir`
  through a dangling link (POSIX). Confidence: high.
- `global.cwd` is `process.cwd()` and absolute; if it can be relative, the
  anchor still resolves against the same cwd, so the bound is unaffected.
  Confidence: high.
- The provider doc page fetched today describes 2.1.260 behaviour. It names
  2.1.257 for the VS Code path and 2.1.237 for Concise, so it is current.
  Confidence: high. If a future doc removes `~/.claude/output-styles`, the cell
  should drop back to `none` — the observation record already says so.
- Wiring `worktree.test.cjs` into `pnpm test` assumes it is deterministic; not
  run here. Confidence: medium — verify locally before adding.

Status: DONE_WITH_CONCERNS
Summary: Phase 3 is a GO; the phase-4 bound is sound with no escape found, and two cheap hardenings (`.git` exclusion, `lstatSync` in the walk-up) plus a wording fix for the `/output-style` claim should ride the phase-4 commit. The risk to watch is the bound existing twice with only the TypeScript twin in CI.
Concerns/Blockers: none blocking; the `/output-style` note is a factual error in a verification record and should be corrected before the row is cited again.
