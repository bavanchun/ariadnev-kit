---
phase: 1
title: "Identity & governance — rebaseline to AgentKit, record expansion stance"
status: done
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Identity & governance

## Overview
Record the deliberate shift from a lean CK-parallel core to a comprehensive
AgentKit distillation, and set AgentKit as the parity baseline — so every
downstream parity table and scope call has an authoritative reference.

## Requirements
- Functional: a durable decision doc states (a) source baseline = AgentKit (`ak-*`), (b) scope = **full 1:1 AgentKit mirror** in waves incl. domain/media (not a use-curated subset), (c) how this reconciles with decision 0001's anti-bloat/quality-moat ethos — moat now rests on gates + per-skill parity proof, not scarcity or personal-use filtering.
- Non-functional: honest about the trade-off; does not silently overwrite history.

## Architecture
Repo convention (`docs/decisions/0001`): durable decisions distill into `docs/decisions/`. Recommend **new `0002-comprehensive-distillation-identity.md`** that supersedes 0001's decision #1 (lean/CK-parallel) and #4 (anti-bloat-by-disposition *as applied to skill count*), links back to 0001, and keeps 0001 as historical record. Update 0001 with a top note "Superseded in part by 0002".

## Related Code Files
- Create: `docs/decisions/0002-comprehensive-distillation-identity.md`
- Modify: `docs/decisions/0001-vc-kit-identity-and-quality-strategy.md` (add supersede note)
- Modify: `README.md` ("What's in the kit" framing — from "21 distilled" to "growing toward AgentKit parity")

## Implementation Steps
1. Draft 0002: context (user chose Tier-3 full distillation), decision points (AgentKit baseline; wave delivery; quality gates unchanged; category taxonomy incoming), consequences (kit grows large — quality-moat now enforced by gates + parity tables, not by scarcity).
2. Explicitly resolve the tension: state that "anti-bloat" now means *no low-quality or redundant skills*, not *few skills*; each skill still earns its place via cook-grade bar + parity-or-better.
3. Add supersede note atop 0001.
4. Reframe README kit section (keep numbers accurate).

## Success Criteria
- [ ] 0002 exists; states AgentKit baseline + wave scope + reconciled anti-bloat stance
- [ ] 0001 marked partially-superseded, still readable as history
- [ ] README no longer implies a fixed 21-skill lean kit
- [ ] `vc validate --check` still green (README matrix untouched)

## Risk Assessment
- **Reversing a founding decision.** Mitigation: 0002 is explicit + reversible (revert doc + stop later waves). This phase is the checkpoint; if the user reconsiders Tier-3 here, only docs changed.
