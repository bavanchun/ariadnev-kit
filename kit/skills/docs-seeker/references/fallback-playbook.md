# Documentation Fallback Playbook

Read this reference when the preferred documentation provider returns 404,
times out, has an empty index, or the library has no maintained docs site.

The av distribution does not bundle dedicated discovery scripts. Use the
current session's documentation and web capabilities directly; do not claim
that `detect-topic.js`, `fetch-docs.js`, or `analyze-llms-txt.js` ran.

## Topic query

For a named feature, component, error, or symbol:

1. Try a current-doc provider such as Context7 with the library and exact topic.
2. Try the official docs site's search and the exact API/reference page.
3. Look for an official `llms.txt`, using its topic links rather than ingesting
   the whole index.
4. On 404 or no match, retry the general library index once.
5. If documentation is still unavailable, inspect the official repository at
   the matching tag: README, `docs/`, `examples/`, tests, and implementation.

One to three relevant pages can be read directly. For four or more, rank them
as critical, important, or supplementary and inspect critical pages first.

## General library query

For setup, concepts, or a documentation map:

1. Try Context7 or the official site's `llms.txt`/documentation index.
2. Prefer getting-started, core concepts, configuration, and API reference.
3. Search the official site for missing categories instead of broad web results.
4. If no index exists, use the official repository's README and `docs/` tree.
5. Add community material only for unresolved explanations, clearly labelled.

Keep the result progressive. Return the critical pages first and offer deeper
sections only when the user's task needs them.

## Repository analysis

Use repository evidence only after confirming the repository is official.
Pin the requested release, tag, or commit before reading:

- `README` and release notes for supported setup;
- `docs/` for authored contracts;
- `examples/` for complete usage;
- `tests/` for edge behavior;
- exported types and implementation for unresolved details;
- maintainer issues for known documentation gaps.

Do not install global tools or clone a repository merely because an outside
workflow suggests it. Use available read-only repository/search capabilities;
request extra authority only when the target cannot otherwise be inspected.

## Failure handling

| Failure | Response |
|---|---|
| Topic 404 | General library docs, then official repository analysis |
| Provider unavailable | Official `llms.txt` or direct docs search |
| Timeout | Stop that method; use the next independent source |
| Empty/malformed index | Note it, inspect official site and repository |
| No official repository | Cross-check maintainer-owned site and package registry |
| No current evidence | Report “not verified”; do not answer from memory |

Avoid repeated retries against the same failing endpoint. If rate-limited, use
session caching or a documented provider credential already available; never
expose credentials or invent an API key.

## Reporting repository evidence

Label the evidence level:

- **Documented:** exact behavior stated in official docs.
- **Demonstrated:** official example or test exercises it.
- **Inferred from code:** implementation implies it, but no public contract was
  found.
- **Unverified:** no current primary source supports it.

Always include version/tag, source path or URL, and check date. Repository
analysis closes an evidence gap; it does not turn private implementation detail
into a promised API.
