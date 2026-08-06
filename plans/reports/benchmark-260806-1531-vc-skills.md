# Benchmark Report — all 26 vc skills

Date: 2026-08-06 · Commit: `d105bb2f9945a18373f36a995fcd4741bc2bbab5` · Branch: `main`
CLI: vcskill 0.9.0 · Node v26.0.0 · pnpm 11.0.9

## Proof boundary

This scorecard records evidence the repository can produce today. It is not a
behavioral-parity benchmark.

- **Tier 1** is static `vcskill validate` scoped to one skill. It proves
  frontmatter, required sections, links, cross-skill references, provenance,
  claim coverage, and shared routing-collision contracts only.
- **Tier 3** is an optional prose judge over clarity, specificity, and
  completeness. `VCSKILL_EVAL_CMD` was not configured, so every row says
  `not run`; no score was inferred. Even when configured, tier 3 does not
  execute golden tasks.
- **Claim coverage** is an offline omission ratchet for eight pinned
  distillations. It proves classified claims retain keyword anchors or an
  explicit rejection reason; it does not prove semantic fidelity or outcomes.
- **LOC and reference counts** describe disclosure shape and token placement.
  They are not quality scores and are not used to rank skills.

## Method and reproducibility

The embedded kit was regenerated and the CLI rebuilt from the final Phase-5
tree before measurement. The environment check printed only whether the judge
command existed; it did not print a command value.

Commands:

```bash
pnpm --filter vcskill generate:embedded
pnpm build
VCSKILL_RUN=1 node packages/cli/dist/index.js eval --skill <name>
VCSKILL_RUN=1 node packages/cli/dist/index.js coverage --skill <claim-tracked-name>
```

`eval --skill` was invoked as a separate process once for each canonical name:

```text
ask bootstrap brainstorm code-review cook docs docs-seeker fix git handoff journal obsidian-second-brain-note plan pm predict problem-solving research review-pr scenario scout security-scan sequential-thinking ship skill-creator test worktree
```

Strict coverage was invoked separately for:

```text
bootstrap code-review docs-seeker fix plan problem-solving sequential-thinking skill-creator
```

Structural fields were measured from `kit/skills/*/SKILL.md`, direct
`references/*.md`, and `kit/distill-decisions.json`. LOC uses physical
newline-delimited lines, equivalent to `wc -l` for these files.

## Aggregate result

- Tier 1: **26/26 pass**, every invocation exit code 0.
- Tier 3: **0/26 run**, **26/26 explicitly not run** because
  `VCSKILL_EVAL_CMD` was not configured.
- Strict claim coverage: **8/8 pass**.
- Structure: **2,942 SKILL.md LOC**, **56 references / 4,063 reference LOC**;
  18 of 26 skills have references.
- Provenance: 25 skills have a canonical SHA-256 digest; the original
  `obsidian-second-brain-note` uses the valid all-`none` sentinel.

Coverage cells use `covered/rejected` counts.

## Per-skill results

| Skill | Tier 1 | Tier 3 C/S/Co/O | SKILL LOC | Refs / ref LOC | Relation | Upstream version | Digest | Coverage |
|---|---|---|---:|---:|---|---|---|---|
| `ask` | pass (0) | not run | 79 | 0 / 0 | distill | 1.2.0 | yes | n/a |
| `bootstrap` | pass (0) | not run | 127 | 3 / 205 | distill | 1.0.0 | yes | pass (9/7) |
| `brainstorm` | pass (0) | not run | 103 | 0 / 0 | distill | 2.6.0 | yes | n/a |
| `code-review` | pass (0) | not run | 132 | 5 / 353 | distill | 2.0.0 | yes | pass (23/2) |
| `cook` | pass (0) | not run | 101 | 3 / 135 | distill | 2.3.0 | yes | n/a |
| `docs` | pass (0) | not run | 118 | 0 / 0 | distill | 1.4.0 | yes | n/a |
| `docs-seeker` | pass (0) | not run | 119 | 2 / 170 | distill | 3.1.0 | yes | pass (7/2) |
| `fix` | pass (0) | not run | 143 | 5 / 368 | distill | 2.2.0 | yes | pass (37/8) |
| `git` | pass (0) | not run | 263 | 7 / 716 | fork | 1.2.0 | yes | n/a |
| `handoff` | pass (0) | not run | 67 | 2 / 79 | distill | 1.0.0 | yes | n/a |
| `journal` | pass (0) | not run | 110 | 0 / 0 | distill | 1.1.0 | yes | n/a |
| `obsidian-second-brain-note` | pass (0) | not run | 139 | 6 / 565 | none | none | none sentinel | n/a |
| `plan` | pass (0) | not run | 133 | 5 / 435 | distill | 1.4.0 | yes | pass (59/59) |
| `pm` | pass (0) | not run | 79 | 1 / 79 | distill | 1.0.0 | yes | n/a |
| `predict` | pass (0) | not run | 111 | 0 / 0 | distill | 1.1.0 | yes | n/a |
| `problem-solving` | pass (0) | not run | 119 | 3 / 211 | distill | 2.0.0 | yes | pass (17/0) |
| `research` | pass (0) | not run | 102 | 0 / 0 | distill | 1.0.0 | yes | n/a |
| `review-pr` | pass (0) | not run | 93 | 2 / 68 | distill | 2.2.0 | yes | n/a |
| `scenario` | pass (0) | not run | 99 | 0 / 0 | distill | 1.2.0 | yes | n/a |
| `scout` | pass (0) | not run | 84 | 1 / 39 | distill | 1.0.0 | yes | n/a |
| `security-scan` | pass (0) | not run | 101 | 2 / 49 | distill | 1.0.0 | yes | n/a |
| `sequential-thinking` | pass (0) | not run | 139 | 2 / 178 | distill | 1.0.0 | yes | pass (4/0) |
| `ship` | pass (0) | not run | 88 | 1 / 33 | distill | 2.1.0 | yes | n/a |
| `skill-creator` | pass (0) | not run | 133 | 5 / 348 | distill | 4.0.0 | yes | pass (50/23) |
| `test` | pass (0) | not run | 83 | 1 / 32 | distill | 1.0.0 | yes | n/a |
| `worktree` | pass (0) | not run | 77 | 0 / 0 | distill | 1.1.0 | yes | n/a |

## Structural observations

- The eight reshaped skills now sit between 119 and 143 router lines, each with
  2–5 directly linked references, and all pass their pinned claim ratchet.
- The kit now stores more conditional reference detail (4,063 LOC) than
  always-loaded skill router text (2,942 LOC), which is the intended
  router-thin/references-deep shape.
- `git` remains the largest router (263 LOC) and largest reference surface
  (7 files / 716 LOC). It is explicitly a fork, was excluded from this reshape,
  and is not claim-coverage applicable.
- Eight skills still have no references. That is descriptive, not a defect:
  static eval passed, and reference files are warranted by branch depth rather
  than by a quota.

## Conclusion and next evidence

No deterministic tier-1 or claim-coverage failure needs repair. The delivered
kit is structurally clean and provenance-complete under the current contracts.

The strongest honest remaining gap is unchanged: there is no golden-task,
source-vs-distillation behavioral harness. Adding one is the next step required
before claiming behavioral parity. Configuring tier 3 later can add prose-quality
scores, but cannot close that outcome-proof gap.
