---
"vcskill": minor
---

Distill AgentKit → vcskill, Wave 0 (foundation) + Wave 1 (5 dev-loop skills):

- **Five new skills** distilled from AgentKit, each cook-grade + gate-passing
  with a parity-or-better proof (`references/parity.md`) vs its `ak-*` source:
  - `vc:code-review` — evidence-based review of a diff / PR / commit / codebase,
    outside a cook cycle; ranked findings, shared severity rubric.
  - `vc:test` — standalone unit/integration/e2e runner with coverage + build
    verification and a proof-vocabulary gate verdict.
  - `vc:ship` — test → review → commit/push/PR orchestrator (loose-coupled by
    name to `vc:test` / `vc:code-review` / `vc:git`), distinct from raw `vc:git`.
  - `vc:review-pr` — GitHub PR review with optional `--fix` / `--reply` /
    `--merge`; shares one severity rubric with `vc:code-review`; degrades
    gracefully when `gh` is absent.
  - `vc:handoff` — redacted, paste-ready session handoff, distinct from `vc:pm`
    and `vc:journal`.
- **Collision-gate scaling.** `scoreDescriptions` accepts a justified-similar
  allowlist (`kit/collision-allowlist.json`, `{a,b,reason}` — fail-open, entries
  without a reason ignored) so legitimately-adjacent skills can be exempted
  *explicitly* without ever loosening the thresholds.
- **`metadata.category` taxonomy.** Optional additive per-skill category field
  (nested under `metadata`, no enforcement yet) so the growing kit stays legible.
- **Governance.** Decision `0003` records the AgentKit baseline and the full 1:1
  mirror stance (quality moat now rests on gates + per-skill parity, not
  scarcity); `docs/distillation-roadmap.md` tracks every `ak-*` by status.
