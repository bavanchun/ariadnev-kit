---
name: vc:scenario
description: Generate edge cases and test scenarios by decomposing a feature across risk dimensions. Use for pre-implementation risk discovery, QA planning, or regression design.
user-invocable: true
argument-hint: "<file path or feature description>"
metadata:
  author: vchun
  version: "1.0.0"
  attribution: "Dimension-decomposition pattern adapted from autoresearch by Udit Goenka (MIT)"
---

# Scenario

Decompose a feature across the dimensions that actually apply to it, and
generate concrete edge cases per dimension — output that plugs directly into
`vc:cook`'s test-gate as ready-made test targets.

Handles: pre-implementation risk discovery, test-case generation, QA/regression
design.
Does not handle: trivial single-line changes, already well-tested stable code.

## Dimensions

Not all apply to every feature — mark which ones do first, skip the rest
explicitly (state why).

| # | Dimension | Look for |
|---|---|---|
| 1 | User types | admin, guest, banned, new, power user, bot |
| 2 | Input extremes | empty, null, max length, unicode, injection payloads |
| 3 | Timing | concurrent access, race conditions, timeout, retry storms |
| 4 | Scale | 0 items, 1, very many, pagination boundary |
| 5 | State transitions | first use, mid-flow abort, resume after crash |
| 6 | Environment | low-end device, no JS, screen reader, different locale |
| 7 | Error cascades | DB down, timeout, disk full, partial write |
| 8 | Authorization | expired token, wrong role, shared link, privilege escalation |
| 9 | Data integrity | duplicates, orphan references, concurrent migration |
| 10 | Integration | webhook replay, API version mismatch, third-party outage |
| 11 | Compliance | deletion request, audit-log gap, PII exposure |
| 12 | Business logic | zero/negative pricing, coupon stacking, partial refund |

## Workflow

1. Read the target file(s) or parse the feature description.
2. Mark which dimensions apply; state why the rest are skipped.
3. Generate 3-5 concrete scenarios per relevant dimension — a real trigger,
   flow, and expected outcome, not a vague category restatement.
4. Rate severity: Critical (data loss/security/auth bypass) → High (broken
   for a subset of users) → Medium (degraded UX, recoverable) → Low (cosmetic).
5. Output the table; map each Critical/High row to a concrete test in
   `vc:cook`'s test-gate before calling the feature covered.

## Output format

```markdown
## Scenarios: <target>
Dimensions analyzed: <list> | Skipped: <list + reason>

| # | Dimension | Scenario | Severity | Expected behavior |

### Summary
Critical: N | High: N | Medium: N | Low: N | Total: N across X dimensions
```

Feed Critical/High rows into `vc:predict` (as the change proposal) for a
deeper debate, or straight into `vc:plan`'s risk assessment.

Each scenario also implies the proof layer that would cover it (see
`../cook/references/risk-lanes.md`): input-extreme and business-logic rows are
usually `unit`; integration/error-cascade rows need `integration`; user-type and
state-transition flows are `e2e`. Tag the layer so `vc:cook`'s test-gate knows
what kind of test each Critical/High row demands, not just that one is owed.

## Quality gates

Before delivering:

1. Applicable dimensions were chosen deliberately, and skipped ones say *why* —
   not silently omitted.
2. Every scenario is concrete: a real trigger + flow + expected outcome, not a
   restatement of the dimension name.
3. Every Critical/High row names its proof layer, so it converts to a test
   rather than a worry.
4. Severity reflects real blast radius (data loss/security = Critical), not the
   order scenarios were thought of.

## Workflow position

**Typically follows:** `vc:predict` (a CAUTION/STOP verdict whose risk rows need
concrete edge cases), or `vc:plan` building a phase's test targets.
**Typically precedes:** `vc:cook`'s test-gate (scenarios become tests), or back
into `vc:plan`'s risk assessment.
**Related:** `vc:predict` debates *whether* a change is sound across 5 personas;
`vc:scenario` enumerates *what could break* across risk dimensions. Predict for
the go/no-go, scenario for the test matrix.
