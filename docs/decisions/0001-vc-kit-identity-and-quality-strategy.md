# 0001: vc kit identity and quality strategy

> Historical record of the quality-as-moat framing kept as the kit evolved.

## Context

vcskill maintains a coherent personal kit under the `vc:` prefix. Recurring
temptation: rename everything to a bespoke theme for stronger identity. This
decision records why we don't, so it isn't re-litigated.

## Decision

1. **Differentiate by quality, not by renaming** (brainstorm D1, 2026-07-20).
   Keep the `vc:` prefix and stable slugs — zero muscle-memory cost, agents
   install alongside other kits without conflict. The differentiator is the
   *core*: each skill must earn its keep with a real workflow and verifiable
   output.
2. **Parity-or-better gate.** Every skill/agent/CLI command with a comparable
   existing tool records a kept/dropped-with-reason table plus ≥1 concrete,
   test-provable improvement. This is a standing authoring rule, not a
   one-off.
3. **Cook-grade bar** for every skill (7 points: real workflow, Output format,
   Quality gates, proof/risk wiring, tight body, Workflow position) — see
   `docs/vc-skill-authoring-spec.md`.
4. **Anti-bloat by disposition.** Completed plans/reports are deleted, not
   archived (git is the archive); durable decisions land in ADRs here first.
   Docs are a liability minimized on sight. Encodes the documentation-rot
   failure that sank a real kit launch (the RDD post-mortem).

## Consequences

- Easier: onboarding (familiar names), coexistence with CK, honest quality claims.
- Harder: standing out on name alone — accepted; quality is the moat.
- Ruled out: a bespoke-theme rename (revisit only if publishing publicly demands
  a distinct brand — it would be its own plan, cheapest done before external users).
