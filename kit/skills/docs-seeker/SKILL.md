---
name: av:docs-seeker
description: Look up current documentation for a library, framework, or API before relying on memory. Use when an API might have changed, or the user asks about a specific package's current behavior.
user-invocable: true
argument-hint: "<library or framework> [topic]"
metadata:
  author: vchun
  version: "1.0.0"
---

# Docs Seeker

Find the smallest set of current, authoritative documentation that answers a
library, framework, CLI, or API question. Verify moving facts instead of
answering from training data.

Handles: pinpoint API lookup, version-specific behavior, setup flags, current
framework conventions, and documentation gaps.

Does not handle: comparing several products or forming a broad technology
recommendation. Route that work to `av:research`.

## Intake

Extract before searching:

- target library or framework;
- requested topic or API;
- installed/requested version, runtime, and language when stated;
- whether the user needs one answer or a general documentation map.

If a missing version would materially change the answer, inspect the project
manifest or ask. Otherwise search latest and label that choice.

## Search modes

| Mode | Trigger | First target |
|---|---|---|
| Topic | A feature, component, error, or symbol is named | The exact official topic/API page |
| Library | Broad setup or overview request | Official getting-started and API index |
| Repository | Official docs are absent, stale, or incomplete | Tagged README, docs, examples, and tests |

For source precedence, language/version handling, plugins, incomplete docs,
and conflicts, read [source selection](references/source-selection.md).

For Context7/`llms.txt`, 404s, empty results, timeouts, and repository fallback,
read [fallback playbook](references/fallback-playbook.md).

## Workflow

1. **Frame** one answerable documentation question and select a search mode.
2. **Resolve version** from the request or project; avoid mixing latest and
   versioned pages without saying so.
3. **Fetch narrowly** through an available current-doc provider, official
   search, or direct official page. Topic queries should not load a whole site.
4. **Escalate progressively** only when the preferred source is unavailable:
   official docs → official repository → clearly labelled secondary evidence.
5. **Cross-check** examples against the documented version and runtime. When
   prose and code disagree, preserve both facts and explain the likely cause.
6. **Answer directly** with the relevant behavior or example, then cite source,
   version, and check date. Do not dump fetched pages.

## Evidence rules

- Official latest documentation is the default only when no version is pinned.
- A versioned official page outranks a latest page for a version-pinned project.
- Repository code can fill a documentation gap, but label conclusions as
  inferred from code and name the tag or commit inspected.
- Community sources can explain an issue; they do not silently override the
  official contract.
- If no current source supports the answer, state that limitation. Never turn
  remembered behavior into a verified claim.

## Output format

```markdown
Answer: <concise, task-specific result>

Evidence:
- <official URL or repository path> — <version/tag>, checked <YYYY-MM-DD>

Caveats: <version conflict, language fallback, inference, or "none">
```

For a general library request, add a short map of critical pages. For a topic
request, return only the pages and snippets needed to act.

Proof/risk: this skill is read-only. Its proof is source traceability and
version alignment; it does not prove that copied code works in the user's
project, so implementation still needs `av:test` or the caller's test gate.

## Quality gates

Before answering, confirm:

1. Every moving claim is grounded in a fetched current source.
2. Source version matches the requested or installed version, or the mismatch
   is explicit.
3. Official docs or the official repository were checked before community
   sources.
4. Inference from code, incomplete docs, conflicts, and language fallback are
   labelled rather than flattened into certainty.
5. Citations point to the exact pages or repository paths used, with check date.
6. The response answers the question without reproducing an entire document.

## Workflow position

**Typically follows:** `av:cook`, `av:fix`, `av:ask`, or `av:research` reaching
a current-API question.

**Typically precedes:** returning the verified fact to that caller; `av:test`
when a fetched example is implemented.

**Related:** `av:research` for open comparison across options; this skill for a
pinpoint lookup on a library already selected.
