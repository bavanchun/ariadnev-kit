---
name: vc:skill-creator
description: Create or update vc kit skills following the authoring spec and lint gate. Use when adding a new skill, editing an existing one, or checking a skill before it ships.
user-invocable: true
argument-hint: "<skill name or description>"
metadata:
  author: vchun
  version: "1.0.0"
---

# Skill Creator

Meta-skill for authoring `kit/skills/`. Unlike a style guide alone, every
rule here is enforced by a machine gate (`packages/cli/src/kit/skill-lint.ts`,
run inside `loadKit` on every `pnpm test` and every `vcskill install`) — a
skill that violates the spec fails the build, not just a review.

Handles: new skill creation, existing skill edits, pre-ship validation.
Does not handle: agent authoring (frontmatter/format differs — see
`docs/vc-skill-authoring-spec.md`'s Agent authoring section).

## Workflow

1. **Capture intent** — one sentence: what the skill does, when it should
   trigger. If unclear, ask before writing anything.
2. **Scaffold** — `vcskill add-skill <name> --description "..."` creates
   `kit/skills/<name>/SKILL.md` with `name: vc:<name>` already correct.
3. **Write** — follow `docs/vc-skill-authoring-spec.md`: three-tier
   disclosure (SKILL.md = common path, `references/*.md` = edge cases,
   `scripts/` = executables), frontmatter contract, description with a
   trigger verb, ≤300 lines (≤400 with `metadata.maxLines` override).
4. **Check for reuse** — before writing a new reference file, grep existing
   skills for the same concern; link instead of duplicating.
5. **Gate** — run `pnpm test` (runs the lint gate against the real kit) and
   `vcskill install --dry-run` to confirm it lands where expected.

## When porting a skill from another kit

If distilling a skill from ClaudeKit or another source, do not copy prose
verbatim (license risk, and it won't match this kit's voice). Instead:
extract the *capability list* (what it actually does), then write the
parity table — capability → kept/dropped-with-reason → at least one
concrete improvement — before writing the skill body. This is the same
discipline applied across the vc agent/skill roster; see any
`plans/reports/parity-*.md` for the format.

## Checklist before shipping

- [ ] `name: vc:<dir-slug>` matches the directory
- [ ] Description 20–200 chars, states what + when, has a trigger verb
- [ ] SKILL.md ≤300 lines; every reference ≤300 lines
- [ ] No heading duplicated between SKILL.md and its references
- [ ] `pnpm test` green (lint gate passes on the real kit)
- [ ] `vcskill install --dry-run` shows it landing correctly
