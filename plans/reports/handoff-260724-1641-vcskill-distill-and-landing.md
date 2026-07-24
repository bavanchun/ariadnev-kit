# HANDOFF: vcskill AgentKit-distillation program (planned) + vcskill-web landing hardening (shipped)
Generated: 2026-07-24 16:41 Asia/Saigon · Session focus: two threads — landing page hardened & deployed; AgentKit→vcskill distillation brainstormed, planned, validated (not cooked)

## Goal
- **Thread A (vcskill-web):** harden the `landing.html` landing page against AI-slop/a11y gate failures, keep single-file inline + dark/coral identity. **DONE + deployed.**
- **Thread B (vcskill):** distill AgentKit (`ak-*`) into the vcskill kit toward full 1:1 parity, delivered in waves. **Planned + validated; awaiting cook.** This is the primary continuation.

## Why This Matters
Thread B changes the kit's identity: from a lean, curated CK-parallel core (decision 0001) to a comprehensive AgentKit mirror. The differentiator ("moat") now rests entirely on the quality gates + a per-skill parity-or-better proof, not on scarcity. Getting Wave 0 (governance + tooling) right is what keeps the 21→~86 skill growth coherent and gate-safe.

## Current State
- **Thread A:** committed `ea4d902` (landing hardening) + `b7c49bb` (wrangler fallthrough), pushed `origin/main`; deployed to Cloudflare `vcskill.vchun.dev` (Worker version `5fdda7a0`). Live curl confirms new page (OKLCH tokens + `term-tag` present). `wrangler.toml` fallthrough fix is committed but not redeployed (unnecessary until next deploy).
- **Thread B:** plan dir written + validated, **uncommitted** in the vcskill repo: `plans/260724-1628-distill-agentkit-wave0-wave1/` (plan.md + 8 phase files). `/ak:plan validate` ran; 6 decisions baked in; whole-plan consistency sweep clean; Open questions = None. No code/skills written yet.

## Key Decisions and Why
- **Thread A — harden, don't redesign.** The page already passes anti-slop gates (distinctive fonts, no italic headers, honest metrics, transform/opacity motion). Fixed real defects instead: removed `body overflow-x:hidden` (gate 34), added global `:focus-visible`, lifted `--faint` contrast to 4.67:1, migrated palette to OKLCH, tokenized stray literals via `color-mix(... in srgb ...)` for exact parity, de-chromed terminals (window-dots → `term-tag`), playbook tab ARIA + keyboard nav, reduced-motion cuts hover transforms.
- **Thread B — scope = full 1:1 AgentKit mirror** (user chose over the recommended Tier-1-only). Source baseline = AgentKit (`ak-*`), replacing ClaudeKit in decision 0001.
- **Wave structure:** Wave 0 = foundation (identity `0002`, roadmap doc, collision-allowlist + `metadata.category`); Wave 1 = 5 dev-loop skills (code-review, test, ship, review-pr, handoff). Build order `1 → 3 → (2 ∥ 4 ∥ 5) → 6,7,8`.
- **code-review/test = standalone skills that reuse `vc-reviewer`/`vc-tester` agents** (invoke review/test outside a cook cycle).
- **`vc:ship` = documented sequence** (loose coupling) referencing vc:test/vc:code-review/vc:git, not hard-invoke.
- **Parity tables → `references/parity.md` per skill, linked from SKILL.md** (keeps SKILL.md ≤300-line gate; link avoids orphan-ref failure).
- **Collision gate: do NOT loosen thresholds**; add a justified-similar allowlist (respects `description-collision.ts:6–8` design intent).

## Rejected Approaches and Traps
- **Rejected:** forking hallmark (nutlope/hallmark) into vcskill — duplicates existing `ak-frontend-design`/`frontend-design`; its multi-file token output conflicts with the single-file `landing.html` contract. See `vcskill-web/plans/reports/compare-260724-1551-hallmark-study.md`.
- **Rejected:** full visual redesign of the landing page (it's already good).
- **Overruled recommendation:** Tier-1-only distillation with Tier-3 as non-goal — user deliberately chose full mirror (warned 3×). Phase 1 (`0002`) is the cheap checkpoint if scope is reconsidered.
- **Trap:** `description-collision` thresholds (0.6/0.4) are calibrated for the current 21 skills. New skill descriptions must be distinct from `vc:cook`/`vc:git`/`vc:fix` (Jaccard <0.4) or use the Phase-3 allowlist — do not loosen thresholds.
- **Trap:** each `references/parity.md` MUST be linked from its SKILL.md or `vc validate` fails on orphan-ref.
- **Trap (tooling location):** CWD is `vcskill-web` but Thread-B work lives in `vcskill`. Do not run `ak plan`/cook scaffolding from CWD — it writes to the wrong repo. Operate on the vcskill repo path explicitly.
- **Trap (identity, HIGH):** the 1:1 mirror removes the curation safety-valve; if quality gates + parity proof aren't enforced per skill, vcskill becomes an AgentKit clone with no differentiator.

## Verification Status
- **Thread A:** static-verified — JS parses, zero console errors, live curl confirms deployed content. **Browser screenshot verification FAILED** (Chrome extension script-injection timed out repeatedly; retrying stopped per anti-rabbit-hole rule). Page not visually eyeballed at 320/375px — an optional headless-render/mobile check is deferred.
- **Thread B:** plan validated via `/ak:plan validate`; consistency sweep clean. No implementation code exists yet, so nothing runtime-verified.

## Relevant Files and Pointers
- Thread B plan: `plans/260724-1628-distill-agentkit-wave0-wave1/plan.md` (+ `phase-01..08`).
- Thread B brainstorm: `plans/reports/brainstorm-260724-1615-distill-agentkit-into-vcskill.md`.
- Quality spec + gates: `docs/vc-skill-authoring-spec.md`; `docs/decisions/0001-vc-kit-identity-and-quality-strategy.md`; linters at `packages/cli/src/kit/{skill-lint,description-collision,reference-integrity,agent-lint}.ts`; validate at `packages/cli/src/cli/validate-command.ts`.
- Distillation sources: AgentKit skills in `~/.claude/skills/` — `ak-code-review`, `ak-test`, `ak-ship`, `ak-review-pr`, `ak-handoff` (read as inert reference; adapt, don't copy).
- Thread A artifacts (other repo): `vcskill-web/landing.html`, `vcskill-web/plans/reports/{compare-260724-1551-hallmark-study,audit-260724-1551-landing-slop-test}.md`.

## Open Work and Dependencies
- **Thread B is the live front:** plan is validated but not committed and not implemented. Cook starts at Phase 1; Phase 3 (tooling) should land before mass skill-addition; Wave-1 skill phases depend on Phase 1 (AgentKit baseline for parity tables). Phase 6 (ship) depends on Phases 4+5; Phase 7 (review-pr) depends on Phase 4.
- The Thread-B plan dir + brainstorm report + this handoff are **untracked in the vcskill repo** — committing them is a pending decision.
- **Thread A:** effectively closed. Optional deferred item: a real headless render / 320–375px mobile check on the deployed landing page.

---
**Fresh-agent prompt:** You are picking up the vcskill AgentKit-distillation program. Read `plans/260724-1628-distill-agentkit-wave0-wave1/plan.md` and all `phase-*.md`, then `plans/reports/brainstorm-260724-1615-distill-agentkit-into-vcskill.md` and `docs/vc-skill-authoring-spec.md`. Verify the plan against the current repo (skill count, lint gates, decision 0001) before acting — do not trust this handoff blindly. The user chose a full 1:1 AgentKit mirror; treat Phase 1 (`docs/decisions/0002`) as the deliberate identity checkpoint. When ready, implement with `/ak:cook` starting at Phase 1, or run `/ak:plan red-team` first. Operate on the vcskill repo path explicitly (CWD may be a different repo).
