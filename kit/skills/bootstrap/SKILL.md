---
name: vc:bootstrap
description: Bootstrap a new project end to end — stack choice, planning, and implementation. Use when starting a project from scratch or a full-stack feature with no existing scaffold.
user-invocable: true
argument-hint: "<requirements> [--full|--auto|--fast|--parallel]"
metadata:
  author: vchun
  version: "1.0.0"
---

# Bootstrap

Orchestrate a blank-slate project from a concrete product contract to verified
running code. Bootstrap owns intake, repository initialization, stack/design
gates, and handoffs; it does not implement application code directly.

Handles: new repositories and genuinely scaffold-free products.

Does not handle: adding a feature to an established codebase. Start with
`vc:brainstorm`, `vc:plan`, or `vc:cook` there instead.

## Opening contract — all modes

Before Git initialization, research, design, planning, or scaffolding, capture:

- intended product outcome;
- technology, safety, compatibility, and delivery constraints;
- explicit non-goals;
- observable acceptance criteria for the running project.

Reuse an accepted brief or plan when it already contains these fields. Inspect
available evidence before asking, and ask only about a missing decision that
would materially change the product or safety.

`--fast`, `--parallel`, and explicit `--auto` do not skip this gate; they only
change execution and approval behavior after the contract is concrete.

## Modes

| Flag | Purpose | Approval behavior |
|---|---|---|
| `--full` (default) | Research and compare before each major choice | User approves research, stack, optional design, and plan |
| `--auto` | Explicit autonomous continuation | Contract remains mandatory; pause only for design approval or a true blocker |
| `--fast` | Avoid duplicate research when requirements are clear | Fast setup, then normal `vc:cook` review gates |
| `--parallel` | Execute genuinely independent modules concurrently | Design approval plus normal cook gates; ownership must be disjoint |

Read [mode routing](references/mode-routing.md) after selecting exactly one
mode. Read [stack and planning](references/stack-and-planning.md) when stack
choice or planning begins. After a plan exists, read
[delivery gates](references/delivery-gates.md).

## Workflow

1. **Lock the opening contract.** Do not substitute a guessed stack or generic
   “build an app” brief.
2. **Initialize Git if needed.** In full mode, ask first. Other explicitly
   selected modes may initialize a `main` branch through the git agent. Never
   overwrite an existing repository.
3. **Resolve stack and design.** Follow the selected mode's research and user
   gates; write only durable, approved decisions to the repository's discovered
   documentation surface.
4. **Plan.** Pass requirements plus outcome, constraints, non-goals, and
   acceptance criteria to `vc:plan`, preserving mode intent.
5. **Approve as required.** Full mode requires explicit plan approval. Fast and
   parallel retain downstream cook gates. Auto proceeds only because the user
   explicitly opted into it.
6. **Implement through `vc:cook`.** Pass the plan path and mode; do not write
   application code directly from bootstrap.
7. **Close the delivery.** Test, review, docs-impact check, onboarding, final
   report, and optional Git actions follow the delivery reference.

## Safety boundaries

- Parallel work starts only after dependencies and exclusive file ownership are
  recorded; pass the opening contract to every independent planning branch.
- Never weaken, skip, fake, or ignore failed tests to pass build/CI.
- Design generation is optional and capability-dependent. Do not promise
  agents or asset tools that are not installed.
- Docs are impact-driven: discover instructions and navigation, then update the
  smallest justified owning surface.
- Commit and push are separate user decisions. Explicit auto mode does not
  authorize either one.

## Output format

```markdown
Contract: <outcome; constraints; non-goals; acceptance criteria>
Mode: <full|auto|fast|parallel>
Stack/design: <approved decisions and document paths>
Plan: <path>
Implementation: <vc:cook result and proof layers run>
Onboarding: <first commands/config steps>
Git: <not requested|commit offered|committed|pushed>
Unresolved: <items or "none">
```

Proof/risk: bootstrap delegates behavioral proof to `vc:cook` and `vc:test`.
Its own proof is contract traceability, explicit gate history, a real plan path,
and fresh command output from the delivered project.

## Quality gates

Before finishing, confirm:

1. The opening contract exists and was preserved through planning and cooking.
2. The stack was chosen from requirements/evidence, not silently assumed.
3. A plan existed before implementation and every required approval occurred.
4. Parallel branches, if any, had explicit dependencies and file ownership.
5. Real tests, typecheck/build, and review results are reported without hiding
   failures.
6. Documentation changed only where durable user or maintainer behavior changed.
7. Onboarding explains how to run the project without exposing secrets.
8. No commit or push occurred without the corresponding user authorization.

## Workflow position

**Typically follows:** `vc:brainstorm` when the product idea needed exploration,
or starts directly from an already concrete blank-slate brief.

**Typically precedes:** `vc:plan` → `vc:cook` → `vc:test`/`vc:code-review`, then
`vc:docs`, `vc:journal`, and optional `vc:git`.

**Related:** use `vc:cook` directly when a repository and stack already exist.
