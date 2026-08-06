# Baseline Review Checklist

Always load this baseline for quality review. It adapts upstream
`checklists/base.md`; apply the API and web overlays below only when those
surfaces exist. Report real defects only, with `file:line`, problem, failure,
fix, and proof.

## Blocking checks

### Injection and data safety

- SQL/database queries interpolate untrusted input instead of parameters.
- User input reaches HTML, shell arguments, file paths, or database writes
  without the boundary's validation/encoding.
- Path traversal or command injection is possible.
- Secrets or sensitive fields reach logs, errors, responses, or client code.

### Auth and trust boundaries

- New route lacks authentication or per-resource authorization.
- IDOR/privilege escalation lets one principal access another's resource.
- Admin operation is reachable by ordinary users.
- Token/session comparison, reuse, fixation, or revocation is unsafe.
- LLM/external output crosses a trusted boundary without validation.

### Concurrency and state

- Read-check-write lacks an atomic operation; check-then-set should use a unique
  constraint, transaction, compare-and-set, or atomic `WHERE + UPDATE`.
- Find-or-create can duplicate under concurrent calls.
- Status transitions do not guard the old state atomically.
- Shared mutable state lacks synchronization or leaks between requests/users.
- Error paths leave partial writes, resources, or locks behind.

### Contracts and migrations

- Public API/schema/env/export changed without updating callers or migration.
- Data migration has no rollback, idempotency, or partial-failure handling.
- Removed behavior is still used by a caller or supported-version path.

## Important/non-blocking checks

Rank as Important only when the concrete impact warrants it; otherwise use a
Suggestion or omit it.

- Conditional branch omits a required side effect.
- Bare numeric literals used in multiple files should be named constants when
  they encode one shared contract.
- Variables are assigned but never read; imports/exports are dead.
- Error strings are coupled across producer/consumer boundaries.
- Type changes at serialization, hashing, or API boundaries are not normalized.
- Query or loop has N+1, O(n×m), unbounded results, or missing pagination.
- Negative, error, authorization, or side-effect tests are absent.
- Comment or test asserts behavior different from implementation.

## API overlay

Apply for REST, GraphQL, gRPC, route/controller trees, or an API schema:

- public sensitive endpoints need rate limits;
- request bodies/files/arrays need schema, size, and count limits;
- bulk operations need per-item authorization;
- responses must not expose secrets, stack traces, or internal fields;
- existing response shape/type changes require compatibility treatment;
- list endpoints need pagination and consistent errors/content types;
- important error paths need correlation/observability without sensitive data.

## Web overlay

Apply for browser-rendered HTML or a frontend framework:

- user-controlled HTML/URLs are escaped and protocols validated;
- cookie-authenticated mutations have CSRF/SameSite protection;
- interactive elements work by keyboard and expose labels/semantics;
- images/layout avoid preventable shift and mobile clipping;
- server-rendered loops avoid N+1 queries;
- sequential client calls that can be safely batched do not create waterfalls.

## Suppressions

Do not report:

- behavior already addressed elsewhere in the full diff;
- harmless no-ops, such as `.filter()` on an array that cannot contain the
  filtered value;
- redundancy that materially aids readability;
- style/formatting owned by a configured formatter or linter;
- “consider X” when current Y is correct and within project conventions;
- tighter assertions when the existing assertion already proves the contract;
- threshold comments that merely restate a number and will rot;
- YAGNI requests for unused future capability.

## Two-pass use

Pass 1 scans all blocking categories and stops a clean verdict on a proven
Critical/Important defect. Pass 2 records actionable non-blocking issues. Read
the whole diff before applying suppressions and do not downgrade a real security
or data-loss defect because it is inconvenient to fix.
