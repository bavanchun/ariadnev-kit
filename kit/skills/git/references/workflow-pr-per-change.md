# PR-Per-Change Workflow (`prc`)

Solo-dev default: never commit to `main` directly. Each change ships as its own
branch → PR → squash-merge. Accumulates GitHub achievements (Pull Shark, YOLO,
Pair Extraordinaire) as a side effect of good hygiene.

Execute via `git-manager` subagent.

## Variables
- BRANCH: feature branch name (arg 1; auto-derive from commit type/scope if omitted)
- MSG: conventional commit message (arg 2)
- BASE: default branch (auto-detect, fallback `main`)
- MODE: `solo` | `team` — chooses how CO_AUTHOR is set (see Step 0)
- CO_AUTHOR: resolved `Name <email>` of a SECOND identity the user owns (may be empty)

## Flags (arg parsing)
- `--solo` → MODE=solo, skip the prompt, use the saved solo co-author
- `--team [@user | "Name <email>"]` → MODE=team; use the given co-author, or none if omitted
- `--set-solo [@user | "Name <email>"]` → save/replace the solo default, then continue
- No flag → ask the user Solo/Team interactively (Step 0)

## Preconditions
- Working tree has changes (`git status --porcelain` non-empty)
- On BASE or clean feature branch (if mid-feature, reuse current branch)

## Step 0: Determine co-author (solo/team)

Resolve CO_AUTHOR before committing. Honor flags first; otherwise prompt.

### Config store
- Solo default lives in global git config:
  `git config --global --get ck.coauthor.solo`
- Save/replace with:
  `git config --global ck.coauthor.solo "Name <email>"`

### `--set-solo` handling
If `--set-solo` given: resolve its value (see Resolve helper), save to
`ck.coauthor.solo`, print confirmation, then fall through to normal mode logic.

### Mode resolution
1. Flag present → use it:
   - `--solo` → CO_AUTHOR = `git config --global --get ck.coauthor.solo`.
     If empty → prompt once for an identity, resolve, save, use.
   - `--team VALUE` → CO_AUTHOR = resolve(VALUE).
   - `--team` (no value) → CO_AUTHOR = "" (no co-author).
2. No flag → `AskUserQuestion` "Co-author mode?": **Solo** | **Team**.
   - **Solo** → read `ck.coauthor.solo`; if empty, prompt once + save; use it.
   - **Team** → ask "Co-author (username or `Name <email>`), blank = none":
     - value → CO_AUTHOR = resolve(value)
     - blank → CO_AUTHOR = ""

### Resolve helper — `resolve(INPUT)`
- INPUT contains `<` and `>` → return unchanged (already `Name <email>`).
- Else treat as GitHub username (strip leading `@`):
  ```bash
  U="${INPUT#@}"
  ID=$(gh api "users/$U" -q .id 2>/dev/null) || { echo "user not found: $U"; CO_AUTHOR=""; }
  [ -n "$ID" ] && CO_AUTHOR="$U <${ID}+${U}@users.noreply.github.com>"
  ```
  Lookup fails → warn, re-ask or leave CO_AUTHOR empty.

### Honesty guard (MANDATORY)
- Reject if resolved identity is Claude/AI/anthropic (any case) → abort co-author.
- Solo = an alt account the **user owns**. Team = a real teammate who **consents**.
- Never invent a co-author. Empty is valid.

## Step 1: Branch
```bash
BASE=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'); BASE=${BASE:-main}
git checkout -b "$BRANCH" 2>/dev/null || git checkout "$BRANCH"
```

## Step 2: Stage + Security Scan
Same as core workflow — `git add -A`, scan for secrets. STOP if secrets found.

## Step 3: Commit
Use CO_AUTHOR resolved in Step 0.
```bash
if [ -n "$CO_AUTHOR" ]; then
  git commit -m "$MSG" -m "" -m "Co-authored-by: $CO_AUTHOR"
else
  git commit -m "$MSG"
fi
```

**HARD RULES:**
- CO_AUTHOR MUST be a real second identity the **user owns** (alt account,
  `<id>+<username>@users.noreply.github.com`, or a teammate who consents).
- NEVER use Claude/AI as co-author — violates `commit-standards.md`.
- Both identities must be linked to GitHub accounts for the badge to count.
- Empty CO_AUTHOR is valid — commit with no trailer. Never invent one.
- Pair Extraordinaire only registers on the MERGED commit; Step 6 keeps the trailer.

## Step 4: Push
```bash
git push -u origin "$BRANCH"
```

## Step 5: PR
```bash
gh pr create --base "$BASE" --head "$BRANCH" --fill
```
Or generate title/body per `workflow-pr.md` for non-trivial changes.

## Step 6: Self-Merge
```bash
gh pr merge --squash --admin --delete-branch
git checkout "$BASE" && git pull --ff-only
```
- `--admin` bypasses required-review gates (solo repos). Merging without review
  is what unlocks **YOLO**; merged PR counts toward **Pull Shark**.
- `--squash` keeps `main` linear. Swap `--merge`/`--rebase` per preference.

## Output Format
```
✓ branch:   BRANCH ← BASE
✓ security: passed
✓ commit:   HASH type(scope): description [+co-author]
✓ pushed:   origin/BRANCH
✓ PR:       #N (url)
✓ merged:   squash → BASE, branch deleted
```

## Achievement Map
| Badge | Earned by this flow |
|-------|--------------------|
| Pull Shark | every merged PR (2/16/128/1024) |
| YOLO | `--admin` merge with 0 reviews |
| Pair Extraordinaire | merged PR carrying valid `Co-authored-by` |

Quickdraw (issue/PR closed <5 min) and Galaxy Brain (accepted Discussion answer)
are not part of this flow — trigger them manually.

## Error Handling
| Error | Action |
|-------|--------|
| Branch exists locally | `git checkout` it, continue |
| No changes | Exit cleanly, "nothing to ship" |
| `--admin` denied | User lacks admin or branch protection blocks; merge via UI or drop `--admin` |
| Push rejected | `git pull --rebase`, resolve, retry |
| Secrets detected | Block, show files, suggest `.gitignore` |
