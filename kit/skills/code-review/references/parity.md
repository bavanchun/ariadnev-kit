# Parity: vc:code-review vs ak-code-review

Source baseline: `ak-code-review` v2.0.0 (decision 0003, AgentKit baseline).

## Kept

| From ak-code-review | Why |
|---|---|
| Input-mode resolution (PR / commit / pending / codebase) | Core value — reviewer must know *what* it reviews |
| Evidence-based, no-rubber-stamp stance | The reason the skill exists; distrust AI-assisted polish |
| Spec-compliance → quality → verification ordering | Catches "does the wrong thing correctly" before nitpicking |
| Edge-case scouting before review | Real defects hide in unscouted data/error paths |
| Subagent delegation for heavy analysis | Maps to the `vc-reviewer` agent |

## Dropped (with reason)

| Dropped | Reason |
|---|---|
| `codebase parallel` multi-reviewer mode + `parallel-review-workflow.md` | YAGNI for a personal kit; a single scoped audit covers the case. Re-add if throughput demands it |
| 11 separate reference files (checklists, reception, task-management, …) | Over-fragmented; folded the essentials into SKILL.md + one shared rubric to stay under the size gate and reduce orphan risk |
| `when_to_use` / `category` / `keywords` top-level frontmatter | Not in the vc frontmatter allowlist; taxonomy moved to `metadata.category` |
| Receiving-feedback + requesting-review protocols | Belong to the author, not the reviewer; out of this skill's trigger |

## Improvement (parity-or-better)

- **Risk-lane integration.** Findings are tied to vc's shared risk lanes and proof
  vocabulary (`unit`/`integration`/`e2e`/`platform`, `cook/references/risk-lanes.md`)
  so a review verdict routes directly into the same gate `vc:cook`/`vc:test` use —
  ak-code-review has no equivalent shared proof taxonomy.
- **Shared severity rubric** (`severity-rubric.md`) reused verbatim by `vc:review-pr`,
  so the two reviewers cannot drift on what "Important" means.
