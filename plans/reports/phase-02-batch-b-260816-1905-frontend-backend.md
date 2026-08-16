# Phase 2 Batch B — frontend-design + backend-development orphan resolution

Batch scope: 20 orphan reference files across `kit/skills/frontend-design/` (10) and
`kit/skills/backend-development/` (10). All 20 decided as **Index** — no links inserted
mid-body, no deletions.

## Decision table

| File | Decision | Purpose (as written in SKILL.md) |
|---|---|---|
| frontend-design/references/analysis-best-practices.md | Index | Quality guidelines and common pitfalls when prompting for visual analysis. |
| frontend-design/references/analysis-prompts.md | Index | Prompt templates for comprehensive, comparison, color-extraction, integration, and A/B analysis. |
| frontend-design/references/analysis-techniques.md | Index | Advanced batch, contextual, and iterative-refinement analysis techniques with CLI examples. |
| frontend-design/references/extraction-best-practices.md | Index | Capture-quality guidelines and pitfalls for reverse-engineering design systems from references. |
| frontend-design/references/extraction-output-templates.md | Index | Markdown templates for documenting an extracted design system or competitive analysis. |
| frontend-design/references/extraction-prompts.md | Index | Prompt templates for extracting design guidelines from screenshots, video, and competitor sets. |
| frontend-design/references/technical-accessibility.md | Index | WCAG contrast, alt-text, and text-overlay accessibility techniques for generated assets. |
| frontend-design/references/technical-best-practices.md | Index | Asset-generation and extraction workflow checklists and quality gates. |
| frontend-design/references/technical-optimization.md | Index | Model-selection cost/speed strategy and budget guidelines for asset generation. |
| frontend-design/references/technical-workflows.md | Index | End-to-end pipeline examples for generating, analyzing, and optimizing assets. |
| backend-development/references/backend-api-design.md | Index | REST, GraphQL, gRPC patterns and best practices. |
| backend-development/references/backend-architecture.md | Index | Microservices, event-driven, CQRS, saga patterns. |
| backend-development/references/backend-authentication.md | Index | OAuth 2.1, JWT, RBAC, MFA, session management. |
| backend-development/references/backend-code-quality.md | Index | SOLID principles, design patterns, clean code. |
| backend-development/references/backend-debugging.md | Index | Debugging strategies, profiling, logging, production debugging. |
| backend-development/references/backend-devops.md | Index | Docker, Kubernetes, deployment strategies, monitoring. |
| backend-development/references/backend-mindset.md | Index | Problem-solving, architectural thinking, collaboration. |
| backend-development/references/backend-performance.md | Index | Caching, query optimization, load balancing, scaling. |
| backend-development/references/backend-security.md | Index | OWASP Top 10 2025, security best practices, input validation. |
| backend-development/references/backend-testing.md | Index | Testing strategies, frameworks, tools, CI/CD testing. |

No deletions were needed. All 20 files carry real, non-duplicated operational content
(prompt templates, checklists, code samples, architecture diagrams) that goes well beyond
what SKILL.md's own body states — a fit for indexed reference, not inline linking or removal.

## Rationale by skill

**frontend-design**: SKILL.md already links 4 "overview" hub files
(`visual-analysis-overview.md`, `design-extraction-overview.md`, `technical-overview.md`,
`asset-generation.md`) that each carry a "Detailed References" list pointing at the 10
files in this batch — but `checkReferenceIntegrity` only scans SKILL.md's own body, so
those in-file cross-links did not clear the orphan warning. Added a new `## References`
section at the end of SKILL.md's "Asset & Analysis References" area (before the
Self-Review Gate, which stays the true closing section) indexing all 10 files with purpose
lines, explicitly framed as "deeper material behind the overview references above — read on
demand, not by default" to keep the index honest about being optional depth, not required
reading.

**backend-development**: SKILL.md already had a "## Reference Navigation" section listing
all 10 files (plus `backend-technologies.md`, not in this batch) with one-line
descriptions — but using bare filenames (`` `backend-api-design.md` ``) instead of the
literal `references/<name>.md` form the checker requires, and a hyphen instead of the
spec's em dash. Fixed in place: added the `references/` prefix and em dash to each of the
10 existing bullets, preserving the existing (accurate) purpose text and the existing
topical grouping (Core Technologies / Security & Authentication / Performance &
Architecture / Quality & Operations). No content was rewritten beyond this fix.

## SKILL.md line counts (budget: 300, ceiling 400, warning-only for `origin: ported`)

- `kit/skills/frontend-design/SKILL.md`: 264 → 279 lines (+15, new `## References` block)
- `kit/skills/backend-development/SKILL.md`: 103 lines (unchanged; in-place edit only)

Both stay well under the 300-line budget. No budget risk encountered.

## Validate output

```
$ npx tsx packages/cli/src/index.ts validate 2>&1 | grep -E 'frontend-design:|backend-development:'
(no output)

$ npx tsx packages/cli/src/index.ts validate 2>&1 | tail -1
0 error(s), 30 warning(s)
```

Prior to this batch: `0 error(s), 89 warning(s)`, all `warn:orphan`. This batch cleared 20
of them (89 → 69 would be expected from this batch alone, but the tree now also reflects
other agents' concurrent progress — final observed count is 30 warnings, none attributable
to `frontend-design` or `backend-development`). 0 errors preserved.

## Verification of no-empty-purpose-line rule

```
$ grep -n "^- \`references/" kit/skills/frontend-design/SKILL.md kit/skills/backend-development/SKILL.md | grep -v " — "
(no output — every entry has a purpose line)
```

## Files modified

- `kit/skills/frontend-design/SKILL.md` (+15 lines: new `## References` section)
- `kit/skills/backend-development/SKILL.md` (in-place: `references/` prefix + em dash on 10 existing bullets)

No `references/*.md` files were touched or deleted.

## Unresolved questions

None.
