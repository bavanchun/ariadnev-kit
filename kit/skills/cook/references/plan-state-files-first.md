# Plan State: Files-First Model

Shared by every skill that creates, resolves, or mutates a plan (`av:plan`,
`av:issue-to-plan`, `av:cook`, and any other skill referencing this file).
This is the single description of where plan state lives — do not restate a
divergent copy in another skill; link here instead.

## Canonical state = repo files

- `plans/<timestamp>-<slug>/plan.md` plus `phase-NN-*.md` in the repo ARE the
  plan. Hand-editable Markdown. They are the deliverable of planning skills and
  the only thing implementation skills read to know what to build.
- A directory is a plan directory when it contains `plan.md`. Nothing else
  qualifies: `list` passes over one without it, and any command asked to act on
  it refuses rather than guessing.
- A project with no GitHub remote, no `gh` auth, and no network still has a
  fully working plan — because the files are the plan.

## `av plan` = a reader and a frontmatter editor, not an index

There is **no database and no index**. Nothing is cached, nothing can drift out
of sync, and nothing needs rebuilding. `av plan reindex` re-reads every plan and
reports what is malformed; its own help says "there is no index to rebuild".
When this file says *index*, it means `plan.md` — the human-readable plan index
and its phases table — never a machine one.

The whole surface, from `av plan --help`:

| Command | What it does | Writes? |
|---|---|---|
| `use <name>` | Points the current branch at a plan directory | pointer file |
| `show` | Prints the branch's plan and its phases | no |
| `list` | Every plan directory: status, completed/total phases | no |
| `resolve` | Prints the branch's plan directory path | no |
| `update <phase> <status>` | Sets one phase's status | phase file + `plan.md` table |
| `check <phase>` / `uncheck <phase>` | `update <phase> completed` / `… pending` | same |
| `status [status]` | Reads the plan's own status, or sets it | `plan.md` when setting |
| `close` | Exactly `status completed` | `plan.md` |
| `phase <phase>` | Prints one phase file in full | no |
| `search <query>` | Case-insensitive substring across every plan's files | no |
| `reindex` | Re-reads every plan, reports what is malformed | no |
| `archive` | Moves a finished plan under `<plans>/archive/` | moves the directory |
| `cleanup` | Lists finished plans still in the root; `--archive` moves them | only with `--archive` |

Notes that decide whether a call works:

- **There is no `create` and no `add-phase`.** No CLI command scaffolds a plan
  directory, a `plan.md`, or a phase file. The agent writes plan content
  directly as files. Do not invent `av plan create`, `av plan add-phase`, or
  `av plan publish`; none exists.
- `<phase>` is always a **phase number**, never a file name. `check 3`, not
  `check phase-03-schema.md`.
- `update` takes two **positional** arguments, `<phase> <status>`. There is no
  `--status` flag. Valid statuses: `pending`, `in-progress`, `completed`,
  `cancelled`.
- `status` sets the **plan's** status; `update` sets a **phase's**. They are
  different files.
- `close` is an alias for `status completed` — it rewrites `plan.md`'s
  frontmatter like any other edit. It is not a separate lifecycle state, it is
  not "index-only", and there is nothing it does that `status completed` does
  not.
- `--json` is on every subcommand. `--plan <name>` (act on a plan other than the
  branch's) is only on the ones that act on a single plan: `update`, `check`,
  `uncheck`, `status`, `close`, `phase`, `archive`. `use`, `show`, `list`,
  `resolve`, `search`, `reindex` and `cleanup` do not take it. `archive` also
  takes `--force`; `cleanup` takes `--archive`; the global `--dry-run` is
  honoured by `archive`.
- An edit rewrites only the one frontmatter line it is changing. Key order,
  spacing, unknown keys and the body are left alone, so a hand-written key
  survives every CLI write — the CLI simply never reads it back. The only
  frontmatter it reads at all is `status`, `phase` and `title`.
- `update` also rewrites the matching `| N | … | status |` row in `plan.md` when
  there is one, and says `(no row for it in the index table)` when there is not.
  A missing row is not an error; the phase file is the record.

## Current-plan resolution

- The pointer lives at `.ariadnev/current-plan.json` and is **keyed by branch
  name**. Detached HEAD and non-git directories share the key `(no branch)`.
- `av plan use <name>` sets it for the current branch. It refuses a name that is
  not a plan directory rather than pointing at nothing.
- `av plan resolve` prints the plan directory path for that branch. It **exits
  non-zero** when the branch has no pointer, and again when the pointer names a
  directory that is no longer there. It does not search by git remote, by
  worktree path, or by anything else — no pointer means no answer.
- Because the pointer is per-branch, a plan selected on a feature branch is not
  visible from the target branch after a merge. Use `av plan list` or
  `--plan <name>` there; `resolve` will correctly report nothing.
- `av plan show` reads the branch's plan and its phases. It takes no argument —
  not a plan directory, not `--plan`. A stray positional is **silently ignored,
  not rejected**: `av plan show <other-plan>` prints the branch's plan and exits
  0, and `resolve` behaves the same way, so a skill that passes a name gets a
  confident answer about the wrong plan. (`--plan` does error out.) For a
  specific plan, read the files, or use `av plan phase <n> --plan <name>`.
- Nothing hides a plan from `list` or `resolve` except `archive`, which moves
  the directory. A `completed` plan still resolves and still lists.

## GitHub issue = optional visibility projection, never canonical

- Publishing is the agent's job, not the CLI's: the agent projects a validated
  plan onto a GitHub issue (create or update) with `gh` / the GitHub API. There
  is no `av plan publish` command.
- Publishing is never required and never the source of truth. Skip it entirely
  in a repo with no GitHub remote, no `gh` auth, or when the user does not ask
  for it — the plan is still fully usable as files. When the user asks to publish
  but `gh`/GitHub auth is unavailable, skip without failing and report one line
  suggesting how to enable it (e.g. `gh auth login`).
- Publishing never overwrites the body of a pre-existing issue a plan was
  created from (e.g. via `av:issue-to-plan`); it only adds links, comments, or
  labels.
- If the files and a linked issue ever disagree on status, the files win. The
  issue is a mirror, not a lock.

### Publish-safety protocol

When an agent does project a plan onto an issue, follow this so the projection is
safe, idempotent, and recoverable. Run `av plan --help` and each subcommand's
`--help` for exact flags.

1. **Gate every publish, not just the first.** Visibility can flip and new phase
   evidence appears, so on each write confirm the target repo/issue visibility is
   acceptable for the content, then run a secret scan over the *rendered*
   projection text after composing it. Never project raw logs, env values,
   tokens, credentials, or local absolute paths. If the rendered body would
   exceed GitHub's comment limit (65,536 chars), truncate to a repo-relative
   plan-path link — do not split across comments.
2. **The CLI cannot record provenance — the issue itself has to carry it.**
   There is no store for an issue number, a comment id, or a PR number: no
   `--issue`, no `--root-comment-id`, no `--linked-pr`, no `av plan phase
   update`. A `Tracking: #<n>` line in the plan body, or an extra frontmatter
   key, is preserved across CLI edits and is a fine breadcrumb for a human, but
   no command reads it back. So the marker in step 3 is not an optimisation —
   it is the only durable link between a plan and its projection.
3. **Adopt before you create.** Because nothing is recorded anywhere, *every*
   run starts with no knowledge of an existing projection — not just a fresh
   clone or a teammate's machine. Embed a stable marker in every bot-authored
   projected comment:
   `<!-- ariadnev-plan <plan-dir-basename> hash=<12-hex> branch=<branch> -->`.
   Before creating a new root comment, scan the issue's existing comments for that
   marker; on a unique authored-by-self match, **adopt** it instead of posting a
   duplicate.
4. **Author-verify before editing.** Only edit a comment the current `gh`
   identity authored (`gh api .../comments/<id> -q .user.login` equals the
   authenticated login). Identities differ across machines and CI (a
   `GITHUB_TOKEN` acts as `github-actions[bot]`), so on a mismatch — or a missing
   or edited marker — **append a new marked comment**; never edit another author's
   comment and never abort the delivery over it.
5. **Rev-echo for idempotency and tamper detection.** The marker carries a short
   content hash of the rendered body. Before rewriting, re-read the comment: if
   the hash matches what you last wrote, skip the write; if the marker or hash is
   missing or altered, a human or another bot touched it — append rather than
   overwrite. Do not build compare-and-swap or "the on-issue revision is newer,
   stop and reconcile" logic: the projection is derived and regenerable, the files
   always win, and GitHub's comment API has no atomic swap. Last-writer-wins among
   your own verified projections is acceptable.
6. **Fail safe on missing or rate-limited issues.** A 404/410 (issue transferred,
   deleted, or locked) → report and stop; never auto-create a replacement issue
   (a transfer only changes the repo-scoped API path, so 404 ≠ deleted). On rate
   limits or a partial write, back off, skip, and report — never retry-loop.
   Nothing is recorded anywhere between runs, so recovery rests entirely on the
   marker plus author-verify: the next run re-scans the issue, finds its own
   marked comment, and adopts it.

## Delivery finalization (on ship)

When a plan-backed change ships, finalize the plan so its files stop reading as
active work — the core "stale plan read as false context" mitigation. This is
**one write, at one moment**: the plan's status lives in `plan.md` and nowhere
else, so there is no second, post-merge step to perform.

**On ship success, before the ship commit:**

1. `av plan resolve`. It exits non-zero for two different reasons, and they are
   not the same event. "nothing selected for `<branch>`" means this branch has
   no plan — **skip finalization silently**, because most ships carry no plan.
   "`<branch>` points at `<name>`, which is not there" means the pointer is
   stale: **warn and print the plan-dir path**. Swallowing the second one hides
   exactly the stale-plan state this step exists to catch. `--json`
   distinguishes them as `found: false` versus `plan: null`.
2. Check the phases against the diff. `av plan show` prints each phase and its
   status. Where the diff proves a phase done, `av plan check <n>` it.
3. If the work is genuinely partial, `av plan status in-progress` and stop —
   never blind-complete a half-done plan.
4. When the plan is actually complete, `av plan status completed` (`av plan
   close` is the same write). This rewrites `plan.md`'s frontmatter `status:`.
   The ship's own `git add -A` + commit then carries the finalized plan files
   onto the branch, so `status: completed` reaches the target branch in the
   **same merge** as the code it describes — the files can never claim
   completion for code that did not land. Make this a synchronous/foreground
   step; do not fold it into a background writer.

**After the merge:** nothing is required. Marking the plan completed did not
hide it from anything — `resolve` and `list` still return a completed plan — so
there is no separate close to perform and no linkage to record. Two optional
steps, in the merge flow:

- `av plan archive --plan <name>` moves a finished plan under `<plans>/archive/`
  once you want it out of `list`. It refuses unless the plan reads `completed`
  or `cancelled` (or you pass `--force`), so it cannot quietly bury live work.
  Note that archiving a plan a branch still points at leaves a stale pointer:
  `resolve` then reports the directory is not there, and exits non-zero.
- If the plan records an issue, **append** (never edit) a marked completion
  comment per the publish-safety protocol above.

Matching a merged PR back to its plan has to be done from the branch name or the
plan directory name — the CLI stores no PR linkage. Post-merge you are on the
target branch, whose pointer is a different key, so use `av plan list` rather
than `resolve`, and skip silently when nothing matches.

Degrade honestly: if `av` is unavailable or any step fails, report the exact
plan-dir path and reason and complete the delivery with a warning — never
hand-edit a status line and never delete plan files.

## Rules for skills consuming this model

1. Read the current plan with `av plan resolve` (the path) or `av plan show`
   (the phases). Both answer for the current branch only, and both exit non-zero
   when it has no pointer — treat that as "no plan", not as an error. Set the
   pointer with `av plan use <name>` when a skill selects a plan.
2. Read phase content via `av plan phase <n>` or the files directly, never from
   issue comments.
3. Change status through `av plan status` (the plan) and `av plan update` /
   `check` / `uncheck` (a phase) rather than hand-editing frontmatter. Only the
   three phase commands touch the phases table in `plan.md`; `status` and
   `close` rewrite the plan's own `status:` line and nothing else.
4. Write plan and phase *content* as files. No CLI command creates them.
5. Treat GitHub publishing as an additive, opt-in visibility step that runs
   after the plan is already valid as files — never as a prerequisite for
   planning or implementation to proceed.
6. Before invoking any subcommand, run `av plan --help` and the subcommand's
   own `--help`; those live surfaces own exact flags, not this file.
