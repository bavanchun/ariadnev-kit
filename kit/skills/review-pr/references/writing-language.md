# Writing language for GitHub prose

Shared by `av:ship` and `av:review-pr` (#1195).

## Resolve before authoring

```bash
WL_BIN=.claude/hooks/lib/writing-language.cjs
test -f "$WL_BIN" || WL_BIN=kits/core/hooks/lib/writing-language.cjs
node "$WL_BIN" --json
```

Use `language` from the JSON for all human-facing GitHub prose. If
`fallbackReason` is set, state the fallback explicitly in the PR/review body
(do not claim the unsupported tag was honored).

## Precedence

1. `ARIADNEV_LANGUAGE`
2. `CK_RESPONSE_LANGUAGE`
3. `<project>/.ariadnev/config.yaml` → `locale.response_language` or top-level `language`
4. `$ARIADNEV_HOME/config.yaml` (default `~/.ariadnev/config.yaml`) → same keys
5. `<project>/.claude/.ck.json` → `locale.responseLanguage`
6. `~/.claude/.ck.json` → `locale.responseLanguage`
7. Default: `en`

## What is localized

- PR description headings and prose (`av:ship`)
- Review Summary / Risk / Findings / Verdict / handoff text (`av:review-pr`)
- Checklist labels and human-action requests

## What stays intact

- Conventional-commit **PR titles** (English)
- Code, commands, paths, URLs, identifiers
- GitHub keywords (`Closes #123`, `Relates to #456`)
- User-provided quotes, issue titles, error output, evidence blobs

## Invalid tags

Normalize to lowercase BCP47-like `/^[a-z]{2,3}(-[a-z0-9]+)*$/`. Invalid
candidates are **skipped** so lower-precedence sources can still win. If every
configured value is invalid/empty, use `en` and record `fallbackReason` plus
`rejected[]`.

## YAML parser limits

The resolver uses a minimal line parser (no YAML dependency). Supported shapes:

```yaml
language: vi
locale:
  response_language: vi
```

Inline maps like `locale: { response_language: vi }` are **not** read. Prefer
block form until #1093 ships a full YAML consumer.
