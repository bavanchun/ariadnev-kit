# Risk Lanes

Classify every task before implementing — the lane sets how much validation
and confirmation the work needs. Distilled from `intake-and-context.md`'s
risk-flag checklist; this reference applies it inside the cook pipeline.

## Count the flags

| Risk flag | Applies when the work touches |
|---|---|
| Auth | login, sessions, tokens, passwords |
| Data model | schema, migrations, deletion, retention |
| Public contracts | API shape, CLI flags, exported types, env vars |
| External systems | payments, email, third-party providers, webhooks |
| Existing behavior | already-implemented or test-covered code changes |
| Weak proof | unclear or missing tests around the affected area |
| Multi-domain | more than one module/feature area changes at once |

## Route by count

| Flags | Lane | What changes |
|---|---|---|
| 0-1 | **Tiny** | Inline micro-plan is enough; implement directly; test-gate scope stays narrow |
| 2-3 | **Normal** | Standard cook workflow as written in SKILL.md; test-gate widens to every touchpoint |
| 4+, or any hard gate (auth, data loss, external-provider behavior) | **High-risk** | Stop and confirm scope with the user via `AskUserQuestion` before writing code, even if the request sounded direct — this is not optional |

A high-risk task that "sounds simple" ("just add a role check") is exactly
the case this lane exists for — confirm scope before implementing, not after
something breaks.

## Proof vocabulary

Use these terms in test-gate and finalize reports, matching `vc:pm`'s
evidence rules:

| Term | Means |
|---|---|
| `unit` | Pure logic proof, no I/O |
| `integration` | Proof crossing a real boundary (DB, API, filesystem) |
| `e2e` | User-visible flow proof |
| `platform` | Build/deploy/runtime proof that can't be shown at a lower layer |

A phase can ship without every proof layer if the report states why (e.g. "no
e2e — no browser surface in this change").
