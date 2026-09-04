# 0019. `worktree.root` is a project setting whose value is bounded

Date: 2026-09-04
Status: Accepted.

## Context

The worktree skill picks where a repository's worktrees are created by
auto-detection — superproject, then monorepo, then a sibling directory — and the
only way to override it was `--worktree-root` on every invocation, or the
`WORKTREE_ROOT` environment variable. Neither persists. A repository that wants
its worktrees in one place has had to say so every time.

The obvious fix is a config key. What makes it worth an ADR is that the answer is
a fact about the workspace — which argues for the project layer — while the value
decides where directories are created on the reader's disk, and a project config
file is committed. It arrives with whatever repository somebody cloned.

Every other project-overridable key is safe whatever it says, because it names
something inside the repository by construction: `paths.docs` is a directory in
the repo, `plan.*` describes the repo's own plans. `worktree.root` is the first
project key that names a filesystem destination.

## Decision

`worktree.root` is a **project-overridable** key, and its **value** is checked in
addition to its key name.

From a project file the value must be:

- a string, non-empty, free of control characters;
- relative (an absolute path is refused, and so is a leading `~`);
- resolving strictly inside the repository that supplied the file, with both
  sides realpath-resolved;
- not inside that repository's `.git/`.

From the user's own `~/.ariadnev/config.json` the value is not bounded and may be
absolute. Trust follows who wrote the file, not what the key is called.

A refused value is dropped, warned about, and the next source in the precedence
list applies:

```
--worktree-root  >  WORKTREE_ROOT  >  project config  >  user config  >  auto-detection
```

### The bound is the repository, not its parent

`path.relative(anchor, candidate)` with `anchor = <repo>` refuses `../elsewhere`,
`worktrees/../../elsewhere`, and — the case that decides it — `../other-project`.
Anchoring on the repository's *parent* would accept that last one: the relative
path is `other-project`, with no `..` and no absolute prefix. On a normal machine
the parent is a projects directory or a home directory, so that bound would let a
clone name its neighbours. The repository is the boundary.

The check is never a string-prefix comparison, which would read `/a/bc` as inside
`/a/b`. Of the four arms (`""`, `".."`, a `../` prefix, `isAbsolute`) the last is
the load-bearing one on Windows: a drive-relative `C:foo` is not absolute as
written, but resolves onto another drive, and `relative` across drives answers
with an absolute path.

### Symlinks, and a target that does not exist yet

`realpathSync` throws `ENOENT` on an absent path, and this setting normally names
a directory nothing has created. So the check walks up to the nearest ancestor
that is present, resolves that, and re-joins the tail — which still catches a
symlink partway along the path, the case a lexical resolve misses entirely.

"Present" is `lstatSync`, not `existsSync`. A dangling symlink does not exist by
the latter, so the walk would step straight over it and call the result inside,
while where it actually points stays unknowable until something creates the
target. Treating the link as present makes `realpathSync` throw, and a throw is
refused.

### `.git/` is inside the repository and still excluded

`git worktree add .git/worktrees/<name>` succeeds, and the checkout lands on top
of the admin directory git creates for that same worktree; what `prune` and `gc`
then do is undefined. A clone does not get to aim anything at this machine's git
metadata, so a first path segment of `.git` is refused even though it is inside
the bound.

### The check lives in the config layer

`filterProjectLayer` already strips project files down to the keys they may set,
structurally, before `resolveConfig` ever sees them. The value check goes in the
same place. Putting it only in the skill script would let
`av config prefs resolve` print a value the script silently refuses, and any
future consumer of `resolveConfig` would inherit no protection at all.

## Consequences

**A clone's relative value overrides the user's global absolute one.** That is
what "project-overridable" means for every other key, and the bound is what makes
it harmless. It is a design consequence, not a bug to reopen.

**Two surfaces resolve the project file from different anchors.** The CLI anchors
on the process cwd; the skill anchors on `git rev-parse --show-toplevel`. Run
from a subdirectory, the CLI finds no project file at all. This is pre-existing
for every project key and is not changed here — but "both surfaces show the same
value" only holds from the repository root.

**The one-missing-parent rule is lifted for the config branch.**
`validateWorktreeRoot` accepts at most one missing parent level, which catches a
mistyped `--worktree-root` while the person is at the keyboard and can retype it.
A bounded config value is a different case: the create step mkdirs recursively,
so the rule protects nothing there and would only make the skill and
`av config prefs resolve` disagree about the same setting. `a/b/c/worktrees` is
accepted.

**A refusal warns; it never terminates.** The refusal rides the JSON envelope's
`warnings` array on `info` and on `create` — never stderr, because the skill
parses stdout. Failing the command outright would hand a hostile clone a denial
of service on a repository the user has every right to work in.

**TOCTOU is not defended against, deliberately.** The threat is data: a committed
file choosing a directory. Exploiting the gap between the check and the `mkdir`
needs a concurrent process with write access to the repository as this user,
which already has everything the bound protects. The kernel also refuses to
create through a dangling symlink, so a committed dangling link cannot be
activated by the create step either.

**The rule exists twice.** The TypeScript in `filter-project-layer.ts` and a
dependency-free mirror in the worktree skill's script, which cannot import it. To
keep the copies honest the test cases are named identically and kept in the same
order in both files, and `node kit/skills/worktree/scripts/worktree.test.cjs` is
now part of the root `test` script — so the second copy is covered in CI rather
than only locally. The generated layer table both consumers read is compared
against its generator by a test, in both of the places it is checked in.
