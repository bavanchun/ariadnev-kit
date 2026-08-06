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
- Every `vc:<slug>` named in SKILL.md or `references/*.md` must resolve to a
  skill in the same kit; `vcskill validate` checks this after loading the full
  inventory.
- Write in English; imperative voice addressed to the agent.
- No provider-specific absolute paths — use `.claude/...`-relative canonical
  paths; the adapt engine rewrites them per provider.

## Cook-grade skill standard

Every skill in `kit/skills/` must clear this seven-point bar. `vc:cook` is the
reference implementation; measure new and rewritten skills against it. The lint
gate enforces frontmatter, size, and the exact `## Output format`,
`## Quality gates`, and `## Workflow position` headings. Workflow depth and
proof/risk quality remain authoring contracts reviewers check by reading.

1. **Trigger-precise frontmatter.** `description` states *what it does* + *when
   to fire* (see "Writing the description"). A reader deciding whether to invoke
   the skill can tell from the description alone.
2. **Real workflow, not advice.** Numbered steps with branch conditions the
   agent actually follows — not a list of virtues ("be thorough", "consider
   edge cases"). If a step has a decision, name the options and how to pick.
3. **`## Output format`.** A concrete, verifiable contract for what the skill
   returns (sections, table columns, a verdict enum). "Produces a report" is not
   a contract; the exact shape is.
4. **`## Quality gates`.** 3-6 self-checks the agent runs *before* returning —
   the skill's own definition of done (e.g. "every finding cites file:line",
   "recommendation names its trade-off"). This is what makes output trustworthy
   without a human re-checking it.
5. **Proof / risk wiring when relevant.** A skill that changes code or asserts
   correctness states which proof layer (`unit`/`integration`/`e2e`/`platform`,
   see `cook/references/risk-lanes.md`) its output belongs to, and classifies
   work by risk lane where that gates behavior. Analysis-only skills write
   `Proof/risk: N/A — <reason>` so the omission is deliberate, not forgotten.
6. **Tight body, references for depth.** SKILL.md carries the common-case
   workflow; a section covering an independent sub-topic (a technique catalogue,
   a format spec, an edge-case playbook) moves to `references/` linked with a
   "read when …" trigger. Aim ≤120 lines; hard ceiling stays 300.
7. **`## Workflow position`.** Name the skills this one typically follows,
   precedes, and relates to, so the kit reads as one graph, not 21 islands.

## Agent authoring

Agents live in `kit/agents/vc-<slug>.md`; enforced by
`packages/cli/src/kit/agent-lint.ts` inside `loadKit`.

| Field | Required | Rule |
|---|---|---|
| `name` | yes | exactly the file stem (`vc-<slug>.md` → `name: vc-<slug>`) |
| `description` | yes | 50–1200 chars, must contain ≥1 `<example>...</example><commentary>...</commentary>` pair so the model auto-delegates correctly |
| `tools` | no | comma-separated string or array of tool names |
| `model` | no | one of `opus`, `sonnet`, `haiku` — tier by task weight (opus: planning/brainstorming; sonnet: review/debug/implement; haiku: mechanical/read-heavy work) |
| `memory` | no | claude-code only |

Body ≤ 120 lines, must contain a `## Behavioral Checklist` heading (5-8
concrete pre-submission checks). Shape: persona (1 sentence) → Behavioral
Checklist → workflow → output template → status protocol. Point to the
matching `vc:<skill>` for workflow detail — don't duplicate it in the agent.

`model` and `memory` only mean something to claude-code. The codex adapter
(`adapt/agent-to-toml.ts`) drops both fields when converting to `.toml` —
that's intentional (codex has no per-agent model tiering), not a bug.

## Checklist before adding a skill

- [ ] Slug is kebab-case; `name: vc:<slug>` matches the directory
- [ ] Description is 20–200 chars, states what + when, contains a trigger verb
- [ ] SKILL.md ≤ 300 lines; every reference ≤ 300 lines
- [ ] Each `references/*.md` is linked from SKILL.md with a "read when …" condition
- [ ] No heading duplicated between SKILL.md and references
- [ ] Exact `## Output format`, `## Quality gates`, and `## Workflow position` headings are present
- [ ] Every `vc:<slug>` reference resolves to an existing kit skill
- [ ] No secrets, tokens, or machine-specific absolute paths
- [ ] `pnpm test` green (the lint gate runs in `kit-fixtures.test.ts`)
- [ ] `vcskill install --dry-run` shows the skill landing where expected
