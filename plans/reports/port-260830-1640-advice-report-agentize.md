# Port report: --advice, brainstorm --report, agentize references

Upstream oracle read-only; all edits verified against upstream section text
before writing. Scout evidence: `plans/reports/scout-260830-1604-skills-a-to-m-ak-vs-av.md`
gap-table rows 3, 4, 7.

## Gap 1 — `--advice` on code-review and agentize

| Item | Ported | Cut | Reworded | Why |
| --- | --- | --- | --- | --- |
| code-review checkpoint: after Stage 1 + Stage 2 | yes | — | — | av has the same Stage 1/Stage 2 protocol |
| code-review checkpoint: when stuck | yes | — | — | verbatim fit |
| code-review checkpoint: high-stakes verdict | yes | — | "Request changes" → "BLOCKED" | av verdict vocabulary is READY / READY WITH FIXES / BLOCKED |
| code-review composition line | partial | `--ultra` mentions | "composes with every input mode, including `codebase parallel`" | av code-review has no `--ultra` mode; the `codebase parallel`/`--ultra` hard-conflict has no av counterpart |
| agentize checkpoints (Scout/Analyze, phase 3 record, phase 7 handoff, stuck) | yes | — | phase names lowercased to match av prose | av phases match upstream 1:1 (verified against av SKILL.md phases 1–7) |
| Supervisor identity / invocation shape / model routing | no (linked) | copied text | link to `../av-cook/references/advisory-supervision.md` | shared protocol already ships in av-cook; per instruction, link instead of duplicating (note: fix/plan/review-pr carry local copies — pre-existing pattern left untouched) |
| `argument-hint` `--advice` | yes (both skills) | — | — | plus agentize Usage block + flags table row |

## Gap 2 — brainstorm `--report`

| Item | Ported | Cut | Reworded | Why |
| --- | --- | --- | --- | --- |
| Persist to reports dir | yes | — | — | path wording kept from upstream: plan-scoped `plans/{plan-dir}/reports/`, else `plans/reports/`, else injected `Report:` path — matches av runtime naming injection |
| Naming `brainstorm-{YYMMDD-HHmm}-{slug}.md` | yes | — | — | av timestamp convention |
| Composes with `--html` | yes | — | — | — |
| `--ultra` ranking-appendix clause | — | yes | — | av brainstorm has no `--ultra` |
| `--no-antv` / `--no-diagram-design` / `--no-editorial-visuals` | — | yes | — | deliberately absent in av per task scope |
| Reconciliation with existing soft mechanism | — | — | yes | av brainstorm already had "write a durable summary only when the decision must survive the session"; `--report` is wired into that same Handoff paragraph and the Output-format `Report:` line, not added as a second mechanism |
| `argument-hint` `--report` | yes | — | — | — |

## Gap 3 — agentize references

| Item | Ported | Cut | Reworded | Why |
| --- | --- | --- | --- | --- |
| `references/oauth-streamable-http.md` (110 lines) | yes, verbatim | — | — | no upstream brand terms present; Related targets (`mcp-transports.md`, `auth-resolution-chain.md`) exist in av |
| `references/code-mode.md` (106 lines) | yes, verbatim | — | — | same; Related targets all exist in av |
| SKILL.md link 1 (phase 5 Wrap, MCP paragraph) | yes | — | split into two sentences | av paragraph structure differs from upstream's |
| SKILL.md link 2 (References table) | yes | — | table rows instead of bullet list | av uses a "Read when / File" table |
| `mcp-transports.md` Auth cross-link | yes | — | — | mirrors upstream's own Auth-section line; bearer guidance kept, not duplicated into the new file |
| `deployment-guide.md` Cloudflare cross-link to `code-mode.md` | yes | — | — | mirrors upstream deployment-guide line 7 |
| `challenge-framework.md` OAuth stop-condition | — | — | yes (added pointer) | av's only prior OAuth guidance lived here as an abort condition; pointer notes OAuth 2.1 + PKCE over Streamable HTTP may cover it before aborting — cross-link, no duplication |

## Line counts after edit

| File | Lines | Cap |
| --- | --- | --- |
| `kit/skills/code-review/SKILL.md` | 272 | 300 |
| `kit/skills/agentize/SKILL.md` | 299 | 300 |
| `kit/skills/brainstorm/SKILL.md` | 275 | 300 |
| `kit/skills/agentize/references/oauth-streamable-http.md` | 110 | 800 |
| `kit/skills/agentize/references/code-mode.md` | 106 | 800 |

## Validation

| Check | Result |
| --- | --- |
| `av validate --strict` (worktree root) | all checks passed — 105 skills, 16 agents, 14 hooks; 131 warnings, none mentioning agentize/brainstorm/code-review |
| Brand grep (`agentkit`, `ak-`, `ak:`, `ak ` forms) on touched skills | clean |
| Orphan check | both new references linked twice from `agentize/SKILL.md` (phase 5 + References table) |
| `kongming` agent exists | `kit/agents/kongming.md` |
| evals / kit-embedded.generated.ts | untouched (coordinator regenerates benchmark) |

## Unresolved questions

- `kit/skills/agentize/SKILL.md` sits at 299/300; the next addition to that
  file must move content into a reference first.
- fix, plan, and review-pr each carry a local `references/advisory-supervision.md`
  copy while code-review and agentize now link av-cook's shared one; if the
  link-don't-copy policy is the keeper, those three could be converged later.
