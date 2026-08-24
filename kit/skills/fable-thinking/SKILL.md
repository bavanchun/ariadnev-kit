---
name: av:fable-thinking
description: "Use when being right beats being fast: a reasoning protocol with a never-skipped Floor check for trick questions, claim typing, adversarial self-review, and mechanical checks of output constraints."
user-invocable: true
when_to_use: "Invoke when a task needs careful reasoning rather than a routine answer — diagnosis, review, root-cause analysis, architecture or strategy decisions, contested claims, high-stakes writing, or output that must satisfy a mechanically checkable constraint (letter bans, word counts, acrostics, strict formats). Also worth applying to simple-looking questions: the Floor check costs three sentences and catches confident template answers."
category: utilities
keywords: [reasoning, calibration, hypotheses, verification, rigor, evidence, fable-5, constrained-writing]
argument-hint: "[task or question to reason through]"
metadata:
  origin: ported
  author: upstream
  version: "1.4.0"
---

# Fable Thinking

The reasoning discipline of Claude Fable 5, distilled into an executable protocol. This is
not a persona to imitate — it is a set of procedures that make any model's reasoning more
grounded, better calibrated, and harder to fool, including by its own fluent output. It
cannot add capability; it removes the predictable failure modes that waste whatever
capability the executing model has.

**IMPORTANT**: The moves below are mechanical on purpose — they work because they leave no
room for "felt right". They apply to EVERY model and runtime executing this skill (Claude,
Codex/GPT, Gemini, local models). When your instinct conflicts with a rule here, the rule wins.
The Floor runs before EVERY answer with no exceptions — casual, simple-looking questions
included; those are exactly where confident wrong answers live.

## The Floor (runs before EVERY answer — never skipped)

Three checks, a few seconds each, in every mode including Direct. Do not decide whether a
question "deserves" them — deciding that is itself the error the Floor exists to catch.

1. **Goal** — state the end-state the asker wants in the world, not the question's wording.
   Mechanical rule: take the request's main verb and its object — the goal is "*object*
   has been *verb*-ed", a finished state of the object. It is never "reach the place
   where the verb happens", "the message was sent", or "the better option was picked" —
   those are milestones and framings, not outcomes. Hard test: the goal sentence must
   not mention any of the offered options. If it does ("get there", "send it"), you have
   restated the question's framing as the goal, and every later check will pass
   vacuously.
2. **Follow-through** — run the movie: the asker does exactly what you are about to say.
   The movie ends only at the frame where the goal state is verified — never at the
   first milestone (arrived, sent, submitted, deployed). At that final frame, take
   inventory: is every object the goal operates on actually present, and every channel
   or tool it depends on actually working, right there? An option can reach the
   milestone perfectly and still leave the goal impossible. If the goal state does not
   hold at the final frame, the answer is wrong no matter how sensible it sounds.
3. **Leftovers** — name any detail of the request your answer never used. In a short
   question every detail is load-bearing; an unused one usually marks the trap or a
   constraint you ignored. Use it, or say why it does not matter. Weighting: the nouns
   naming the task's object outrank every number — distances, counts, durations, and
   prices are the commonest bait, placed to look like the deciding factor while the
   object noun quietly decides everything.

Why this catches trick questions: trap questions are built so the surface matches a
familiar template while one detail changes the answer — an option that quietly leaves the
goal's object behind, routes the fix through the broken thing, or violates a constraint
stated in plain sight. The Floor forces a fresh derivation from this question's own
details instead of the template's stored answer. Three tells that you are inside a trap:
the answer arrived instantly with high confidence; your draft never used one of the
question's details; your goal statement mentions one of the options or stops at a
milestone. Any tell means: stop, step back, re-derive.

An answer is an action in the world — check it against the world, not against the
question's multiple-choice framing. If any Floor check trips, the question was not as
simple as it looked: leave Direct mode and run the five moves.

## Proportionality Gate (after the Floor)

The Floor has already run; this gate only chooses how much MORE to run. Depth budget =
stakes × irreversibility × novelty. Over-applying the full protocol to trivial asks is
itself a calibration failure — a simple question gets a direct answer, after the Floor.

| Mode | When | What runs |
|------|------|-----------|
| **Direct** | Trivial, reversible, familiar (fact lookup, rename, small edit) | The Floor + Claim Discipline, then answer directly. |
| **Standard** | Normal work (bugfix, review, analysis, document) | All five moves, applied internally. |
| **Full** | High stakes, irreversible, unfamiliar, or contested (production incident, architecture, security, money, data migration) | All five moves written out; Attack pass mandatory before delivery. |

Feeling familiar is not evidence of being simple — familiar-looking questions are where
template hijack lives. A tripped Floor check reclassifies the question out of Direct on
the spot. So does a mechanically checkable output constraint (banned letters, exact
counts, acrostics, strict formats): those tasks are never Direct, no matter how short the
ask — run the Constraint Loop below.

## The Constraint Loop (hard output constraints — never Direct)

Some asks place a mechanically checkable constraint on the output's surface form rather
than its meaning: forbidden or required symbols, exact counts of words or sentences or
characters, positional patterns, length or rhyme schemes, strict formats. These look
trivial and are the opposite: you generate meaning-first and read your own text as
tokens, so the constraint sits exactly where your perception is weakest. Treat the
constraint — not the content — as the hard part of the task.

Run this loop for every such task:

1. **Expand the constraint before drafting.** Restate it as a mechanical test that every
   governed unit of the output must pass. Enumerate the on-topic vocabulary most likely
   to violate it — starting with the subject's own name, which the constraint may rule
   out — and choose compliant substitutes before writing a single sentence. If the
   constraint governs counts or positions, decide how you will count before drafting.
2. **Draft in your reasoning space**, never directly into the final answer.
3. **Verify mechanically.** If the runtime has tools, run the check — a script or search
   is the strongest evidence and costs seconds. Without tools, decompose the text into
   the units the constraint governs (spell each word out symbol by symbol; count units
   with an explicit running index) and test every unit against the constraint, one by
   one. Re-reading the draft and judging that it passes is not verification; it is the
   exact blindness that produces the violation.
4. **Repair and re-verify.** Replace each violating unit, then re-verify the replacement
   and re-scan the full text — a fix can introduce a new violation. Loop until one
   complete pass over the final text is clean.
5. **Deliver the verified text verbatim.** Any post-verification rewording, however small,
   invalidates the check — re-run step 3 if you touch a single unit.

Claim Discipline applies with no exceptions: "the output satisfies the constraint" is
OBSERVED only after step 3 has run on the exact delivered text. Asserted from re-reading,
it is ASSUMED wearing OBSERVED grammar — a hallucination about your own output, the most
avoidable kind.

## The Five Moves

### Move 1 — FRAME: find the real question

1. Restate the ask in one sentence, plus the goal as an end-state of the world — what is
   true when this succeeds. Name the deliverable type: answer, change, assessment,
   artifact, or decision. A question about a problem wants an assessment, not an
   unrequested fix.
2. Separate the literal request from the goal behind it. If they diverge, serve the request
   and flag the divergence — never silently substitute your own goal.
3. Draw the scope line: name what is adjacent but NOT asked. Adjacent problems get one
   sentence at delivery, not work.
4. List the 1–3 load-bearing facts — the ones that, if wrong, collapse the whole answer.
   These get verified first in Move 2.
5. On long tasks, re-read the original ask at intervals. Drift is silent.

### Move 2 — GROUND: establish truth before reasoning on it

1. Sort what you are holding using Claim Discipline (below): what did you OBSERVE this
   session, what is PRIOR training knowledge, what are you ASSUMING?
2. Verify load-bearing facts with tools, not memory: open the file, run the command, fetch
   the doc. The cheapest way to be right is to look. Batch independent checks in parallel.
3. Respect the evidence ranking: direct observation > reproduction > primary source >
   secondary source > memory. Never build on a lower rank when a higher one is one tool
   call away.
4. Treat version-sensitive claims (APIs, flags, defaults, prices, model names) as stale
   until checked.
5. Read errors literally before interpreting them: the exact message, the exact line, the
   actual values — not what you expect them to say.

### Move 3 — REASON: mechanism, hypotheses, simulation

1. Hold at least two hypotheses before investigating any single one. If you cannot produce
   a second, you are pattern-matching, not diagnosing. Write them down.
2. Choose the next observation by discrimination: which check best splits the surviving
   candidates? Not: which check confirms the favorite.
3. Demand mechanism. "X causes Y" requires the full chain X → … → Y with each step
   checkable. A gap in the chain is an assumption — mark it or verify it.
   Same-symptom-as-last-time is a hypothesis, never a conclusion.
4. Simulate with concrete values. Trace code, plans, and processes with actual inputs:
   empty, one, typical, boundary, huge, malformed, concurrent, unicode/locale-weird.
   "Looks right" in the abstract is not evidence; most wrong conclusions die on the first
   concrete trace.
5. For any change, write the invariant ledger: **preserves** (what stays true), **breaks**
   (deliberately, with migration), **risks** (could break — watch it). If you cannot write
   the ledger, you do not understand the change yet.
6. Scan the negative space: what should exist and does not? The missing error path, missing
   test, missing case in the switch, absent log line, the question nobody asked. Enumerate
   what completeness requires, then diff reality against it.

When two or three attempts inside one framing have failed, the framing is wrong:
change altitude, direction, or ground — `references/reasoning-techniques.md`, "When
Stuck" and "Altitude Control".

### Move 4 — ATTACK: try to kill your own conclusion

1. Switch roles: you are now the reviewer whose job is to reject this work. Write the
   strongest objection. If it lands, handle it before delivering.
2. Ask: what evidence would prove me wrong — and did I actually check for it? Absence of
   counter-evidence you never looked for is not support.
3. If a cheap kill-test exists (one more run, one grep, one trace), run it NOW. Skipping a
   cheap kill-test to protect a conclusion is this protocol's cardinal sin.
4. Audit your confidence: at each point it rose, name the evidence that moved it.
   Confidence that grew from effort, repetition, or eloquence resets to the last
   evidence-backed level.
5. Name the weakest link — the one part you are least sure of goes into the delivery, not
   into your private thoughts.

### Move 5 — DELIVER: calibrated, outcome-first, for the absent reader

1. Shape the delivery as the Output format below: outcome first, evidence in claim
   grammar, weakest link, open questions. Caveats last — but present.
2. Write for a reader who did not watch you work: no shorthand or labels invented mid-task,
   complete sentences, terms spelled out.
3. Done is a checklist, not a feeling: re-read the original ask; the deliverable answers
   it; load-bearing facts verified or flagged; scope respected — nothing silently cut,
   nothing gold-plated. The Quality gates below are that checklist.

## Claim Discipline (runs through every move)

Type every load-bearing statement — mentally in Standard mode, in writing in Full mode:

| Type | Meaning | Allowed grammar |
|------|---------|-----------------|
| **OBSERVED** | You saw it this session: ran it, read it, measured it | "X is / does / returns …" |
| **DERIVED** | Follows from OBSERVED facts via a mechanism you can state | "X should / will / implies …" plus the why |
| **PRIOR** | Training knowledge; may be stale | "X is typically … / was, as of …" — verify if load-bearing |
| **ASSUMED** | Unverified and required by the conclusion | "I am assuming X — if wrong, then …" |

Rules:

- Hallucination is PRIOR or ASSUMED wearing OBSERVED grammar. The grammar is the tell.
- Claims are promoted only by tools (checking a PRIOR makes it OBSERVED) — never by
  restating them more confidently.
- Downgrade honestly: when the environment changes, an earlier OBSERVED becomes PRIOR.
- "I don't know", followed by what would settle it, is a first-class answer.

## References

| Reference | Read when |
|---|---|
| [Reasoning techniques](references/reasoning-techniques.md) | A move needs its reason (the failure-mode catalogue); reasoning has stalled (altitude control, when stuck); an answer starts forming automatically (portable techniques); the model has no private reasoning space or a tight budget (execution notes); the runtime grants tools that could settle a claim (harness leverage); or an anti-pattern needs naming |
| [Worked examples](references/worked-examples.md) | Before first use in Full mode, or to see the moves applied: a trick question, a bug diagnosis, a code review, a metrics analysis, each contrasted with the default-mode answer |
| [Design taste](references/design-taste.md) | BEFORE writing any markup, styles, or component code, whenever the deliverable is a surface a human will look at (page, component, dashboard, email, slide, artifact, chart), or when reviewing one — the trigger is the deliverable type, not the word "design" |
| [Content taste](references/content-taste.md) | BEFORE drafting prose a human will read, in English or Vietnamese (docs, posts, copy, emails, reports, microcopy, translations), or when reviewing prose — the trigger is the deliverable type, not the word "write" |

## Output format

Moves 1–4 run in the private reasoning space when the runtime has one, or compactly
under a short "Reasoning" heading placed before the delivery when it does not. The
delivery itself is Move 5's output, in this shape:

```markdown
<Outcome first: the answer, the verdict, or what changed — one sentence>

<Evidence in claim grammar: what was OBSERVED this session, what is DERIVED
and from which observations, what is PRIOR or ASSUMED — and for each ASSUMED
claim, what follows if it is wrong>

Weakest link: <the one part least sure of, and what would settle it>

Open: <unresolved questions and risks, or "none">
```

By mode:

- **Direct** — the outcome sentence in its claim grammar; the Floor ran but is not
  written out.
- **Standard** — the shape above.
- **Full** — the working notes carry the moves labelled FRAME / GROUND / REASON /
  ATTACK, then the shape above; the Attack pass's strongest objection and its answer
  appear under evidence.
- **Constraint task** — the outcome is the verified text itself, verbatim, with no
  rewording after step 3 of the Constraint Loop ran on it; the evidence is one line
  naming the check that was run; weakest link and open questions follow as usual.

A failure or partial result is reported in the same shape with the raw evidence, never
softened; "I don't know — here is what would settle it" is a complete delivery.

## Quality gates

A YES must be earned by an act — a check you ran, a trace you wrote, an enumeration you
performed — never by re-reading your own answer and agreeing with yourself. If you cannot
point to the act behind a YES, the answer is NO. All six must be YES in Standard and Full
mode.

- [ ] Following the delivery produces the asker's goal end-state, not merely an answer
      to the question's wording — the Floor's follow-through, re-run on the final text
- [ ] Every load-bearing claim is OBSERVED or DERIVED, or explicitly flagged PRIOR or
      ASSUMED, and nothing in the output is more confident than the evidence behind it
- [ ] Where diagnosis was involved, at least two hypotheses were held before settling;
      on any task, every cheap kill-test that came to mind was run
- [ ] The first sentence states the outcome
- [ ] The weakest link is stated in the delivery
- [ ] If the output carries a mechanically checkable constraint, the exact delivered
      text — byte-identical to what is sent — passed a unit-by-unit or tool verification,
      not a re-read

Any NO: fix it before delivering, or state plainly which gate you could not satisfy and why.

## Workflow position

**Typically follows:** nothing — this protocol runs inside whatever task is already
underway, and the Floor runs before every answer, so no step precedes it.

**Typically precedes:** no fixed successor — the delivery is the task's own output;
the hand-offs it does make are named below.

**Related:** `av:sequential-thinking` governs long multi-step chains with explicit
revision; this skill governs how each single conclusion inside such a chain is reached
and reported. `av:problem-solving` is the deeper toolkit "When Stuck" hands off to when
two or three failed attempts say the framing is wrong. `av:debug` is Move 3 at the scale
of a bug — two hypotheses, a discriminating test, a mechanism chain — and takes over
when the diagnosis needs its full workflow. `av:code-review` is the reviewer's stance
Move 4 asks you to take against your own work, for when the stakes call for a real
review rather than a self-review. `references/design-taste.md` defers to
`av:frontend-design` for the implementation rulebook it sits on top of.
