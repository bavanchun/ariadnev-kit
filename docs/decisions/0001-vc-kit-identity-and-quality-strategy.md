# 0001: vc kit identity and quality strategy

> **Superseded in part by [0003](0003-comprehensive-distillation-identity.md)**
> (2026-07-24): the ClaudeKit baseline is now AgentKit, and §4's anti-bloat is
> re-read as "no low-quality/redundant skills" rather than "few skills". The
> quality-as-moat principle (§1–§3) still stands. Kept as history.

## Context

vcskill exists to gradually replace ClaudeKit (CK) for personal use. Most vc
skill slugs match CK's (`cook`, `plan`, `scout`, …), differing only by the
`vc:` prefix. Recurring temptation: rename everything to a bespoke theme for
stronger identity. This decision records why we don't, so it isn't re-litigated.

## Decision

1. **Differentiate by quality, not by renaming** (brainstorm D1, 2026-07-20).
   Keep the `vc:` prefix and CK-parallel slugs — zero muscle-memory cost, agents
   install alongside CK without conflict. The differentiator is the *core*: each
   skill must be at least as good as CK's counterpart, preferably better.
2. **Parity-or-better gate.** Every skill/agent/CLI command with a CK counterpart
   is measured against the real CK source: a kept/dropped-with-reason table plus
   ≥1 concrete, test-provable improvement. This is a standing authoring rule, not
   a one-off.
3. **Cook-grade bar** for every skill (7 points: real workflow, Output format,
   Quality gates, proof/risk wiring, tight body, Workflow position) — see
   `docs/vc-skill-authoring-spec.md`.
4. **Anti-bloat by disposition.** Completed plans/reports are deleted, not
   archived (git is the archive); durable decisions distill here first. Docs are
   a liability minimized on sight. Encodes the documentation-rot failure that
   sank a real kit launch (the RDD post-mortem).

## Consequences

- Easier: onboarding (familiar names), coexistence with CK, honest quality claims.
- Harder: standing out on name alone — accepted; quality is the moat.
- Ruled out: a bespoke-theme rename (revisit only if publishing publicly demands
  a distinct brand — it would be its own plan, cheapest done before external users).
