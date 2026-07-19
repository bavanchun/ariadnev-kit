# vc Skill Authoring Spec

Rules for every skill in `kit/skills/`. Enforced automatically by the lint gate
in `packages/cli/src/kit/skill-lint.ts`, which runs inside `loadKit` — so
`pnpm test`, CI, and every `vcskill install` all reject a non-conforming skill.

## Anatomy

```
kit/skills/<slug>/
  SKILL.md              # required — frontmatter + tier-1 content
  references/*.md       # optional — tier-2/3 detail, loaded on demand
  scripts/*             # optional — runnable helpers
  *.json, assets        # optional — data files the skill reads
```

Naming: `<slug>` is kebab-case; frontmatter `name` must equal `vc:<slug>`.

## Frontmatter contract

| Field | Required | Rule |
|---|---|---|
| `name` | yes | exactly `vc:<dir-slug>` |
| `description` | yes | 20–200 chars, must contain a trigger verb (`use`/`invoke`/`run`/`activate`/`trigger`) |
| `argument-hint` | no | short usage hint shown by the harness |
| `user-invocable` | no | boolean; expose as `/vc:<slug>` slash command |
| `disable-model-invocation` | no | boolean; slash-only skills |
| `allowed-tools` | no | list of tool names the skill needs |
| `metadata` | no | free-form object (`author`, `version`, `maxLines`, …) |
| `version`, `license` | no | strings |

Any other top-level field is an **error**. Put extra data under `metadata`.

### Writing the description

The description is the trigger — it is the only part the model sees before
deciding to load the skill. Formula: *what it does* + *when to fire*.

- Good: `Plan implementations with phased roadmaps. Use for feature planning, architecture decisions, or multi-step work.`
- Bad: `A collection of planning conventions.` (no trigger, model never fires it)

## Size limits (three-tier progressive disclosure)

| File | Limit |
|---|---|
| `SKILL.md` | ≤ 300 lines (override: `metadata.maxLines`, hard ceiling 400) |
| each `references/*.md` | ≤ 300 lines |

Tier model — spend context only when needed:

1. **Tier 1 — `SKILL.md`**: the workflow itself. Decision tables, steps,
   anti-rationalization rules. Everything needed for the *common* case.
2. **Tier 2 — `references/*.md`**: deep detail for specific branches
   (edge-case playbooks, long checklists, format specs). SKILL.md links to them
   by relative path and states *when* to read each one.
3. **Tier 3 — `scripts/`, data files**: executable/parsable artifacts the
   skill invokes; never inlined into markdown.

If SKILL.md wants to exceed 300 lines, move a section to `references/` instead
of raising `maxLines`. The override exists for genuinely dense workflow skills
(e.g. embedded test/review protocols), not as a default escape hatch.

## No-duplication rule

Content lives in exactly one place. The gate warns (does not yet fail) when the
same heading text appears in both `SKILL.md` and a reference file — that is the
usual smell of copy-pasted sections drifting apart. Resolve by keeping the
section in one file and linking from the other.

## Body conventions

- Start with one paragraph: what the skill does and does not handle.
- Prefer tables and numbered steps over prose.
- Link references with a trigger condition: `For merge conflicts, read references/workflow-merge.md`.
- Write in English; imperative voice addressed to the agent.
- No provider-specific absolute paths — use `.claude/...`-relative canonical
  paths; the adapt engine rewrites them per provider.

## Checklist before adding a skill

- [ ] Slug is kebab-case; `name: vc:<slug>` matches the directory
- [ ] Description is 20–200 chars, states what + when, contains a trigger verb
- [ ] SKILL.md ≤ 300 lines; every reference ≤ 300 lines
- [ ] Each `references/*.md` is linked from SKILL.md with a "read when …" condition
- [ ] No heading duplicated between SKILL.md and references
- [ ] No secrets, tokens, or machine-specific absolute paths
- [ ] `pnpm test` green (the lint gate runs in `kit-fixtures.test.ts`)
- [ ] `vcskill install --dry-run` shows the skill landing where expected
