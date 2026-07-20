---
name: vc:docs-seeker
description: Look up current documentation for a library, framework, or API before relying on memory. Use when an API might have changed, or the user asks about a specific package's current behavior.
user-invocable: true
argument-hint: "<library or framework> [topic]"
metadata:
  author: vchun
  version: "1.0.0"
---

# Docs Seeker

Fetch current documentation instead of trusting training data for anything
that moves — library APIs, framework conventions, CLI flags, pricing.

Handles: current-docs lookup for a named library/framework/API.
Does not handle: general web research across multiple sources/products —
that's `vc:research`.

## Rules

- Never answer a library-API question from memory alone when the library
  updates faster than training data — verify, then answer.
- State the version/date checked in the answer, so staleness is visible
  later (same discipline as `vc:research`'s evidence rule).
- Prefer the official docs domain over blog posts or Stack Overflow.

## Workflow

1. If a `context7`-style MCP documentation tool is available in the session,
   use it first — it's built for exactly this.
2. Otherwise, `WebSearch` for `"<library> <topic> docs"`, then `WebFetch` the
   official doc page(s) found.
3. For a GitHub-hosted project with no clear doc site, check the repo's
   README and any `llms.txt` at its root via `WebFetch`.
4. Extract only what answers the question — don't dump the whole page back.

## Output

```
<answer, grounded in fetched docs>

Verified against: <doc URL(s)>, checked <date>
```

If nothing current could be found, say so explicitly rather than falling
back to unverified memory.

Proof/risk: N/A — this skill fetches and reports, changes nothing.

## Quality gates

Before answering:

1. The answer is grounded in a fetched doc, not memory — with the URL and the
   date/version checked stated.
2. The source is the official docs domain (or the project's own repo), not a
   secondhand blog, when an official source exists.
3. Only the part that answers the question is returned — not a dumped page.
4. If no current source was found, that's stated plainly — never a silent
   fallback to unverified recall.

## Workflow position

**Typically follows:** any skill that hit "does this API still work this way" —
`vc:cook`, `vc:fix`, `vc:ask`, or `vc:research` needing one precise doc fact.
**Typically precedes:** returning to the skill that asked, now with a verified
fact.
**Related:** `vc:research` for open evaluation across options/products; this
skill for a pinpoint lookup on a library you already use.
