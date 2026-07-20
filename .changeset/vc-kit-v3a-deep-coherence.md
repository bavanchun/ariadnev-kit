---
"vcskill": minor
---

vc kit v3a: deep coherence — all 21 skills brought to one cook-grade bar.

- Every skill now has a real workflow, an `## Output format` contract,
  `## Quality gates` self-checks, and a `## Workflow position` — so the kit
  reads as one connected graph, not a strong core surrounded by thin satellites.
- Risk lanes and proof vocabulary (`unit`/`integration`/`e2e`/`platform`) are
  wired across 8 and 7 skills respectively, not confined to `vc:cook`.
- `vc:docs` gains an anti-bloat gate (don't create docs the code answers, no
  routine ADRs, prune on sight) encoding a real documentation-rot failure mode.
- `vc:plan` phase template gains a `Stop Conditions` section — halt and confirm
  scope, never silently work around a risk.
- `vc:git` references cleaned 10→7: merged the small push/PR/merge files into
  `workflow-sync.md` and removed a contradictory orphan `prc` spec that bypassed
  review. Behavior unchanged.
- Authoring spec documents the seven-point cook-grade standard.

No skill count change; no CLI change. `pnpm test` green (218).
