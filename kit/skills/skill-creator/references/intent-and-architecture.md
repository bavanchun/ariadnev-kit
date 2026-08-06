# Intent and Architecture

Use this reference before scaffolding or restructuring a skill.

## Decide whether a skill is the right artifact

A skill is a versioned package of practical instructions plus only the scripts,
references, and assets needed for a repeatable workflow. It separates reusable
workflow guidance from always-loaded context.

Create or extend a skill when the gap is a stable process, specialized context,
or tool-orchestration pattern that recurs. Do not create one for:

- general model knowledge;
- a single user's preference;
- a one-time task;
- a workflow with no stable scope or output;
- a concern already owned by an existing skill.

Default to the current project scope. Work in another project or user scope only
when explicitly requested and after reading that target's conventions.

## Capture intent

Answer with real examples:

1. What tasks should this skill handle?
2. What tasks must it not handle?
3. What phrases should trigger this skill?
4. Which similar phrases should not trigger it?
5. What exact output should it produce?
6. Which objective behaviors deserve test cases?
7. Which safety, compatibility, cost, or authority constraints apply?

The resulting scope declaration must say “handles X” and “does not handle Y.”
If any answer would materially change architecture, ask before writing.

## Reuse, merge, or create

Search the live skill catalog and repository for the same trigger, workflow,
scripts, references, and output contract.

- **Reuse:** an existing skill already owns the behavior.
- **Extend:** same trigger and outcome, missing one coherent branch.
- **Merge:** related topics share users, workflow, and output strongly enough
  that separate activation would duplicate instructions.
- **Create:** trigger, workflow, and output have a distinct stable boundary.
- **Decline:** one-off or general knowledge has no durable skill value.

Combine genuinely overlapping topics into one skill; do not merge merely because
technologies are adjacent.

## Choose the shape

For every real usage example, determine how execution works from scratch. Prefer
existing project CLI tools and helpers over custom code. Identify reusable parts:

| Repeated need | Artifact |
|---|---|
| Common decision path and required gates | `SKILL.md` |
| Conditional detail, schemas, long playbooks | `references/*.md` |
| Deterministic repeated transformation | `scripts/*` plus tests |
| Output boilerplate, templates, media | `assets/*` |

Select the dominant workflow pattern:

- **Sequential orchestration:** steps must occur in order; validate each stage
  and define rollback on failure.
- **Iterative refinement:** draft → deterministic check → refine, with a stop rule.
- **Context-aware selection:** decision tree chooses tools from inputs and exposes why.
- **Domain intelligence:** specialized rules, governance, and audit evidence.
- **Multi-tool coordination:** explicit data handoff and centralized error handling.

## Progressive disclosure

1. **Metadata:** concise activation contract, always visible.
2. **SKILL.md:** common workflow when activated; aim around 100–150 lines and
   obey the repository's hard limit.
3. **Bundled resources:** direct references loaded only for a branch, scripts
   executed for deterministic work, assets consumed by output.

Information lives in one place. Link to detail instead of copying it into the
router; split resources by decision boundary, not arbitrary source order.
