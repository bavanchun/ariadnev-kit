# Writing and Metadata

Use this reference while writing frontmatter and the common-path router. The
repository authoring spec and lint implementation are authoritative if they
change; do not import another ecosystem's schema by memory.

## Frontmatter contract

- Folder slug: descriptive kebab-case.
- `name`: exactly `vc:<folder-slug>`; namespace and skill id are lowercase
  kebab-case, and the folder matches the id segment after `:`.
- `description`: 20–200 characters, what the skill does plus when to activate;
  include a real trigger verb such as `Use for ...` and phrases users say.
- `metadata`: author/version plus all four string-valued upstream provenance fields.
- Optional invocation/tool fields must be supported by the current lint allowlist.

Do not force third-person boilerplate. Prefer a compact action statement followed
by specific trigger contexts, for example:

```yaml
description: Process tabular data and validate transformations. Use for CSV imports, dataset cleanup, or schema-safe exports.
```

Ask “what phrases would a user say that should trigger this skill?” Then remove
generic terms that activate unrelated work.

## Router body

Write practical instructions in imperative/infinitive form: “Run X, then verify
Y.” Avoid “you should,” “if you need,” vague virtues, or tool documentation.

The body must provide:

1. purpose and a handles/does-not-handle scope;
2. opening outcome/constraints/non-goals when the workflow changes state;
3. numbered common-path steps and branch rules;
4. direct read-when links to every bundled reference;
5. a concrete `## Output format` contract;
6. three to six enforceable `## Quality gates`;
7. proof/risk boundaries when correctness is asserted;
8. `## Workflow position` with valid vc skill relationships.

Use explicit standard terminology and concrete commands only when they match
real product contracts. If the model skips a critical validation in observed
tests, make the ordering explicit (“Do not skip validation steps”) or encode the
check in a deterministic script.

## Resource discipline

- Keep SKILL.md focused on the common path; move independent edge-case detail,
  extended examples, schemas, and troubleshooting into references.
- Keep each heading in one file. Do not duplicate information between SKILL.md
  and references.
- Link every reference directly from SKILL.md with the condition for reading it.
  Do not create nested reference chains.
- Use descriptive kebab-case file names and delete every placeholder/example not
  required by the final workflow.
- Include scripts only for deterministic repeated work and assets only when the
  output consumes them.

## Trigger precision

Descriptions define activation; the body defines execution. Keep both aligned:

- state actions/file types/domains that should trigger;
- state close neighbors that should not trigger when ambiguity is likely;
- avoid broad words such as “help,” “projects,” or “documents” alone;
- preserve a public description during an update unless changed intentionally
  and covered by positive/negative trigger tests.
