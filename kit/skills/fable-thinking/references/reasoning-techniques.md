# Reasoning Techniques — failure modes, altitude, stuck-ness, portable habits, harness use

The depth behind the protocol in SKILL.md: why models reason badly, how to move when a
framing stalls, how to execute the moves on any model, and what to do with the tools a
runtime grants. The moves themselves (Floor, Proportionality Gate, Constraint Loop, the
Five Moves, Claim Discipline) stay in SKILL.md; this file is read when one of them needs
its reasons or its fallback.

## Know Your Own Defaults (why models reason badly)

Models fail at reasoning in predictable ways. Naming them is the first countermeasure:

- **Pattern-match satisfaction** — the first explanation that fits a familiar template feels
  like the diagnosis. Familiarity is retrieval, not verification. Countered by Move 3.
- **Template hijack** — a question whose surface matches a stored template ("flaky test →
  add retry", "slow query → add index") fires the template's answer before this question's
  constraints are read. Familiarity raises the risk rather than lowering it. Countered by
  the Floor.
- **Fluent ≠ true** — your own well-formed prose feels more correct as it flows. Confidence
  rises with token count, not with evidence. Countered by Move 4.
- **Prior-as-fact** — training knowledge gets stated in the grammar of observed fact. Priors
  decay: APIs change, versions move, prices update, docs rot. Countered by Claim Discipline.
- **Confirmation seeking** — once you have a favorite hypothesis, you pick tests it will
  pass. Countered by the discriminating-test rule in Move 3.
- **Frame adoption** — you inherit the user's framing ("the cache is broken again") as fact.
  The user is a witness, not an oracle: trust their goal absolutely, treat their diagnosis
  as testimony to verify. Countered by Moves 1 and 2.
- **Completion pressure** — producing something answer-shaped now feels better than checking
  one more thing. An answer-shaped non-answer is worse than "here is what I verified and
  what is still open". Countered by the quality gates.
- **Surface blindness** — you produce and read text as tokens, not characters. Any claim
  about the surface form of your own output — which symbols it contains, how many units
  it has, whether a pattern holds — is a guess unless verified unit by unit or by tool;
  re-reading always reports a pass. Worse, generation is meaning-driven, so the most
  natural wording for the topic is the likeliest violator of a surface constraint.
  Countered by the Constraint Loop.

## Altitude Control

Problems and fixes live at four altitudes: **intent** (what is this for) → **design**
(what shape solves it) → **implementation** (which lines) → **mechanics** (exact bytes,
versions, environment).

- Diagnose the altitude before fixing. The most common bad fix is a line-level patch for a
  design-level fault; the second most common is redesigning what a one-line mechanical fix
  solves.
- When reasoning stalls at one altitude, deliberately move one level up or down. Errors
  hide at altitude boundaries.

## When Stuck

Two or three failed attempts inside one framing means the framing is wrong — not that the
effort was insufficient. Never repeat a failed probe harder. Change exactly one of:

- **Altitude** — zoom out (what is this actually for?) or in (what are the exact bytes?).
- **Direction** — invert: "what would have to be true for it to fail exactly this way?"
  and work backwards from the failure.
- **Ground** — stop reasoning; go collect the missing observation (a log, a minimal
  reproduction, a bisect).

Where this hands off when a change of framing is not enough is named in SKILL.md,
"Workflow position".

## Portable Techniques (how to think the moves, on any model)

The moves say WHAT to check; these techniques are HOW to execute the checking. They need
no special runtime — only tokens — and they are the highest-leverage habits for models
that reason well but default to answering fast. Reach for one whenever an answer starts
forming automatically:

- **Step back first** — before answering the specific question, name the general
  principle or problem class it is an instance of, then apply that principle to the
  specifics. Deriving the abstraction first blocks the template answer that rides in on
  surface details. Ask "what kind of problem is this?" before "what is the answer?".
- **Chain the thought, answer last** — reason in explicit numbered steps, each depending
  on the previous, and state the conclusion only after the chain ends. Never emit the
  answer first and justify it afterwards: post-hoc justification always succeeds, which
  is exactly why it proves nothing.
- **Restate before solving** — rewrite the question in your own words with every detail
  and constraint included. A detail that will not fit in your restatement is either the
  trap or a constraint you were about to drop. This is the Floor's Leftovers check run
  proactively.
- **Derive twice, independently** — for any load-bearing conclusion, reach it a second
  time by a different route: different starting point, inverted direction, different
  method. Agreement is mild support; disagreement is a hard stop signal worth more than
  either answer.
- **Concretize** — replace abstractions with actual values and walk them through step by
  step. "Looks right" in the abstract survives; it rarely survives one concrete trace.
- **Invert** — assume your conclusion is wrong and ask what it would have had to miss.
  Working backwards from imagined failure finds holes that forward reasoning steps over.
- **Treat instant answers as alarms** — an answer that arrived before you finished
  reading is retrieval, not reasoning. Demote it to a hypothesis and run the Floor
  against it deliberately. Speed plus confidence is the signature of template hijack,
  not of correctness.

## Harness Leverage (use what the environment grants)

Portable techniques need only tokens; most runtimes grant more. At the start of a task,
take inventory of what your harness actually grants — executing code or shell commands,
reading and writing files, fetching documents, searching, spawning sub-agents — and treat
that inventory as your verification budget. Two rules govern its use:

- **Anything a granted capability can check, it must check.** A claim that a script, a
  compiler, a test run, or a search could settle in seconds is never settled by reasoning
  alone. Manual unit-by-unit verification is the fallback for capability-poor runtimes,
  not a substitute where tools exist.
- **Checkable work runs as a loop, not a single pass.** Produce → verify with the
  strongest granted check → repair → re-verify, and keep looping until one complete
  verification of the final artifact comes back clean — or the remaining uncertainty is
  named explicitly in the delivery. One green check on the last edit says nothing about
  the edit's neighbors: re-verify the whole artifact, not the change.

Confidence earned this way compounds: every loop iteration converts an ASSUMED into an
OBSERVED. Confidence without a loop behind it is the fluent-≠-true default wearing a
harness it never used.

## Execution Notes

Where the moves run, and what Full mode labels, is in SKILL.md, "Output format".

- On models without a private reasoning space or extended thinking, make the chain
  visible and ordered: restate → numbered steps → answer. The answer token must come
  last, never first.
- Minimum viable run under tight budgets or small models: the Floor plus claim typing on
  the final answer. Never less than that.

## Anti-Patterns

| Don't | Because | Instead |
|-------|---------|---------|
| Diagnose by resemblance ("classic X") | Same symptom, different cause | Verify the mechanism chain |
| Answer the template a question resembles | Familiar surface, different constraints | Run the Floor; account for leftover details |
| State the goal using one of the options | The question's framing smuggled in as the goal | Goal = the task's object in its finished state, option-free |
| End the follow-through at the first milestone | Arrived/sent/submitted is not the outcome | Run the movie to the frame where the goal is verified |
| Test to confirm | Confirmation almost always succeeds | Test to discriminate hypotheses |
| State priors as facts | Training knowledge decays | Type the claim; check if load-bearing |
| Verify everything uniformly | Wastes budget on trivia | Load-bearing facts first |
| Let confidence grow with effort | Effort is not evidence | Audit what moved it |
| Retry the same probe harder | The framing is the problem | Change altitude, direction, or ground |
| Bury the answer | The reader needs the outcome | First sentence = outcome |
| Hedge what you verified | Uncertainty theater erodes trust | Calibrated grammar in both directions |
| Fix adjacent problems unasked | Scope drift, review burden | One-sentence flag, no work |
| Deliver answer-shaped non-answers | Worse than an honest gap | "Verified X; still open: Y" |
| Certify your own text by re-reading it | You see tokens, not characters — a re-read always passes | Decompose into the governed units and test each, or run a tool check |
