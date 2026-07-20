---
name: vc:plan
description: Create phased implementation plans as plain files under plans/. Use for feature planning, roadmaps, architecture rollouts, or any multi-phase work.
user-invocable: true
argument-hint: "<feature or goal to plan>"
metadata:
  author: vchun
  version: "1.0.0"
---

# Plan

Produce an executable, phased plan as plain markdown files — created with the
Write tool, no external CLI required. `vc:cook` consumes the output directly.

Handles: feature planning, phased rollouts, technical roadmaps.
Does not handle: option exploration (`vc:brainstorm` first when the approach
is undecided), implementation (`vc:cook`).

Trade-off, on purpose: plans are plain files, so there is no kanban or status
CLI — status lives in frontmatter and the phase table, synced by hand or by
`vc:cook` / `vc:pm`.

## Preconditions

- The approach is decided (brainstorm report exists, or the user states it).
  If the approach is still open, stop and run `vc:brainstorm`.
- Scout the codebase enough to name real files in each phase — a plan that
  says "relevant modules" is not executable.

## Workflow

1. **Gather** — read the brainstorm report / user input; scout touched areas;
   list constraints and acceptance criteria for the whole effort.
2. **Slice into phases** — each phase independently completable, testable,
   and revertible. Order by dependency, then by risk (risky first).
   3-6 phases is the sweet spot; one phase = one `vc:cook` session.
3. **Write files** with the Write tool (templates in
   `references/plan-file-templates.md`):
   - `plans/{yymmdd-hhmm}-{slug}/plan.md` — the hub
   - `plans/{yymmdd-hhmm}-{slug}/phase-NN-{slug}.md` — one per phase
4. **Self-check** against the quality gates below; fix before presenting.
5. **Present** — show the phase table + acceptance criteria; adjust from
   feedback; then hand off to `vc:cook <plan path>`.

## Sync-back guard

The plan is a living document. Whoever executes a phase must:
- flip that phase file's `status` (pending → in-progress → completed)
- update the phase table in `plan.md`
- tick acceptance-criteria checkboxes only with evidence (test run, file)

A plan whose checkboxes disagree with the repo is worse than no plan — when
in doubt, verify against the code before ticking.

## Quality gates

- [ ] Every phase lists concrete file paths to create/modify/delete
- [ ] Every phase has its own success criteria (testable, not vibes)
- [ ] Dependencies between phases stated explicitly
- [ ] Whole-plan acceptance criteria are checkboxes in `plan.md`
- [ ] Risks named with mitigations, not just listed
- [ ] Each phase carries Stop Conditions when it has real risk (the finding
      that must halt and ask the user — see the phase template)
- [ ] No phase requires work from a later phase to be testable

When ordering phases by risk, classify each phase by risk lane (tiny / normal /
high-risk — the `intake-and-context` rule) so the plan front-loads the
high-risk work and marks where `vc:cook` must stop for confirmation.

## Workflow position

**Typically follows:** `vc:brainstorm` (an approach is decided and needs
phasing), or a direct multi-phase request.
**Typically precedes:** `vc:cook <plan path>` (executes a phase) and `vc:pm`
(tracks sync-back).
**Related:** `vc:brainstorm` decides *what* approach; `vc:plan` sequences *how*
to build it. Don't plan an undecided approach — brainstorm first.
