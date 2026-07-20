---
name: vc:predict
description: Run a 5-persona debate on a proposed change before implementing it. Use before a major feature, risky refactor, or when choosing between competing approaches.
user-invocable: true
argument-hint: "<proposed change> [--files <glob>]"
metadata:
  author: vchun
  version: "1.0.0"
  attribution: "Multi-persona debate pattern adapted from autoresearch by Udit Goenka (MIT)"
---

# Predict

Five expert personas independently analyze a proposed change, then debate
where they disagree, producing a GO/CAUTION/STOP verdict before a line of
code is written.

Handles: pre-implementation risk analysis for major features, refactors, or
competing approaches.
Does not handle: bugs (`vc:fix`), already-decided work (`vc:cook`), routine
low-risk changes (the debate overhead isn't worth it — see
`../cook/references/risk-lanes.md` for the lane check).

## The 5 personas

| Persona | Asks |
|---|---|
| Architect | Does this fit the existing design? What new coupling does it add? |
| Security | What can be abused? Where is data exposed? Auth boundaries respected? |
| Performance | Latency impact? N+1 queries? Memory or bundle bloat? |
| UX | Is this intuitive? What's the error state? Accessible? |
| Devil's Advocate | Why not do nothing? What's the simplest alternative? Which assumption might be wrong? |

## Rule: ground every persona in the repo

Each persona's analysis must cite at least one real file or pattern from the
codebase when the proposal touches existing code — a persona arguing purely
in the abstract ("this could have performance issues") is not useful. If
`--files` is given, read them first; otherwise scout enough to ground the
debate before personas speak.

## Workflow

1. Read the proposal (and files, if given).
2. Each persona analyzes **independently** first — don't let one view
   contaminate another before the debate step.
3. Identify agreements (4+ personas align) and real conflicts.
4. For each conflict, weigh which concern has higher impact given this
   project's actual constraints (not generic best practice).
5. Produce a verdict.

## Verdict levels

| Verdict | Meaning |
|---|---|
| GO | Personas aligned, no critical risk |
| CAUTION | Manageable concerns, mitigations identified |
| STOP | Unresolved critical issue — needs redesign or more info |

STOP triggers (any one): Security finds an auth bypass/data exposure with no
mitigation; Architect finds a fundamental incompatibility; Performance finds
unacceptable latency/query explosion with no workaround; Devil's Advocate
exposes a false assumption that invalidates the whole approach.

## Output

```markdown
## Prediction: <proposal>
## Verdict: GO | CAUTION | STOP

### Agreements
- <point, with file citation where it touches existing code>

### Conflicts & Resolutions
| Topic | Architect | Security | Performance | UX | Devil's Advocate | Resolution |

### Risk Summary
| Risk | Severity | Mitigation |

### Recommendations
1. <action — rationale>
```

Feed CAUTION/STOP risk rows into `vc:scenario` for deeper edge-case coverage,
or into `vc:plan`'s risk assessment when proceeding.
