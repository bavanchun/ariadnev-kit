# Intake and Context Rules

How to classify a request's authority and how much context it earns before
touching the repo.

## Authority gate

| Request class | Examples | Allowed to mutate? |
|---|---|---|
| Read-only | answer, explain, review, diagnose, plan, status | No — inspect only, never edit/commit/write state |
| Change | change, build, fix | Yes, per the lane below |

The outcome the user asked for sets authority, not a single keyword. "Review
and apply fixes" is a change request because the user explicitly asked for
edits; a plain "review this" is read-only even if the review surfaces bugs.

## Risk lanes

Classify every change request by counting risk flags before implementing:

| Risk flag | Applies when the work touches |
|---|---|
| Auth | login, sessions, tokens, passwords |
| Data model | schema, migrations, deletion, retention |
| Public contracts | API shape, CLI flags, exported types, env vars |
| External systems | payments, email, third-party providers, webhooks |
| Existing behavior | already-implemented or test-covered code changes |
| Weak proof | unclear or missing tests around the affected area |
| Multi-domain | more than one module/feature area changes at once |

- **0-1 flags** → tiny/normal lane: implement directly, standard test gate.
- **2-3 flags** → normal lane with stronger validation: full test-gate,
  explicit walk of every touchpoint.
- **4+ flags, or any hard gate** (auth, data loss, external-provider
  behavior) → high-risk lane: stop and confirm scope with the user via
  `AskUserQuestion` before implementing, even if the request sounded direct.

## Context budget

Read only what the current phase needs — do not preload the whole repo.

| Lane | Target budget | Read shape |
|---|---|---|
| Tiny | ~2K tokens | The exact file(s) named by the request |
| Normal | ~5K tokens | + adjacent files sharing the pattern, relevant docs |
| High-risk | ~10K tokens | + full blast-radius walk, prior decisions if any |

Stop reading once the lane, affected files, and validation path are clear —
more context is not automatically better.

## Harness delta

A change can produce two outputs: the product delta (code, tests) and,
when warranted, a harness delta (a rule/skill/doc improvement that makes the
next change easier). When friction repeats (same confusion, same missing
doc) across two or more sessions, record it via `av:journal` and propose the
concrete fix — do not silently patch the rule mid-task without noting why.
