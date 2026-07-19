---
name: vc:journal
description: Write an honest technical journal entry after a failure, hard-won fix, or notable decision. Use for session reflections, post-mortems, or recording friction that should change a rule.
user-invocable: true
argument-hint: "[what happened]"
metadata:
  author: vchun
  version: "1.0.0"
---

# Journal

A short, honest record for the developer who inherits this later — including
future you. Written by `vc-journal-writer` or directly; this skill defines
the entry shape both use.

Handles: session reflections, failure/decision records, friction tracking.
Does not handle: durable architecture decisions with consequences for future
changes — those go through `vc:docs`'s `decision` mode instead.

## When to write

Test suite failed repeatedly before the real cause was found; a fix took
much longer than expected; an approach was abandoned mid-implementation; a
security or data issue was found; the same confusion/friction has now
happened twice.

## Entry template

Write to `docs/journal/{yymmdd-hhmm}-{slug}.md`:

```markdown
# <concise title>

**Date**: YYYY-MM-DD HH:mm
**Component**: <affected area>
**Status**: Resolved | Ongoing | Blocked

## What happened
Factual, specific. Not "an issue occurred" — the actual error, metric, or symptom.

## Root cause
Stated plainly, no euphemism. "We shipped without testing the migration"
beats "an oversight occurred."

## What we tried
Attempts that didn't work, and why not — this saves the next session from
repeating them.

## Lesson
What a future session should do differently. Must be specific enough to act
on, not just "be more careful."

## Next steps
Concrete, owned, or "none."
```

150-400 words is usually right — technical honesty over length.

## Friction / harness-delta mode

When the entry is about repeated friction (same confusion, same missing doc,
same brittle step — 2nd+ occurrence), add:

```markdown
## Harness delta
Rule/skill/doc to fix: <specific file + change>
Why this wasn't caught the first time: <one line>
```

Propose the fix; do not silently edit the rule mid-task without this record
— per `intake-and-context.md`'s harness-delta principle.

## Rules

- Write the file immediately — don't describe what you would write.
- Include at least one concrete technical detail (error message, metric, path).
- No corporate softening of what went wrong.
