---
name: av:predict
description: "Evaluate proposed changes through five expert personas before implementation. Use to surface architecture, security, performance, and UX risks in major or risky work."
user-invocable: true
when_to_use: "Invoke before high-risk changes that need persona debate."
category: utilities
keywords: [prediction, debate, review, risk]
argument-hint: "<feature description or change proposal> [--files <glob>] [--chain reason|probe]"
metadata:
  origin: ported
  author: upstream
  attribution: "Multi-persona prediction pattern adapted from autoresearch by Udit Goenka (MIT)"
  license: MIT
  version: "1.1.0"
---

# av:predict — Multi-Persona Pre-Analysis

Five expert personas independently analyze a proposed change, then debate conflicts to produce a consensus verdict before a single line of code is written.

## When to Use

- Before implementing a major or high-risk feature
- Before a significant refactor or architecture change
- Evaluating competing technical approaches
- Stress-testing assumptions in a proposed design

## When NOT to Use

- Trivial or low-risk changes (use `av:debug` for bugs, `av:plan` for already-decided tasks)
- Already-approved work with no open design questions
- Pure dependency upgrades with no API changes

---

## The 5 Personas

| Persona | Focus | Core Questions |
|---------|-------|----------------|
| **Architect** | System design, scalability, coupling | Does this fit the architecture? Will it scale? What new coupling does it introduce? |
| **Security** | Attack surface, data protection, auth | What can be abused? Where is data exposed? Are auth boundaries respected? |
| **Performance** | Latency, memory, queries, bundle size | What is the latency impact? N+1 queries? Memory leaks? Bundle bloat? |
| **UX** | User experience, accessibility, error states | Is this intuitive? What does the error state look like? Accessible on mobile? |
| **Devil's Advocate** | Hidden assumptions, simpler alternatives | Why not do nothing? What is the simplest alternative? Which load-bearing assumption — one the proposal fails without — could be wrong, and what does it cost to reverse course once it is? |

---

## Debate Protocol

1. **Read** the proposed change/feature description from the argument
2. **Read relevant code** if file paths are provided (grep for affected areas)
3. **Each persona analyzes independently** — do not let personas influence each other during this phase
4. **Identify agreements** — points where all (or 4+) personas align
5. **Identify conflicts** — points where personas meaningfully disagree
6. **Weigh tradeoffs** — for each conflict, evaluate which concern has higher impact, comparing the options on their worst plausible case, not only their expected one
7. **Produce verdict** — GO / CAUTION / STOP with actionable recommendations

---

## Output Format

```
## Prediction Report: [proposal title]

## Verdict: GO | CAUTION | STOP

### Agreements (all personas align)
- [Point 1 — what they all agree on]
- [Point 2]

### Conflicts & Resolutions

| Topic | Architect | Security | Performance | UX | Devil's Advocate | Resolution |
|-------|-----------|----------|-------------|-----|-----------------|------------|
| [Issue] | [View] | [View] | [View] | [View] | [View] | [Recommendation] |

### Risk Summary

| Risk | Severity | Early signal | Mitigation |
|------|----------|--------------|------------|
| [Risk description] | Critical/High/Medium/Low | [Observable sign this risk is materializing — omit when the risk is already certain] | [Concrete action] |

### Recommendations
1. [Action item — rationale]
2. [Action item — rationale]
3. [Action item — rationale]
```

---

## Verdict Levels

| Verdict | Meaning |
|---------|---------|
| **GO** | All personas aligned, no critical risks, proceed with confidence |
| **CAUTION** | Concerns exist but are manageable — mitigations identified, proceed carefully |
| **STOP** | Critical unresolved issue found — needs redesign or more information before proceeding |

### STOP Triggers (any one is sufficient)
- Security persona identifies auth bypass or data exposure with no viable mitigation
- Architect identifies fundamental design incompatibility requiring significant rework
- Performance persona identifies unacceptable latency or query explosion with no workaround
- Devil's Advocate exposes a false assumption that invalidates the entire approach

---

## Chain Modes

After producing the verdict, predict can chain into a follow-on workflow that always runs as part of a predict session (not as a standalone skill).

| Flag | Purpose | When to use |
|------|---------|-------------|
| `--chain reason` | Subjective refinement loop — generate → critique → synthesize → blind judge → repeat until convergence | Verdict is CAUTION with subjective tradeoffs (architecture polish, design coherence) |
| `--chain probe` | Requirement interrogation — saturation-driven harvest of missing constraints + assumptions | Verdict is CAUTION or STOP because of "missing constraint" or "unstated assumption" findings |

Use the chain-mode summaries below as the supported protocol for this kit.

These chain modes absorb upstream `/autoresearch:reason` and `/autoresearch:probe` ([uditgoenka/autoresearch](https://github.com/uditgoenka/autoresearch), MIT). They're folded into av:predict — not shipped as standalone skills — because they always chain off a predict invocation. See `/av:autoresearch` for the family map.

---

## Integration with Other Skills

| Workflow Step | Skill | How |
|---------------|-------|-----|
| Deepen risk scenarios | `av:scenario` | Feed Risk Summary rows as feature description |
| Create implementation plan | `av:plan` | Attach Recommendations as constraints to planner |
| High-risk feature implementation | `av:cook` | Reference CAUTION/STOP items as acceptance gates |

---

## Example Invocations

```
/av:predict "Add WebSocket support for real-time notifications"
/av:predict "Migrate authentication from JWT to session cookies"
/av:predict "Add multi-tenancy to the database layer"
/av:predict "Replace REST API with GraphQL" --files src/api/**/*.ts

# Chain modes
/av:predict "Pick auth library: Passport vs Better Auth" --chain reason
/av:predict "Move from REST to GraphQL" --chain probe
```

---

## Lineage

Faithful absorption (in scope) of upstream `/autoresearch:predict` ([uditgoenka/autoresearch](https://github.com/uditgoenka/autoresearch), MIT). The local version supports the 5-persona debate plus `--chain reason` (subjective refinement) and `--chain probe` (requirement interrogation), folding upstream's `/autoresearch:reason` and `/autoresearch:probe` sub-commands into chain modes rather than separate skills.

See `/av:autoresearch` for the full family map.

## Output format

Return the five persona findings, a deduplicated risk table, recommendations,
unresolved assumptions, and one `PROCEED`, `CAUTION`, or `STOP` verdict.

## Quality gates

- Every finding names evidence, impact, and a concrete mitigation or question.
- Personas challenge the actual proposal and do not invent missing system facts.
- Critical contradictions remain visible after synthesis.
- The verdict follows the documented triggers rather than majority sentiment.

## Workflow position

**Typically follows:** a concrete proposal, plan, or risky design decision.
**Typically precedes:** `av:scenario`, `av:plan`, or `av:cook`, with CAUTION and
STOP items carried forward as constraints.
**Related:** `av:security` performs a dedicated threat audit rather than a
multi-discipline proposal debate.
