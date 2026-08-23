---
phase: 9
title: "Agent lint and close-out"
status: todo
priority: P2
effort: "3-5d"
dependencies: [8]
---

# Phase 9: Agent lint and close-out

## Overview

Remove the agent-side exemption, then delete the ratchet machinery so no
exemption path survives anywhere.

The draft scoped this at 1-2 days for "two things". It gates **five**, and the
union of failing agents is **all 16**. Re-costed.

## Requirements

**Functional**
- `agent-lint.ts`'s ported branch is gone; all 16 agents meet the bar.
- `explore.md` declares `name: explore`, every reference updated atomically.
- `kit/skills-lint-exempt.json`, `isExempt()`, and every `origin: ported`
  severity path deleted.

**Non-functional**
- The agent rename lands in one commit. A partial rename breaks invocation.

## Architecture

### The exemption gates five rules, not two

`agent-lint.ts:46` computes `ported = !fileStem.startsWith("av-")`. All 16 agents
are ports, so all 16 are exempt from:

| Rule | Line | Agents failing |
|---|---|---|
| name casing (case-insensitive match allowed) | `:53` | **1** (`explore`) |
| `DESCRIPTION_MAX` 1200 | `:62` | **9** |
| `<example>`/`<commentary>` pair required | `:65` | **7** |
| `AGENT_MAX_LINES` 120 | `:81` | **9** |
| `Behavioral Checklist` heading required | `:85` | **8** |

ADR 0008:29 independently records "8 no `Behavioral Checklist`, 9 exceed the line
budget" — the numbers were already known and the draft carried forward only one
of them.

**Union: all 16 agents need work.** Worst: `ui-ux-designer` (248 lines, no
checklist, description 1987), `journal-writer` (150 lines, no example,
description 2437), `researcher` (description 2063).

### Agents have no `references/` escape hatch

`loadFlat(kitRoot, "agents", "agent")` (`load-kit.ts:104-110`) reads only
top-level `.md`, and `agentPath` resolves to a single file per agent
(`resolver.ts:64`). Unlike skills, an over-long agent cannot extract content —
it must be **cut**. `ui-ux-designer` must lose ~128 lines. That is Tier-B-grade
content work across 9 files, on top of 9 description rewrites and 7 authored
example pairs.

### The rename and its ripple

`agent-lint.ts:48-51` states the hazard: the provider addresses the agent by its
declared `name`, so changing either side changes invocation. Decision: normalize
to `name: explore`.

Measured ripple — all in one commit:

| Location | Count |
|---|---|
| `Task(Explore)` in agent frontmatter `tools:` | 9 files, 10 occurrences (`kongming.md` has 2) |
| prose in `kit/skills/scout/` | `SKILL.md:53,56`, `references/internal-scouting.md:29,39` |
| prose in `kit/skills/fix/references/workflow-standard.md:33` | 1 |

Affected agents: `advisor`, `code-simplifier`, `debugger`, `docs-manager`,
`fullstack-developer`, `kongming`, `planner`, `tester`, `ui-ux-designer`.

The runtime also exposes a built-in `Explore`. Verify after the rename that
`av:scout`'s delegation reaches the intended agent — by invoking it.

### The rename is superseded, not deferred (2026-08-23)

Steps 1-4 and 6 shipped as PR #43: 15 of 16 agents now meet the bar. **Step 5
was not performed, and should not be.** Both paths this file pre-decided are
unsafe, and a third path already exists.

**Why the lowercase rename is wrong.** The `Task(Explore)` count was exactly as
predicted — 9 files, 10 occurrences — but the prose ripple is ~40 references,
not 5, and they are not the same symbol. Three are `subagent_type: "Explore"`
(this kit's agent). Eight are `agent_type: "Explore"` for Codex's
`multi_agent_v1` — a runtime role this repository does not own. A blanket
lowercase rename breaks Codex delegation.

**Why the pre-decided fallback is worse.** Renaming the file to `Explore.md` to
match `name: Explore` collides with the heal path. `claimed()`
(`install-heal.ts:87-97`) keys a Map by resolved absolute path, compared as an
exact string with no case folding, and `executeHeal` runs *after* the writes. On
a case-insensitive filesystem the old spelling sits in `before`, goes unmatched
in `after`, and removal is planned for the same inode the installer just wrote.
The hash guard (`install-heal.ts:181-184`) forks the outcome on content: a pure
case rename is **deleted**, while a rename-plus-rewrite survives with a spurious
"modified since install" warning and a receipt whose spelling disagrees with
disk. Both are wrong.

**The path taken instead.** `agent-lint.ts:49-53` accepts a case-insensitive
name match for ported agents only, with `explore.md`/`name: Explore` named in
the comment. Zero runtime ripple; Codex's `agent_type` and this kit's
`subagent_type` are both untouched. The name rule only ever bit because of the
ported branch, so this closes it at the source.

**Consequence for step 7.** `ported` now gates two unrelated things: the house
rules (examples, checklist, length, description cap) and this case exception.
Deleting the branch wholesale re-breaks `explore` and walks straight back into
the rename trap. Delete the house-rule exemptions; **keep the case exception**,
with the comment explaining why it is not dead code.

**A latent defect this uncovered, out of scope here.** Any future case-only
rename of any artifact hits the same heal deletion, not just `explore`. The fix
is independent of filesystem: before unlinking, if the removal path case-folds
equal to a path the next receipt claims, compare `st_dev`/`st_ino` and preserve
on a match. Backlog item, not part of this plan.

### Close-out

Once the ratchet is empty and agents are clean, delete
`kit/skills-lint-exempt.json`, `isExempt()` and both call sites, and the ported
branch in `agent-lint.ts`. Leaving the mechanism behind is how the next
exemption gets added quietly.

## Related Code Files

- Modify: 9 × `kit/agents/*.md` (trim to ≤120 lines)
- Modify: 9 × `kit/agents/*.md` (descriptions ≤1200)
- Modify: 7 × `kit/agents/*.md` (author `<example>`/`<commentary>` pairs)
- Modify: 8 × `kit/agents/*.md` (add `Behavioral Checklist`)
- Modify: `kit/agents/explore.md` + 9 agents' `Task(Explore)` grants
- Modify: `kit/skills/scout/SKILL.md`, `kit/skills/scout/references/internal-scouting.md`,
  `kit/skills/fix/references/workflow-standard.md`
- Modify: `packages/cli/src/kit/agent-lint.ts`, `skill-lint.ts`, `cli/validate-command.ts`
- Delete: `kit/skills-lint-exempt.json`
- Modify: `docs/decisions/0013-*.md`

## Implementation Steps

1. Descriptions: trim the 9 over-cap. Independent of everything else, do first.
2. Author the 7 missing `<example>`/`<commentary>` pairs. Real examples drawn
   from how the agent is actually used, not invented scenarios.
3. Add the 8 missing `Behavioral Checklist` sections.
4. Trim the 9 over-length agents to ≤120 lines. Content is **deleted**, not
   moved — decide what genuinely earns its place.
5. Rename in one commit: `explore.md`'s `name`, all 10 `Task(Explore)` grants,
   all 5 prose references.
6. Invoke `av:scout`'s delegation and confirm it reaches the intended agent.
   A grep is not proof.
7. Delete the ported branch in `agent-lint.ts`; run `av validate`. **Done**
   (PR #50): the branch is gone, `explore.md` keeps `name: Explore` through a
   one-file exception in the rule, and `av validate` loads all 16 agents
   with every rule enforced. The heal case-collision the review found on
   the way is filed in phase 4's risk list, not here.
8. Confirm the ratchet is empty, then delete it, `isExempt()`, and both call sites.
9. Full gate: `pnpm test`, `av validate`, `--strict`, `--check`.
10. Update ADR 0013; journal; close the plan.

## Success Criteria

- [x] All 16 agents pass `agent-lint` with no exemption branch in the source (PR #50).
- [x] No agent exceeds 120 lines or a 1200-char description (PR #43, enforced by #50).
- [x] Every agent has a `Behavioral Checklist` and an `<example>` pair (PR #43, enforced by #50).
- [x] ~~`grep -rn 'Task(Explore)' kit/` returns nothing.~~ **Withdrawn** — see
      "The rename is superseded, not deferred" below. The grant name is correct
      as it stands.
- [x] ~~`explore` is invocable after the rename — verified by invoking it.~~
      **Withdrawn** with the rename.
- [ ] `kit/skills-lint-exempt.json` deleted; `isExempt()`/`isPorted()` absent.
- [ ] `av validate`, `--strict`, `--check` all clean.
- [ ] `pnpm test` green.

## Risk Assessment

**A partial rename.** Nine files grant `Task(Explore)`; missing one leaves an
agent unable to delegate, silently, until that path runs. *Signal:* the grep in
Success Criterion 4 returns anything. *Response:* step 6 requires a real invocation.

**Name collision with the runtime's built-in `Explore`.** *Signal:* step 6's
invocation reaches the wrong agent or none. *Pre-decided response:* revert to
`Explore.md` matching `name: Explore` — the alternative offered when this was
decided — rather than forcing lowercase.

**Cutting 128 lines from `ui-ux-designer` degrades it.** Deletion is lossy in a
way extraction is not. *Signal:* the trim removes guidance rather than
redundancy. *Response:* if an agent genuinely needs more than 120 lines, that is
an argument to revisit `AGENT_MAX_LINES` with evidence — recorded in ADR 0013 —
not to silently exempt the agent.

**Closing with a non-empty ratchet.** *Response:* the plan does not close; it
replans around what remains. Deleting the file early reintroduces the
crash-at-module-load failure phase 2 exists to avoid.
