# Release and Social Workflow

Load this reference for Steps 6-9 and optional Step 14. The main ship workflow
(`ship-workflow.md`) owns ordering and the Step 13 terminal-state gate.

## Step 6: Version Bump (conditional)

1. Auto-detect version source (see `auto-detect.md`)
2. If no version file found: **skip silently**
3. Auto-decide bump level from diff size:
   - **< 50 lines:** patch bump
   - **50+ lines:** patch bump (default safe choice)
   - **Major feature or breaking change:** Use `ask_user capability` — "This looks like a significant change. Bump minor or patch?"
4. For beta mode: use prerelease suffix (e.g., `1.2.4-beta.1`)
5. Write new version to detected file

## Step 7: Changelog (conditional)

1. Check for CHANGELOG.md or CHANGES.md
2. If not found: **skip silently**
3. Auto-generate entry from ALL commits on branch:
   - `git log <target>..HEAD --oneline` for commit list
   - `git diff <target>...HEAD` for full diff context
4. Categorize into: Added, Changed, Fixed, Removed
5. Insert after file header, dated today
6. Format: `## [X.Y.Z] - YYYY-MM-DD`

**Do NOT ask user to describe changes.** Infer from diff and commits.

## Step 8: Journal (background)

**Skip if:** the shared "Journal step — opt-out" applies — the `--skip-journal`
flag was passed, or the journal skill's own config sets `auto: false`
(`.ariadnev/journal.yaml`, or the `journal:` block of `.ariadnev/config.yaml`,
read by `av:journal`'s `scripts/resolve-config.cjs`). That is a different config
system from `av config prefs resolve --json`, whose envelope carries no journal
fields. Precedence: flag > project config > user config > default (`true`).
Print one line and continue to Step 9:
- `journal skipped by --skip-journal` (flag), or
- `journal skipped by preference` (config).

Explicit `/av:journal` and `av journal create` are unaffected.

Write a technical journal entry capturing this ship session. Run as **background task** to not block pipeline.

1. Invoke `/av:journal` skill via `journal-writer` subagent in background:
   - Topic: summary of shipped changes (from commit messages + diff stats)
   - Include: what was shipped, key decisions, technical challenges encountered
   - Output: saved under the configured docs dir, in `journal/`
   - Authority: chronological work record only; durable decisions belong in
     current docs or ADRs
2. Don't wait for completion — continue to next step immediately.

## Step 9: Docs Update (conditional, background)

**Skip if:** `--skip-docs` flag OR ship mode is `beta`.

Update project documentation for official releases. Run as **background task**.

1. Invoke `/av:docs update` skill via `docs-manager` subagent in background:
   - Analyzes code changes since last release
   - Updates relevant docs in `./docs/` directory
2. Don't wait for completion — continue to next step immediately.

## Step 14: Social publish (if `--social`)

**Skip this whole step if:** `--social` was not passed (byte-identical
behavior to today), or `--skip-journal` was passed (a social post always
requires the journal write it's based on — this is a stronger skip than the
Step 8 opt-out, since `--social` is itself an explicit user choice that
`journal.auto = false` does **not** suppress).

When `--merge` was present, run this step only after the Step 13 terminal
state reports `Verdict=Approve`, `Merge=merged`, and `CI=green`. Without
`--merge`, the green-PR-check gate in item 1 decides eligibility.

1. **CI must be green before anything else.** Never post about a broken PR:
   ```bash
   gh pr checks <pr-number> --json state --jq '[.[] | select(.state != "SUCCESS" and .state != "SKIPPED" and .state != "NEUTRAL")] | length'
   ```
   A non-zero count means checks are pending/failing — print which ones and
   **stop this step** (the ship itself already completed at Step 12/12b;
   only the social publish is skipped).

2. **Private-repo confirmation.** A private repo needs an explicit second
   opt-in beyond `--social --yes-post`:
   ```bash
   IS_PRIVATE=$(gh repo view --json isPrivate --jq .isPrivate)
   ```
   If `"true"` and `--yes-post-private` was not passed: **refuse** with
   "repo is private — pass --yes-post-private to publish about it" and stop
   this step.

3. **Collaborator-only comment ingestion** (never quote outside commenters
   into a public post). Pull only `COLLABORATOR`/`MEMBER`/`OWNER` review
   bodies for the draft's "The tricky bit" section:
   ```bash
   gh api "repos/$OWNER/$REPO/pulls/<pr-number>/reviews" \
     --jq '.[] | select(.author_association == "COLLABORATOR" or .author_association == "MEMBER" or .author_association == "OWNER") | .body' \
     > /tmp/pr-collaborator-notes.md
   ```

4. **Compose the draft** (pure, no I/O besides the file writes below):
   Resolve the script installed-first, source-repo fallback:
   ```bash
   COMPOSE_BIN="$HOME/.claude/skills/av-ship/scripts/compose-build-in-public.cjs"
   test -f "$COMPOSE_BIN" || COMPOSE_BIN=kit/skills/ship/scripts/compose-build-in-public.cjs
   gh pr view <pr-number> --json body -q .body > /tmp/pr-body.md
   node "$COMPOSE_BIN" \
     --pr-title "<PR title>" \
     --pr-body-file /tmp/pr-body.md \
     --journal-blockers-file /tmp/pr-collaborator-notes.md \
     --writing-style "<resolved journal.writing_style, if any>" \
     --output /tmp/build-in-public-draft.md
   ```
   The draft's first line is `# <title>`; the body follows a blank line.

5. **Persist through `av journal create`** — every social post traces back
   to a durable journal entry. The command takes the body as a flag (there is
   no stdin mode) and `--json` returns the file it wrote:
   ```bash
   TITLE=$(head -1 /tmp/build-in-public-draft.md | sed 's/^# //')
   BODY=$(tail -n +3 /tmp/build-in-public-draft.md)
   JOURNAL_PATH=$(av journal create "$TITLE" --component ship --status Resolved --body "$BODY" --json | jq -r .data.path)
   ```

6. **Approval gate — dry-run first.** Without `--yes-post`, render every
   channel's post and stop; make no API call. Resolve installed-first,
   source-repo fallback (same shape as step 4):
   ```bash
   POST_BIN="$HOME/.claude/skills/av-journal/scripts/post-social.cjs"
   test -f "$POST_BIN" || POST_BIN=kit/skills/journal/scripts/post-social.cjs
   node "$POST_BIN" \
     --journal-file "$JOURNAL_PATH" \
     --channels build_in_public \
     --dry-run --json
   ```
   If `groups.build_in_public` isn't defined in `.ariadnev/journal.yaml`,
   drop `--channels build_in_public` to target all configured channels
   instead. Show the rendered per-channel posts and tell the user to re-run
   with `--social --yes-post` to publish.

7. **Publish (only with `--yes-post`).** Reuse the resolved `$POST_BIN` from
   step 6; same command, without `--dry-run`:
   ```bash
   node "$POST_BIN" \
     --journal-file "$JOURNAL_PATH" \
     --channels build_in_public --json
   ```
   Report the summary table (per-channel status + URL) as part of the ship
   output. A channel a platform rejects the attached media for still posts
   text-only (`MEDIA_UNSUPPORTED`) rather than failing the whole run.
