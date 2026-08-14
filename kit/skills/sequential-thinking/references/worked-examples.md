# Worked Sequential-Thinking Examples

Read these compact examples to calibrate revision, hypothesis testing, dynamic
step counts, and convergence. Adapt the pattern, not the domain answer.

## Multi-tenant authentication API

Initial estimate: five steps. Requirements include authentication, tenant
isolation, authorization, and scale.

1. Compare server sessions and JWTs; identify revocation as an uncertainty.
2. Draft a JWT containing user ID, tenant ID, permissions, and expiration.
3. **Revision caught a security issue:** tenant ID visibility in base64 claims
   and the risk of trusting visible claims without membership verification.
4. Preserve tenant ID for routing, but add gateway signature and tenant
   membership verification; log rejected cross-tenant access.
5. Add short-lived access tokens, rotating refresh tokens, and revocation state.
6. Expand dynamically from 5 → 7 thoughts as multi-tenancy and revocation
   complexity emerges.
7. Verify the complete flow covers authentication, authorization,
   multi-tenancy, and revocation before finalizing.

Lesson: the material result is not “use JWT”; it is that a visible routing claim
must never substitute for authorization. The revision changes downstream
gateway and revocation design.

## React state architecture

Initial claim: “We need global state.” That scope is too broad.

1. **Scope revision is crucial:** reframe global state into server state, local
   UI state, authentication context, and app-wide settings.
2. Apply separation of concerns: different state types need different
   solutions rather than one universal store.
3. Hypothesize a lightweight global store plus a server-state library and local
   component state.
4. Verify requirements individually, including offline behavior, TypeScript,
   maintenance, and WebSocket support.
5. Confirm WebSocket support before finalizing rather than assuming the chosen
   server-state tool handles real-time updates.
6. Converge on the smallest combination that meets each category.

Lesson: simpler is better when evidence supports it. The scope revision avoids
over-engineering with a heavy Redux solution for state that should stay local
or server-owned.

## Slow API endpoint

Observed behavior: a dashboard endpoint takes 2–3 seconds against a sub-200ms
target.

1. Profile each query. Activities consume about 90% of latency; use profiling
   data to guide the investigation.
2. Expand the thought count because query behavior is more complex than the
   initial endpoint-level model.
3. Branch for hypothesis testing:
   - Branch A: N+1 query;
   - Branch B: missing composite index.
4. Test both hypotheses systematically before proposing a solution. Inspect
   query count/joins for A and query plan/indexes for B.
5. Elimination method: rule out N+1 because joins and query count are correct;
   confirm the index issue because sorting scans without the needed composite
   key.
6. Add the index, rerun the same profile, and compare against the target.

Lesson: verification before solution prevents optimizing a familiar but absent
N+1 problem. The conclusion is data-driven only when the post-change profile
meets the original latency target.

## Pattern transfer

Across all three examples:

- state what the next thought should address;
- revise scope or assumptions when evidence changes them;
- expand the estimate only as complexity emerges;
- branch on explanations that a discriminating check can separate;
- preserve eliminated branches;
- finish with measured or source-backed verification, not confidence alone.
