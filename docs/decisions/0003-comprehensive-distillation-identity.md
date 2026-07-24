# 0003: Comprehensive distillation identity — AgentKit baseline

## Context

Decision 0001 framed vcskill as a lean, CK-parallel core: ~21 skills whose slugs
mirror ClaudeKit's, differentiated by quality rather than count. Since then the
daily-driver kit became **AgentKit** (`ak-*`, ~86 skills in `~/.claude/skills`),
and the accepted direction (brainstorm 2026-07-24) is to distill *all* of it into
vcskill — not a personal-use-curated subset. That reverses two things 0001
assumed: the parity **baseline** (CK) and the implied **scale** (few skills as a
virtue). This decision records the shift so it isn't re-litigated, and so every
downstream parity table has one authoritative reference.

## Decision

1. **Baseline = AgentKit** (`ak-*`), replacing ClaudeKit as the distillation
   source and parity reference (brainstorm 2026-07-24). Every new skill is
   measured against its `ak-*` counterpart, not a CK one. 0001's CK-baseline
   framing is superseded; skills without a CK parallel no longer read as
   off-map.
2. **Scope = full 1:1 AgentKit mirror, delivered in waves** (validate
   2026-07-24). The north star is coverage of *every* `ak-*` skill — Tier 1
   dev-loop, Tier 2 meta, Tier 3 domain/media — not a curated slice. Only skills
   that are runtime-incompatible with vcskill's provider-agnostic, markdown-first
   contract are dropped; those are recorded as `rejected` with reason in the
   roadmap, everything else as `planned`.
3. **Anti-bloat is re-read, not dropped.** 0001 §4's "anti-bloat by disposition"
   meant *few skills*; here it means *no low-quality or redundant skills*. Each
   distilled skill still earns its place through the same cook-grade bar and a
   **parity-or-better** kept/dropped table vs its `ak-*` source
   (`references/parity.md`, linked from `SKILL.md`). Count is no longer the
   signal; per-skill proof is.
4. **The moat moves from scarcity to gates + proof.** With a 1:1 mirror there is
   no curation safety-valve — quality rests entirely on (a) the enforced gates
   (`skill-lint`, `reference-integrity`, `description-collision`, `eval`) and (b)
   the per-skill parity-or-better proof. If either weakens, vcskill degrades into
   an AgentKit clone with no differentiator. This is accepted deliberately: the
   discipline is the product, and a failing gate blocks a skill rather than being
   loosened to fit.

## Consequences

- Easier: honest, single-source parity claims (always vs `ak-*`); no ambiguity
  about whether a skill "belongs"; a legible wave roadmap for ~97 skills, tracked
  in [`docs/distillation-roadmap.md`](distillation-roadmap.md) (every `ak-*` by
  status/tier/category).
- Harder: the kit grows large — description-collision needs recalibration for
  overlapping domain vocabulary (a justified-similar allowlist + `metadata.category`
  taxonomy, not looser thresholds), and manual per-skill parity for ~65 remaining
  skills is heavy, sustained work.
- Trade-off named plainly: dropping curation removes the scarcity moat. Reversible
  — revert this doc and stop later waves; the checkpoint is Wave 0. Skills already
  distilled stand on their own gate-passing + parity proof regardless.
- Supersedes 0001 in part (its CK baseline and few-skills reading of anti-bloat).
  0001's quality-as-moat principle (§1–§3) is preserved and reinforced here.
