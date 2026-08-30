---
name: av:brainstorm
description: "Turn unclear intent into an accepted outcome and explore viable approaches before delivery. Use at the opening of multi-step work or when a diagnosed problem has real solution choices."
user-invocable: true
when_to_use: "Use at the opening of multi-step delivery or when a diagnosed problem has meaningful solution choices."
category: utilities
keywords: [ideation, tradeoffs, decisions, intent, acceptance]
license: MIT
argument-hint: "[topic or problem] [--advice] [--html] [--report] [--ultra] [--yagni]"
metadata:
  origin: ported
  author: upstream
  version: "2.6.0"
---

# Brainstorm

Turn incomplete intent into a bounded delivery contract. Stay honest about
evidence, trade-offs, and uncertainty without turning a clear request into a
ceremonial interview.

## Brainstorm contract

Every multi-step product, code, documentation, or maintainer delivery starts by
capturing:

- **Outcome:** the user-visible or operational end state.
- **Constraints:** safety, compatibility, time, technology, and ownership
  boundaries that shape the work.
- **Non-goals:** nearby work that this delivery will not absorb.
- **Acceptance criteria:** observable evidence that will prove completion.

An accepted design or plan satisfies the opening gate when it already contains
these fields. Reuse it and identify only material gaps; do not make the user
repeat settled decisions.

## Proportional behavior

- For a concrete request, summarize the four fields briefly and continue.
- Ask a concise question only when a missing answer would materially change the
  result, safety boundary, or public contract and cannot be discovered.
- Explicit autonomous execution may continue once the four fields are concrete;
  it does not require a routine approval pause.
- Direct answers and low-level read-only utilities do not require a design loop.
  If investigation turns into workspace mutation or delivery, satisfy the gate
  before that boundary.
- Separate target intent from current evidence. Inspect relevant repository or
  live state before claiming an approach is feasible.
- Separate uncertainty that can be discovered from uncertainty that cannot. Most
  unknowns are resolvable by reading source, docs, tests, or live state — resolve
  those instead of hedging against them. Reserve robustness reasoning for what
  stays unknowable at decision time, such as future requirements, third-party
  behavior, or audience response.

## Bug routing

For bugs, start by framing the expected repaired behavior, constraints,
non-goals, and acceptance evidence. Do not propose fixes from the symptom.

1. Scout the affected path and capture the failing state.
2. Diagnose and prove the root cause.
3. Compare cause-aligned solutions only after diagnosis.
4. Use a full options discussion when multiple viable fixes or an architecture
   decision remain; otherwise record why the direct fix is sufficient.

This preserves brainstorm-first intent without allowing brainstorming to replace
root-cause analysis.

## Option exploration

When the work has a real design choice:

1. Inspect the smallest relevant source, docs, tests, and current plans.
2. State the confirmed constraints and any evidence gaps.
3. Present up to three viable approaches with meaningful trade-offs. For each,
   name the assumption it depends on most and the condition under which it fails
   first. Compare approaches on their worst plausible case, not only their best.
4. Recommend the smallest approach that satisfies the contract. When a
   load-bearing assumption cannot be resolved now, prefer the approach that is
   cheapest to abandon.
5. Resolve material disagreement before implementation begins.

Challenge assumptions with evidence. Apply KISS and DRY. Deliver the full
requested scope — never trim or defer what the user explicitly asked for. Do not
invent extra components, migrations, or governance to make a design look
complete. With `--yagni`, additionally challenge and cut any scope not needed for
the stated outcome.

## Authoritative flow

```mermaid
flowchart TD
    A[Request] --> B{Multi-step delivery?}
    B -->|No| C[Answer or read-only utility]
    B -->|Yes| D{Accepted contract exists?}
    D -->|Yes| E[Reuse outcome, constraints, non-goals, acceptance]
    D -->|No| F[Capture bounded brainstorm contract]
    E --> G{Bug or failure?}
    F --> G
    G -->|Yes| H[Scout and diagnose root cause]
    H --> I[Choose cause-aligned solution]
    G -->|No| J[Inspect relevant evidence]
    J --> K[Compare approaches when choice is material]
    I --> L[Plan or fix]
    K --> L2[Plan or cook]
```

The opening contract is always first for delivery. Detailed solution exploration
may occur later when diagnosis or inspection provides the evidence it needs.

## Handoff

Pass the four contract fields, chosen direction, evidence, and unresolved risks
to the next owning workflow:

- feature or documentation delivery: the installed plan skill, then `/av:cook`;
- diagnosed bug: `/av:fix`;
- exploration only: report the recommendation and stop.

If the user passed `--yagni`, include the literal flag in every downstream skill
or subagent handoff. Otherwise, do not introduce it during handoff.

Write a durable summary only when the decision must survive the session or feed
a plan — or always, when `--report` is passed (see Report Output Mode). Use the
repository's configured report location and naming convention; do not create a
report merely to satisfy the gate.

## HTML Output Mode (`--html`)

When `--html` is present, capture the accepted brainstorm outcome as a
self-contained HTML brief the user can preview before delivery starts. The brief
augments the handoff; it never replaces the four contract fields passed to the
next workflow.

- Write `brainstorm.html` in the repository's configured report location.
  Self-contained: inline CSS and JavaScript, no build step, no network-required
  assets, safe to open directly from disk. Keep it accessible, responsive, and
  reduced-motion friendly.
- Include the four contract fields, the compared approaches with trade-offs, the
  recommendation and its rationale, and any unresolved risks or questions.
- **Implementation workflow diagram (required):** render at least one inline
  diagram (HTML/CSS/SVG) that visualizes what the chosen direction will build
  and how its steps or components connect — the delivery flow, not only the
  decision tree.
- **UI/UX mockups with annotations (required when the topic touches UI/UX):**
  embed annotated mockups of the proposed interface directly in the HTML so the
  user previews intended UI before planning. Derive layout, color, type,
  spacing, and component states from the project design guidelines
  (`docs/design-guidelines.md` when present, otherwise a restrained built-in
  editorial contract). Add callouts tying each element to design tokens,
  interaction states, and the acceptance evidence it satisfies.
- When the installed frontend-design skill is available, activate it before
  composing the HTML so the visuals follow current design intelligence.
- If image or diagram generation is unavailable, fall back to CSS/SVG structure
  and state the limitation in the final response; do not block the brainstorm.

## Report Output Mode (`--report`)

When `--report` is present, always persist the accepted brainstorm as a
durable markdown report, following the installed project-organization skill's
conventions for path resolution, naming, and body structure:

- **Path:** the plan-scoped reports directory (`plans/{plan-dir}/reports/`)
  when an active plan exists, otherwise the standalone `plans/reports/`
  directory — or the injected `Report:` path when the runtime provides one.
- **Naming:** timestamped kebab-case, e.g. `brainstorm-{YYMMDD-HHmm}-{slug}.md`.
- **Body:** frontmatter, summary, the four contract fields, options considered
  with trade-offs, recommendation, and unresolved questions last.

`--report` composes with every other flag; with `--html`, both artifacts are
written. Without it, report only when the decision must outlive the session.

## Advisory supervision (`--advice`)

When `--advice` is present, run this skill under `kongming` supervision.
`kongming` is an advisory-only supervisor: it returns counsel, never code, and
the main agent stays responsible for every decision, edit, and gate.

Spawn `kongming` at these checkpoints:

- **After each phase, step, or decision round completes** — pass the goal, what
  changed or was concluded, and the evidence; ask for a go/no-go and the next
  risk to watch before continuing.
- **When stuck** — repeated failures, a blocked step, or contradictory evidence;
  pass everything already tried and the exact obstacle.
- **Before a high-stakes decision** — a design fork, a public-contract or
  security-sensitive change, or an irreversible action; get counsel first.

Invoke with
`delegate_agent capability(subagent_type="kongming", prompt="<task, evidence, approaches tried, the exact question>", description="advice: <checkpoint>")`.
Give it enough context to answer in one reply; it does not interview.

**When the workflow reaches a PR** (here, via the handed-off plan/cook/fix
workflow): pass `--advice` to the downstream skill so supervision persists
across the handoff. Watch and fix CI until every required check is green, then
spawn `kongming` to review the whole implementation and post its assessment
plus concrete next steps as a comment directly on the PR and the source issue
(when one exists).

`--advice` adds supervision; it never bypasses this skill's approval gates,
tests, review blockers, branch protections, or security policy.

## Ultra Verifier Mode (`--ultra`)

When `--ultra` is present, run the brainstorm as a best-of-5 verifier pass
instead of a single draft. The controller builds one immutable evidence packet
plus a rubric, dispatches exactly five independent read-only candidate
brainstorms in one parallel wave, then a single strongest-model verifier scores
and ranks them and selects the winning candidate (or rejects all).

- **Candidate task:** each candidate produces a complete bounded contract —
  outcome, constraints, non-goals, acceptance criteria — plus its recommended
  direction and trade-offs.
- **Rubric:** faithfulness to the request, evidence grounding, sharpness of the
  acceptance criteria, and honesty about unknowns.
- **Finalizer:** the verifier selects the single winning contract; the
  controller emits that winner unchanged (it does not blend candidates) and
  records a short ranking appendix. On reject-all, hard-stop and report why.

Full mechanics — evidence packet, anonymization, the five-usable-candidate gate
with one bounded re-dispatch, the fail-closed runtime rule, and reject-all — are
in `references/ultra-verifier-mode.md`, the protocol every other `--ultra`
skill shares. `--ultra` composes with `--html`, `--advice`, and `--yagni`, and
adds no new conflicts; a durable summary written under `--ultra` records the
winning candidate plus the short ranking appendix. It is a best-of-5 verifier
mode inspired by LLM-as-a-Verifier, not the full framework; never claim its
logprob/tournament algorithm.

## Boundaries

- This skill shapes intent and choices; it does not implement the solution.
- Never claim current behavior from intent alone.
- Never expose secrets or unrelated private files during inspection.
- List unresolved questions last when any remain.

## Output format

The contract block is the deliverable; the options table appears only when
there was a real design choice.

```markdown
## Brainstorm contract
- Outcome: <end state>
- Constraints: <safety, compatibility, time, technology, ownership>
- Non-goals: <nearby work excluded>
- Acceptance criteria: <observable evidence>
- Source: captured now | reused from <plan/design path> (gaps: <...> or none)

## Options (when a material choice exists)
| Approach | Load-bearing assumption | Fails first when | Worst plausible case |
|----------|-------------------------|------------------|----------------------|
| A ...    | ...                     | ...              | ...                  |

**Recommendation:** <smallest approach that satisfies the contract> — because <evidence>.
**Evidence gaps:** <what could not be discovered> — or "none".

## Handoff
→ `/av:plan` | `/av:cook` | `/av:fix` | stop (exploration only), with `--yagni` / `--advice` forwarded if passed (`--ultra` is not forwarded; it shaped this contract only).
Report: <path under the configured report location> — when `--report` was passed or the decision must outlive the session.

## Unresolved questions
- ... or "none"
```

With `--html`, `brainstorm.html` sits beside the report and carries the same
fields plus the required delivery diagram (and annotated mockups for UI topics).

## Quality gates

- [ ] All four contract fields are filled from the request, the repo, or the
      user — none reads "TBD", and none repeats a decision an accepted plan
      already records.
- [ ] Every approach in the table names the assumption it depends on most and
      the condition under which it fails first; an option without a failure
      condition is a pitch, not a comparison.
- [ ] Each feasibility claim points at the source, test, doc, or live state
      that was actually inspected — intent alone never establishes behavior.
- [ ] For a bug, the root cause was proven before any option was compared.
- [ ] The recommendation is the smallest approach that meets the contract; the
      full requested scope is intact unless `--yagni` was passed.
- [ ] No workspace file changed during this skill except the report or
      `brainstorm.html`.

Proof/risk: N/A — decides direction; the downstream plan or fix sets the proof
level for the change.

## Workflow position

**Typically follows:** `av:ask` or `av:scout` when an answer or an orientation
pass turned into delivery work, and `av:debug` on the bug path once the cause
is proven.
**Typically precedes:** `av:plan` for feature or documentation delivery,
`av:cook` when the accepted direction needs no plan, `av:fix` for a diagnosed
bug, and `av:bootstrap` when the outcome is a new project.
**Related:** `av:advise` answers a question that is already well posed;
`av:predict` runs persona debate on a chosen change; `av:issue-to-plan` wraps
this gate for GitHub issues.

**Bug path:** intent frame -> `av:scout`, `av:debug` -> brainstorm if needed -> `/av:fix`.
