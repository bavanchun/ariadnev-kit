# Phase 3 — Cluster: Documentation, knowledge and research

Plan: `plans/260816-1845-ariadnev-evidence-backed-parity-with-agentkit/phase-03-eval-coverage-that-matches-the-claim.md`
12 scenario files created under `evals/scenarios/skills/`.

## Pairings

| skill | positive intent | negative (forbidden) skill | why genuinely confusable |
|---|---|---|---|
| `llms` | Generate `llms.txt` — an LLM-friendly index of existing docs, per llmstxt.org | `mintlify` | Both are "make my docs AI/human legible" asks. `llms` only emits an index file; `mintlify` builds the whole site (docs.json, nav, MDX, theming). A vague "prep our docs for AI/publishing" request could land on either. |
| `mintlify` | Build/edit the Mintlify site structure — docs.json, nav, MDX pages, theme | `llms` | Reciprocal of the above. |
| `interview-docs` | Turn the *user's own* answers into README/ADR content via a guided interview — never derives from code | `folder-context` | Both produce durable project docs from what the agent has learned, and both write to Markdown context files. Distinguishing signal is source of truth: user's spoken answers (interview-docs, root-scoped) vs. inspected folder evidence (folder-context, subfolder-scoped) — easy to blur if the request doesn't say which. |
| `folder-context` | Inspect one subfolder's source/tests/conventions and write a compact, subfolder-scoped `CLAUDE.md` | `interview-docs` | Reciprocal of the above. |
| `research-prompt` | Draft a single self-contained paragraph brief for a researcher to execute later — explicitly does *not* perform the research (checked against `research.json`, which pairs `av:research` against `av:docs-seeker`, not this skill) | `autoresearch` | The shared word "research" plus the fact `research-prompt`'s own doc says "use av-research... to execute the completed brief" invites confusion with `autoresearch`, whose name implies "do the research automatically." Real split: commissioning future work (write the assignment) vs. running a bounded, verified iteration loop now (autoresearch's actual job, which routes to `/av:loop`/`/av:predict`/`/av:scenario`/`/av:security`). |
| `autoresearch` | Route a "improve X measurably through repeated, verified iterations" request to the correct specialized skill and run the bounded loop contract (baseline, guard, one change per iteration, keep/discard) | `research-prompt` | Reciprocal of the above. |
| `copywriting` | Write persuasive copy (headline/email/landing-page/CTA) into a project file using a named formula | `document-skills` | Deemed "weak" in the brief unless justified — justification: both skills operate on the *same office-file surface*. `copywriting`'s own `extract-writing-styles.py` reads `.docx/.pdf/.pptx/.xlsx` to pull a writing style; `document-skills` reads/creates/edits the exact same formats. A request like "make our pitch deck copy" genuinely splits on whether the deliverable is the *text* (copywriting) or the *formatted file* (document-skills, e.g. `.docx` with headings/TOC/page numbers). Kept in-cluster per instructions rather than reaching for an out-of-cluster neighbor, since no other cluster member is closer. |
| `document-skills` | Create/edit an Office document (`.docx/.pdf/.pptx/.xlsx`) — tables, forms, slides, spreadsheets, formatting | `copywriting` | Reciprocal of the above. |
| `repomix` | Pack the whole repo into one AI-friendly file (XML/MD/plain) with token counts, for LLM context | `gkg` | Directly evidenced in `gkg`'s own `SKILL.md`: "**Use repomix instead** for: quick context dumps, any-language support, remote repos, token counting." This is the strongest, most literal confusable pair in the cluster. |
| `gkg` | Precise semantic navigation on a supported language — go-to-definition, find-usages, impact analysis, architecture diagrams via AST + KuzuDB | `graphify` | Both build a "graph" over the codebase for navigation/understanding, and `graphify`'s frontmatter explicitly lists `av:gkg` as `related`. Split: `gkg` is IDE-precise, symbol-level, limited to 6 languages; `graphify` is broader/exploratory, spans code+docs+papers+images, works across 20 languages via tree-sitter. "Build me a graph of this codebase" is ambiguous between them. |
| `graphify` | Build a queryable knowledge graph spanning code, docs, papers, and images; find god-nodes; token-efficient navigation | `repomix` | Completes the three-way cycle: `graphify`'s own frontmatter lists `av:repomix` as `related`, and both are "prepare an AI-context representation of the repo" asks — split is graph/structure (`graphify`) vs. flat packed dump (`repomix`). |
| `markdown-novel-viewer` | Serve one long markdown file/directory in a calm, distraction-free, book-like reader over local HTTP | `mintlify` | Both are "let me view/work with my docs nicely in the browser via a local server" — `markdown-novel-viewer` is read-only and file/dir agnostic; `mintlify`'s `mint dev` also runs a local doc-preview server but is tied to a structured site (`docs.json`, nav, theme) that it can also edit. A user who just says "preview my docs locally" without specifying scope could be routed to either. Not one of the pairs named in the task brief; justified independently since no closer neighbor exists among the 12. |

The `repomix` / `gkg` / `graphify` triangle is covered as a 3-edge cycle (repomix↔gkg in `repomix.json`, gkg↔graphify in `gkg.json`, graphify↔repomix in `graphify.json`) so each of the three pairwise confusions is represented exactly once with its own justification, rather than duplicating one edge three times.

## Evidence used

Existing ids only, all read from `evals/vocabulary/evidence-v1.json` and matched by criterion, not name:

- `docs.updated` (harness/artifact) — used for: `llms`, `mintlify` (both directions), `interview-docs`, `folder-context` (both directions), `copywriting`, `document-skills` (both directions), `repomix` positive, `graphify` negative, `markdown-novel-viewer` negative. All of these cases produce a file-scoped artifact change verifiable via diff — the criterion ("changes only the owning documentation surface required by the task") holds whether the artifact is a README, an ADR, a subfolder `CLAUDE.md`, a `docs.json`/MDX nav, a `.docx` report, or a packed repomix output file, because in every case the check is "did the requested artifact appear, and did nothing outside its scope change."
- `repository.map` (evaluator/source) — used for: `repomix` negative, `gkg` (both directions), `graphify` positive. `gkg`'s find-usages/impact-analysis output and `graphify`'s knowledge-graph output both "name owning modules, callers ... with relative evidence," matching the criterion already established by `scout.json`'s use of the same id.
- `implementation.verified` (harness/execution) — used for `autoresearch` positive / `research-prompt` negative. Matches `autoresearch`'s own "Stable loop contract" (§3–4: run declared verification and guards; keep the change only when evidence satisfies the contract).

## Proposed new evidence ids (2, at budget cap for this cluster)

1. **`research.brief`**
   - producer: `evaluator`
   - proof: `artifact`
   - criterion: "The produced brief is a single self-contained paragraph naming the research question, decision, sub-questions, and source hierarchy, without itself executing the research."
   - capabilities: `{}`
   - Why needed: `research-prompt`'s entire deliverable shape (one paragraph, sub-questions, source hierarchy, completion bar, explicitly *not* performing the research) has no existing match. `handoff.context` was considered and rejected — its criterion is about resuming interrupted session work, not commissioning a fresh research assignment.

2. **`viewer.rendered`**
   - producer: `harness`
   - proof: `execution`
   - criterion: "The requested markdown target renders through the local reading server without an error response, and the harness can fetch the served page at the returned URL."
   - capabilities: `{}`
   - Why needed: `markdown-novel-viewer` only serves/renders content; it produces no file artifact and cites no external source, so none of `docs.updated`/`docs.sources`/`repository.map` apply. The criterion is directly checkable against the skill's own documented failure mode ("Error 500: Error rendering markdown").

No other new ids were needed — evidence gaps for `copywriting` and `repomix`/`graphify` were resolved by framing their positive prompts as producing a scoped file artifact, which lets `docs.updated` apply honestly instead of inventing skill-specific ids.

## Validation

- All 12 files parse as JSON (`node -e "JSON.parse(...)"` per file — pass).
- Scenario ids unique across all 83 scenario files in the directory (script check — no duplicates).
- `npx vitest run packages/cli/src/eval/scenario-coverage.test.ts`:
  - "has a scenario file named for every shipped skill": our 12 skills are absent from the reported `uncovered` array (21 skills from other clusters remain, as expected).
  - "declares every shipped skill as the subject of some scenario" / "names no scenario after a skill that no longer ships" / "gives every scenario a unique id": pass.
  - "resolves every requiredEvidence id against the vocabulary": fails only on our 2 proposed-but-not-yet-merged ids (`research.brief`, `viewer.rendered`), listed alongside other clusters' pending proposals (`browser.session`, `media.rendered`, `design.visual-fidelity`, etc.). No other id from our 12 files appears in the unknown list — `docs.updated`, `repository.map`, `implementation.verified` all resolve.

## Files created

`evals/scenarios/skills/{llms,mintlify,interview-docs,folder-context,document-skills,research-prompt,autoresearch,copywriting,repomix,gkg,graphify,markdown-novel-viewer}.json`

No files outside this list were touched. `evals/vocabulary/evidence-v1.json` was read but not edited.

---

Status: DONE_WITH_CONCERNS
Summary: 12 scenario files authored, parse clean, ids unique, coverage test drops all 12 skills from uncovered; 2 new evidence ids proposed (research.brief, viewer.rendered) pending orchestrator merge into evidence-v1.json.
Concerns/Blockers: The evidence-resolution test in scenario-coverage.test.ts will keep failing for this cluster (and others) until the orchestrator merges the proposed ids across all clusters — expected per plan step 5 ("Extend the vocabulary once per batch review"), not a defect in these files.
