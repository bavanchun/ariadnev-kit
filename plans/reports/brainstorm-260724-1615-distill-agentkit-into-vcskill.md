# Brainstorm: Distill AgentKit → vcskill (full-parity program)

**Date:** 2026-07-24 · **Skill:** brainstorm (intent-shaping; no implementation)
**Source scouts:** kit-inventory + methodology/tooling (both DONE, 2026-07-24)

## Decision (user-accepted)
- **Scope:** north-star = distill ALL of AgentKit into vcskill, **including Tier 3** (domain/tech + media). Delivered in **waves**, not one shot.
- **Source:** AgentKit (`ak-*`, the kit run daily in `~/.claude/skills`) is the distillation source + parity baseline. Re-baseline `decision 0001` from ClaudeKit → AgentKit.
- **First batch (Wave 1):** `vc:code-review`, `vc:ship`, `vc:review-pr`, `vc:test`, `vc:handoff`.

## Contract
- **Outcome:** vcskill grows toward full AgentKit parity in waves. Wave 1 ships 5 Tier-1 dev-loop skills, each cook-grade + gate-passing + graph-wired; foundation work (Wave 0) makes the larger program safe.
- **Constraints:** every new skill passes `skill-lint` (name==`vc:<slug>`, desc 20–200 chars w/ trigger verb, ≤300 lines, frontmatter allowlist), `reference-integrity` (no dangling/orphan), `description-collision` (Jaccard), `eval` tier-1; carries a parity-or-better kept/dropped table vs its `ak-*` source; stays provider-agnostic (canonical Claude format; must not break the 6-provider adapt matrix); markdown-first (CLI changes need TDD ≥95%).
- **Non-goals:** no automated ak→vc extraction pipeline (manual per-skill parity — YAGNI, revisit only if throughput demands); no adapt-engine/CLI changes unless a skill forces it.
- **Acceptance:** Wave 1 = 5 skills in `kit/skills/` each with `## Output format` + `## Quality gates` + `## Workflow position`; `vc validate --check` green; `vc eval` tier-1 pass; README "What's in the kit" + provider matrix updated; roadmap doc lists all remaining `ak-*` candidates by tier/category+status; `decision 0001` updated (identity + AgentKit baseline).

## Tier map (ak → vc gaps)
- **Tier 1 (Wave 1 batch):** code-review, ship, review-pr, test, handoff (also candidates: use-mcp, retro, watzup).
- **Tier 2 (meta depth):** repomix, preview, find-skills, folder-context, mcp-builder, agentize, context-engineering, issue-to-plan, xia, interview-docs, orchestrate/team/vibe, llms, mermaidjs/excalidraw/tech-graph.
- **Tier 3 (domain/media, later waves):** backend/frontend/frontend-design/web-frameworks/react/tanstack/mobile/databases/better-auth/payment/devops/deploy/shopify/threejs/shader/ui-styling/ui-ux/web-testing + ai-artist/ai-multimodal/media/remotion/html-video/stitch/design/copywriting/document-skills/mintlify/cti-expert/agent-browser/chrome-profile/deep-swe/codex-goal/agentwiki.

## Tier-3 consequences the plan MUST handle
1. Rewrite `docs/decisions/0001` → comprehensive-kit identity + AgentKit baseline.
2. Recalibrate `description-collision` thresholds (calibrated for 21 skills; ~86 skills w/ overlapping domain vocab will false-error).
3. Add category/lane taxonomy so the skill graph stays legible at ~86 nodes.
4. Adapt engine / provider matrix: unaffected (domain skills are still canonical markdown) — low risk.
5. Volume: manual parity for ~65 skills is heavy → plan may add a per-skill checklist template (not automation).

## Proposed wave roadmap
- **Wave 0 (foundation):** decision-0001 rewrite; collision recalibration; category taxonomy; roadmap doc enumerating all remaining ak skills by tier/category/status.
- **Wave 1 (this batch):** code-review, ship, review-pr, test, handoff — reuse existing agents (vc-reviewer, vc-tester) where they fit; ensure distinct descriptions vs vc:cook/vc:git/vc:fix.
- **Wave 2:** Tier-2 meta depth.
- **Waves 3+:** Tier-3 by category (frontend · backend · data · devops/deploy · media · security/intel · mobile · web).

## Handoff
→ `/ak:plan` (or `/vc:plan`) in the **vcskill** repo. Recommend planning **Wave 0 + Wave 1 together** first (foundation must land before/with the first skills); defer Wave 2+ to later plans.

## Unresolved questions
1. Wave 0 + Wave 1 in one plan, or split (foundation plan, then skills plan)?
2. `vc:code-review` / `vc:test` overlap existing agents + cook gates — confirm standalone skills wanted (invoke review/test outside a full cook cycle). Assumed yes.
3. At Tier-3 scale, keep strictly manual, or allow a checklist-assisted batch flow later?
