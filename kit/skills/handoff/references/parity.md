# Parity: vc:handoff vs ak-handoff

Source baseline: `ak-handoff` v1.0.0 (decision 0003, AgentKit baseline).

## Kept

| From ak-handoff | Why |
|---|---|
| "State and rationale, not a command list" framing | The whole point — a fresh agent needs *why*, not orders |
| Read project + prior handoff before drafting | Grounds the handoff in the repo, avoids stale restatement |
| Reference artifacts instead of copying | Keeps the handoff compact and non-duplicative |
| Redaction of secrets/PII/private URLs | Non-negotiable safety boundary |
| Fixed section shape + fresh-agent prompt at the end | Predictable, paste-ready structure |
| Save to `plans/reports/handoff-*.md` | Matches the vc reports convention |

## Dropped (with reason)

| Dropped | Reason |
|---|---|
| Explicit "use ak-watzup for git-derived status" boundary line | Rewired to the vc graph — the boundary is now stated against `vc:pm` and `vc:journal` in Workflow position |
| `when_to_use` / `category` / `keywords` / `upstream` frontmatter | Not in the vc allowlist; taxonomy → `metadata.category` |

## Improvement (parity-or-better)

- **Explicit differentiation from `vc:pm` and `vc:journal`.** ak-handoff only warns
  off `ak-watzup`; vc:handoff names all three neighbours (pm = plan-file truth,
  journal = retrospective, handoff = forward session snapshot) in both the body and
  the graph, so routing among the trio is unambiguous.
- **Verification-status as a first-class gate.** A quality gate forces every
  "done" claim to state its evidence or be marked unverified — tightening
  ak-handoff's looser "verification status" section into a checked contract.
