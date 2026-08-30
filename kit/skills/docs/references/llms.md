# llms.txt

Load for `/av:docs llms`. Generate or update a links-only `llms.txt` index of
this project's documentation per the [llmstxt.org](https://llmstxt.org)
specification. The file orients AI agents at inference time; it is not SEO,
`robots.txt`, or a crawl-control artifact.

This route covers the narrow case only: an index built from the discovered
docs route (by convention `docs/`). For `llms-full.txt`, arbitrary source
paths or URLs, or a custom output location, hand off to `/av:llms`, which owns
the general generator and its script.

## 1. Discover the source of truth

1. Find the project's docs route via the Discovery Contract in the parent skill
   (`AGENTS.md`/`CLAUDE.md`, root `README.md`, docs index/nav, then `docs/`).
2. Treat the discovered docs route as source of truth.
3. Prefer stable public `.md` URL variants when the project serves a docs site
   (e.g. `page.html.md` or `page.md`). Otherwise use repo-relative paths to the
   markdown sources.
4. Skip marketing copy, nav boilerplate, forums, ads, archived versions, and
   duplicate pages. Keep citation-worthy current docs only.

## 2. Choose the output location

Write `llms.txt` to:

- the site's public/static directory when the project serves one
  (e.g. `public/`, `static/`, framework `out/` / `dist/` when that is the
  published root), otherwise
- the repository root.

## 3. Update in place (do not regenerate blindly)

When the file already exists:

1. Read the current file and the current docs tree.
2. **Add** entries for new pages.
3. **Drop** entries whose pages were deleted or relocated with no replacement.
4. **Keep** curated section ordering and human-written notes unless evidence
   shows they are wrong.
5. Reconcile titles, URLs, and one-line notes against current docs.

Only create from scratch when no file exists.

## 4. Grammar (exact)

`llms.txt` is plain-text Markdown. Follow this ordered structure exactly:

```markdown
# Project Name

> One-line summary of the project.

Optional prose paragraphs or lists with key context.
No headings allowed in this prose block.

## Section Name

- [Page title](url): one-line note
- [Another page](url): one-line note

## Optional

- [Secondary page](url): one-line note
```

| Element | Requirement |
|---|---|
| H1 | **Required.** Exactly one `#` with the project/site name. |
| Blockquote | One-line (or short) summary after the H1. Use `> …`. |
| Optional prose | Zero or more paragraphs/lists **without any headings**. |
| H2 sections | Group related links. Each item: `- [title](url): one-line note`. |
| `## Optional` | Last H2. Agents may skip these entries when context is short. Put changelogs, legacy, and supplementary links here. |

Hard constraints:

- Links and one-line notes only — **never** inline page content.
- Every note is a single concise line after `: `.
- No duplicate URLs or titles across sections.
- Keep the index small (typically tens of KB) so it fits agent context.

## 5. Validate before finishing

1. `llms.txt` exists at the chosen output location.
2. It has the required H1, a blockquote summary, valid H2 link sections, and
   `## Optional` last when secondary links exist.
3. Every link resolves (public URL reachable, or repo-relative path exists).
4. Every entry has a one-line note; no blank or multi-paragraph notes.
5. No duplicate entries (same URL or same title repeated).
6. No inlined page bodies.

Report the output path, entry count, and any unresolved links or skipped
pages.

## Additional requests
<additional_requests>
  $ARGUMENTS
</additional_requests>
