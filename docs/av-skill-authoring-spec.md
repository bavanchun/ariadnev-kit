# av Skill Authoring Spec

Rules for a skill **this project writes**. Enforced by the lint gate in
`packages/cli/src/kit/skill-lint.ts`, which runs inside `loadKit` — so
`pnpm test`, CI, and every `ariadnev install` reject a non-conforming skill.

## Two kinds of skill

Most of `kit/skills/` is **ported**: copied from the kit this one was built from
and left as it was apart from identifiers. A ported skill carries
`metadata.origin: ported`.

The house rules on this page — the three required sections, the description
length, the trigger verb, the size budgets — apply to skills we author. They
cannot apply to a copy without rewriting it, which is the one thing a port must
not do. What still applies to *everything* is validity: frontmatter shape, no
unknown fields, a `name` matching the directory, a description long enough to
route on. Size over budget is reported as a warning for a ported skill, because
the context cost is real even when it is not ours to fix.

See [ADR 0008](decisions/0008-porting-upstream-content.md) for why, with the
numbers that forced the split.

## Anatomy

```
kit/skills/<slug>/
  SKILL.md              # required — frontmatter + tier-1 content
  references/*.md       # optional — tier-2/3 detail, loaded on demand
  scripts/*             # optional — runnable helpers
  <sub-skill>/SKILL.md  # optional — a nested skill with its own frontmatter
  *.json, assets, fonts # optional — data files, copied byte for byte
```

Naming: `<slug>` is kebab-case; frontmatter `name` must equal `av:<slug>`.

Binary files (fonts, images, archives) are copied as bytes at every hop — kit,
embedded build, and provider tree — and never text-transformed. A nested
sub-skill is an ordinary skill directory inside another; `document-skills` ships
four.

Python declares what it needs in a `requirements.txt` beside it — usually
`scripts/requirements.txt`, but wherever the skill keeps its Python — even when
the answer is "nothing outside the standard library". `ariadnev skill verify`
treats silence and "needs nothing" as different answers. A `requirements.txt`
inside a `tests/` directory declares what the test suite needs, not what the
scripts need, and is ignored for this purpose.

A skill that names real packages also needs a pinned lock, `ariadnev-lock.json`,
committed beside that declaration. A maintainer generates it once:

```
bun packages/cli/scripts/generate-skill-lock.ts <skill>
```

The resolution is universal — one lock covering every platform and interpreter,
with PEP 508 markers carried through — so the same file installs on macOS,
Linux and Windows. `ariadnev skill install` only replays it, and refuses to
resolve anything on its own; see
[0010](decisions/0010-skill-environments-are-locked-and-universal.md).

## Frontmatter contract

| Field | Required | Rule |
|---|---|---|
| `name` | yes | exactly `av:<dir-slug>` |
| `description` | yes | 20–200 chars, must contain a trigger verb (`use`/`invoke`/`run`/`activate`/`trigger`) |
| `argument-hint` | no | short usage hint shown by the harness |
| `user-invocable` | no | boolean; expose as `/av:<slug>` slash command |
| `disable-model-invocation` | no | boolean; slash-only skills |
| `allowed-tools` | no | list of tool names the skill needs |
| `metadata` | yes | provenance fields below, plus optional authoring data (`author`, `version`, `maxLines`, …) |
| `version`, `license` | no | strings |

Any other top-level field is an **error**. Put extra data under `metadata`.

### Claims ledger (retired)

The kit once carried a claims ledger and a `coverage` command that measured how
much of a source skill survived compression into its kit counterpart. Skills are
now carried in full rather than compressed, so a compression measure has nothing
left to measure, and the whole system — ledger, checker, and command — was
removed.

The historical record is kept at `docs/decisions-ledger-historical.json` for
reference: it documents why individual claims were once dropped or routed
elsewhere. It gates nothing. `packages/cli/scripts/wave-rollup.mjs` still reads
it if you want the rollup.

Install-time integrity is covered instead by the install receipt and its
per-file hashes.

### Writing the description

The description is the trigger — it is the only part the model sees before
deciding to load the skill. Formula: *what it does* + *when to fire*.

- Good: `Plan implementations with phased roadmaps. Use for feature planning, architecture decisions, or multi-step work.`
- Bad: `A collection of planning conventions.` (no trigger, model never fires it)

## Size limits (three-tier progressive disclosure)

| File | Limit |
|---|---|
| `SKILL.md` | ≤ 300 lines (override: `metadata.maxLines`, hard ceiling 400) |
| each `references/*.md` | ≤ 800 lines |

An error, unless the skill is named in `kit/skills-lint-exempt.json` — then it
is a held finding, counted in `av validate`'s output but not failing the build.
That list is a shrinking backlog, not a category: see
[ADR 0013](./decisions/0013-lint-exemption-is-a-shrinking-list.md). Provenance
(`metadata.origin: ported`) no longer affects severity.

The reference limit is 800 rather than 300 because 83 of the 463 reference files
in the kit exceed 300 and 6 exceed 800. A limit most of the corpus-by-weight
breaks does not bind anything.

Tier model — spend context only when needed:

1. **Tier 1 — `SKILL.md`**: a ~100–150-line router for the common workflow,
   decision tables, hard boundaries, output, gates, and workflow position.
2. **Tier 2 — `references/*.md`**: deep detail for specific branches
   (edge-case playbooks, long checklists, format specs). SKILL.md links directly
   to every reference with a *when to read* condition; do not nest reference chains.
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
- Every `av:<slug>` named in SKILL.md or `references/*.md` must resolve to a
  skill in the same kit; `ariadnev validate` checks this after loading the full
  inventory.
- Write in English; imperative voice addressed to the agent.
- No provider-specific absolute paths — use `.claude/...`-relative canonical
  paths; the adapt engine rewrites them per provider.

## Cook-grade skill standard

Every skill **this project writes** must clear this seven-point bar; a ported
skill is judged by its upstream's standards, not this one. `av:cook` is the
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
   correctness states which proof layer its output belongs to —
   `unit`/`integration`/`e2e`/`platform` — and says how far up that ladder the
   change's risk requires it to go. Analysis-only skills write
   `Proof/risk: N/A — <reason>` so the omission is deliberate, not forgotten.
6. **Tight body, references for depth.** SKILL.md carries the common-case
   workflow; a section covering an independent sub-topic (a technique catalogue,
   a format spec, an edge-case playbook) moves to `references/` linked with a
   "read when …" trigger. Aim ~100–150 lines; hard ceiling stays 300.
7. **`## Workflow position`.** Name the skills this one typically follows,
   precedes, and relates to, so the kit reads as one graph, not 21 islands.
   Enforced: the section must name at least one `av:<slug>`, or declare `none`
   as its whole answer (`Related: none.`, `**Typically precedes:** none`). A
   heading with prose under it and no skill named fails the build — a present
   section proves nothing, which is the whole reason the rule exists. "None" is
   a real answer for a standalone skill; inventing a relationship to satisfy the
   check is worse than declaring there is none.

## Agent authoring

Agents live in `kit/agents/`; enforced by
`packages/cli/src/kit/agent-lint.ts` inside `loadKit`.

Every agent in `kit/agents/` is held to the same rules, ported or not. The
lint once exempted agents whose filename lacked an `av-` prefix; no agent file
carried it, so the exemption covered all sixteen and the gate certified
nothing. All sixteen now meet the rules and the exemption is gone.

| Field | Required | Rule |
|---|---|---|
| `name` | yes | the file stem (`<slug>.md` → `name: <slug>`). One exception: `explore.md` declares `name: Explore`, because Claude Code ships a built-in `Explore` subagent type and the `Task(Explore)` grants in other agents address both by that spelling |
| `description` | yes | 50-1200 chars, containing ≥1 `<example>...</example><commentary>...</commentary>` pair so the model auto-delegates correctly |
| `tools` | no | comma-separated string or array of tool names |
| `model` | no | one of `opus`, `sonnet`, `haiku`, `fable`, or `inherit` — tier by task weight (fable: hardest calls; opus: planning/brainstorming; sonnet: review/debug/implement; haiku: mechanical/read-heavy work; `inherit`: run on whatever the caller runs on) |
| `memory` | no | claude-code only |

Body ≤ 120 lines, must contain a `## Behavioral Checklist` heading (5-8
concrete pre-submission checks). Shape: persona (1 sentence) → Behavioral
Checklist → workflow → output template → status protocol. Point to the
matching `av:<skill>` for workflow detail — don't duplicate it in the agent.

`model` and `memory` only mean something to claude-code. The codex adapter
(`adapt/agent-to-toml.ts`) drops both fields when converting to `.toml` —
that's intentional (codex has no per-agent model tiering), not a bug.

## Checklist before adding a skill

- [ ] Slug is kebab-case; `name: av:<slug>` matches the directory
- [ ] Description is 20–200 chars, states what + when, contains a trigger verb
- [ ] SKILL.md ≤ 300 lines; every reference ≤ 800 lines
- [ ] Each `references/*.md` is linked from SKILL.md with a "read when …" condition
- [ ] No heading duplicated between SKILL.md and references
- [ ] Exact `## Output format`, `## Quality gates`, and `## Workflow position` headings are present
- [ ] `## Workflow position` names an `av:<slug>` or declares `none` as its whole answer
- [ ] Every `av:<slug>` reference resolves to an existing kit skill
- [ ] All four provenance fields are strings and match the pinned source; original skills use the all-`"none"` sentinel
- [ ] Claim-tracked skills classify every claim and pass strict `ariadnev coverage --skill <name>`
- [ ] No secrets, tokens, or machine-specific absolute paths
- [ ] `pnpm test` green (the lint gate runs in `kit-fixtures.test.ts`)
- [ ] `ariadnev install --dry-run` shows the skill landing where expected
