# Anti-AI-Slop Taxonomy

Read when a PR diff adds >300 lines, ≥2 inline slop flags fire, or you cannot
tell genuine YAGNI from slop. LLM-assisted PRs commonly *run fine* while polluting
the codebase — these are the high-signal patterns.

## Structural (→ Important)

- New file in a dumping ground (`utils/`, `helpers/`, `lib/common/`, `*manager.ts`)
  with no clear domain anchor.
- Parallel reimplementation of a utility that already exists — grep for prior art.
- New abstraction (interface + factory + builder) with a single caller — premature.
- New config flag for behavior that should be hardcoded.
- Schema change without a migration.
- A file grown past the project's size limit without splitting.

## Micro (→ Suggestion)

- Over-comments paraphrasing code (`// increment counter` above `counter++`).
- Defensive paranoia — try/catch around code that cannot throw; null checks on
  typed-non-null params.
- Catch-and-swallow — `catch (e) { console.log(e) }`, `catch { return null }`.
- One-line wrappers adding indirection with no value.
- Re-implementing stdlib (`chunk`, `range`, `groupBy`) the language/dep covers.
- `any`-widening, `@ts-ignore`, `eslint-disable` added to silence, not fix.
- Phantom coverage — tests that execute lines without meaningful assertions.
- Unused imports/exports/params introduced.
- Diff size vs scope mismatch ("fix typo" with +800/−60); touches unrelated files.
- Generic LLM commit phrasing ("improve code quality and enhance maintainability").

## How to phrase it (not a witch-hunt)

Flag the *pattern and its cost*, not the author. "This wrapper adds a call layer
with one caller — inline it" beats "AI-generated fluff". When a pattern is a
judgment call, say so and let the author decide. Do not flag genuine YAGNI-clean
code just because it is tidy.
