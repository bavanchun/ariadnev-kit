# Commit Workflow

Execute via `git-manager` subagent.

## Tool 1: Stage + Analyze
```bash
git add -A && \
echo "=== STAGED ===" && git diff --cached --stat && \
echo "=== SECURITY ===" && \
git diff --cached | grep -c -iE "(api[_-]?key|token|password|secret|credential)" | awk '{print "SECRETS:"$1}' && \
echo "=== GROUPS ===" && \
git diff --cached --name-only | awk -F'/' '{
  if ($0 ~ /\.(md|txt)$/) print "docs:"$0
  else if ($0 ~ /test|spec/) print "test:"$0
  else if ($0 ~ /\.claude/) print "config:"$0
  else if ($0 ~ /package\.json|lock/) print "deps:"$0
  else print "code:"$0
}'
```

**If SECRETS > 0:** STOP, show matches, block commit.

## Tool 2: Split Decision

NOTE: 
- Search for related issues on GitHub and add to body.
- Only use `feat`, `fix`, or `perf` prefixes for files in `.claude` directory (do not use `docs`).

**From groups, decide:**

**A) Single commit:** Same type/scope, FILES ≤ 3, LINES ≤ 50

**B) Multi commit:** Mixed types/scopes, group by:
- Group 1: `config:` → `chore(config): ...`
- Group 2: `deps:` → `chore(deps): ...`
- Group 3: `test:` → `test: ...`
- Group 4: `code:` → `feat|fix: ...`
- Group 5: `docs:` → `docs: ...`

## Tool 3: Commit

**Single:**
```bash
git commit -m "type(scope): description"
```

**Multi (sequential):**
```bash
git reset && git add file1 file2 && git commit -m "type(scope): desc"
```
Repeat for each group.

## Tool 3b: Co-author Footer (--solo / --team)

When `--solo` or `--team` flag is present, append `Co-authored-by:` to commit message.

**Critical format:** blank line BEFORE the footer, otherwise GitHub will not parse it as a co-author trailer.

```
type(scope): description

[optional body]
                            ← BLANK LINE REQUIRED
Co-authored-by: <Name> <<email>>
```

### --solo

Read identity from `~/.claude/skills/vchun-git/co-authors.json`:
```bash
SOLO_NAME=$(jq -r .solo.name ~/.claude/skills/vchun-git/co-authors.json)
SOLO_EMAIL=$(jq -r .solo.email ~/.claude/skills/vchun-git/co-authors.json)
```

Append: `Co-authored-by: $SOLO_NAME <$SOLO_EMAIL>`

### --team

Use `AskUserQuestion`:
- Q: "Co-author teammate for this commit?"
- Options:
  - "Enter name + email" → user supplies `Full Name <email@example.com>`
  - "Skip co-author for this commit" → no footer added
- If entered: validate matches `^.+ <.+@.+\..+>$`, then append.
- If skip: commit without co-author.

### Commit with footer (HEREDOC)

```bash
git commit -m "$(cat <<'EOF'
feat(scope): description

Body if any.

Co-authored-by: YOUR_NAME <YOUR_GITHUB_ID+YOUR_USERNAME@users.noreply.github.com>
EOF
)"
```

### Multiple co-authors

Stack multiple `Co-authored-by:` lines (one per line, no blank between them):
```
Co-authored-by: Alice <alice@example.com>
Co-authored-by: Bob <bob@example.com>
```

### When NOT to add co-author

- No flag → never auto-add (default safe).
- `--team` selected "skip" → no footer.
- Multi-commit split: only add co-author to the **code group** commit, not to `chore(deps)` / `chore(config)` / `docs` groups.

## Tool 4: Push (if requested)
```bash
git push && echo "✓ pushed: yes" || echo "✓ pushed: no"
```

**Only push if user explicitly requested** ("push", "commit and push").
