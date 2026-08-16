# Phase 3 — Cluster: Frontend build & style

Plan: `plans/260816-1845-ariadnev-evidence-backed-parity-with-agentkit/phase-03-eval-coverage-that-matches-the-claim.md`

11 scenario files created under `evals/scenarios/skills/`. All parse as valid
JSON, ids are unique (`skill.<name>.routing`), and `subjects.skills` matches the
filename exactly. Verified against
`npx vitest run packages/cli/src/eval/scenario-coverage.test.ts`: none of these
11 skill names appear in the "undeclared subjects" or "missing scenario file"
failure lists (those two coverage checks pass for this cluster). The remaining
test failures are (a) other clusters' skills not yet authored, and (b) the two
new evidence ids below awaiting central vocabulary addition — both expected and
out of this cluster's ownership.

## Coverage table

| skill | positive intent | negative (forbidden) skill | why those two are genuinely confusable |
|---|---|---|---|
| `frontend-design` | Replicate a supplied screenshot/reference into a polished, production-ready web component (visual fidelity, avoiding AI-slop). | `frontend-development` | Both "build the UI." The dividing line is whether there is a concrete visual reference to match (frontend-design) vs. only a data/behavior contract to implement with React/TS patterns (frontend-development). A model sees "build this component" and must pick based on presence/absence of a reference image. |
| `frontend-development` | Implement a React/TypeScript component using Suspense, `useSuspenseQuery`, MUI v7, TanStack Router patterns — no visual reference given, only a data contract. | `frontend-design` | Mirror of the above pairing, opposite direction: a prompt that *does* supply a screenshot to replicate is frontend-design's job even though it also results in React/TS code. |
| `ui-styling` | Style/theme a component with shadcn/ui + Tailwind (dark mode, responsive, design tokens applied). | `web-design-guidelines` | Both touch accessibility/contrast/dark-mode language. Styling *implements* a themed, accessible component; guidelines review *audits* an already-built component against the Web Interface Guidelines without changing code. A prompt mentioning "accessibility" or "dark mode" is ambiguous between "make it accessible" (styling) and "check it's accessible" (audit) until the verb (implement vs. audit) is read. |
| `web-design-guidelines` | Audit shipped UI code against Web Interface Guidelines (contrast, focus states, keyboard nav, label associations) and report findings — no code changes. | `ui-ux-pro-max` | Both are UX-quality skills operating on the same concerns (accessibility, interaction states). The split is audit-of-existing-code (web-design-guidelines) vs. decide-the-design-system-before-anything-is-built (ui-ux-pro-max). A prompt about "checking" interaction states could target either until it's clear whether code already exists to review. |
| `ui-ux-pro-max` | Decide the design system itself — color system, typography scale, spacing, interaction states — across web and mobile platforms, with accessibility trade-offs justified. | `ui-styling` | This is the pairing the phase spec calls out explicitly: "implement components / decide design intelligence." Once tokens are decided, implementing them with shadcn/Tailwind is `ui-styling`'s job, not `ui-ux-pro-max`'s. A vague "make this look good/accessible" prompt is genuinely ambiguous between the two until it's clear whether tokens already exist. |
| `react-best-practices` | Diagnose and fix a React/Next.js rendering-performance regression (unnecessary re-renders) using memoization/code-splitting patterns from the Vercel Engineering guide. | `web-frameworks` | Both operate inside the same Next.js app and both mention "performance" / "caching." The split is component-level rendering optimization (react-best-practices) vs. framework-level rendering/caching architecture — ISR, RSC, Turborepo build graph (web-frameworks). A prompt about "why is this Next.js page slow" could plausibly be either a component re-render problem or an ISR/caching-config problem. |
| `web-frameworks` | Build a Next.js App Router route with RSC data fetching, ISR, and shared Turborepo caching config. | `tanstack` | Next.js and TanStack Start are the two competing full-stack React meta-frameworks in this kit; a "build this route with server rendering and forms" prompt is genuinely ambiguous until the project's framework is named. The prompt pair is written so each explicitly states which framework the project uses, since that is the only real distinguishing signal a router has. |
| `tanstack` | Build a TanStack Start route with a TanStack Form and a server function — explicitly not a Next.js project. | `web-frameworks` | Mirror of the pairing above, opposite direction. |
| `mobile-development` | Implement offline-first sync (background retry, local SQLite cache) for a React Native screen on iOS/Android. | `ui-ux-pro-max` | `ui-ux-pro-max`'s own description explicitly lists SwiftUI, React Native, and Flutter as platforms it covers design intelligence for — this is not a stretch pairing, it's stated in the skill's own scope. The split is implement-the-mobile-feature (mobile-development) vs. decide-the-mobile-design-system before code exists (ui-ux-pro-max). |
| `stitch` | Generate an AI UI design from a text prompt only (no reference image), export Tailwind/HTML + DESIGN.md. | `frontend-design` | Both produce "polished UI from a description." The dividing signal is exactly the one the phase spec's frontend-design/frontend-development split hinges on, applied differently here: stitch owns the case where there is *no* concrete visual reference (only a text prompt, open-ended generation); frontend-design owns the case where a concrete screenshot/reference exists to replicate. Each scenario's prompt states explicitly which is true so the case is unambiguous per fixture even though the router-facing intent overlaps. |
| `shopify` | Build a Shopify checkout UI extension via Shopify CLI, calling the Admin GraphQL API, registering a webhook, configuring billing. | `web-frameworks` | Weaker pairing, used because the phase spec explicitly flags `shopify` vs `web-frameworks` as needing justification. Justification: Shopify apps are frequently built as embedded Next.js/Remix apps, so "build the storefront/app frontend" is genuinely ambiguous between the Shopify-domain skill and the generic Next.js framework skill until the prompt states whether Shopify-specific surface (Admin API, extensions, webhooks, billing) is involved. The positive prompt is written to require Shopify-domain capability explicitly (CLI scaffold, Admin GraphQL, webhook, billing); the negative prompt is written to explicitly deny any Shopify surface (plain Next.js storefront, ISR/caching only) so the two cases stay honestly separable even though the underlying confusion is narrower than the other pairs in this cluster. |

No skill in this cluster needed a negative drawn from outside the 11-skill
cluster; `frontend-design` and `stitch` do double duty as each other's and
`frontend-development`'s neighbor, which kept every pairing inside the
cluster while still being asymmetric per file (matching the existing
`ask.json`/`research.json` pattern where a skill's own negative-target need not
be the same skill that names it as a neighbor).

## Evidence ids proposed (2, at the report cap)

Both are used more than once across this cluster (never a one-off alias), and
neither can be honestly expressed with an existing vocabulary id — the closest
existing ids (`implementation.verified`, `design.acceptance`, `solution.options`)
either drop the platform-specific decision content or assume a bug/brainstorm
framing that doesn't hold for UI/UX system decisions or visual-reference
matching.

1. **`design.visual-fidelity`**
   - producer: `evaluator`
   - proof: `artifact`
   - criterion: "The rendered UI implementation is compared against the supplied reference design/screenshot and the evaluator confirms structural and stylistic match beyond generic component scaffolding."
   - capabilities: `{}`
   - used by: `frontend-design.json` (positive), `frontend-development.json` (negative), `stitch.json` (negative) — 3 uses, all where a concrete visual reference exists to match against.

2. **`design.system-decision`**
   - producer: `evaluator`
   - proof: `decision`
   - criterion: "The UI/UX decision covers color system, typography, layout, and interaction states, and recommends one option with an explicit rationale tied to accessibility and platform constraints."
   - capabilities: `{}`
   - used by: `ui-ux-pro-max.json` (positive), `web-design-guidelines.json` (negative), `mobile-development.json` (negative) — 3 uses, all where the case's success is a design-system decision rather than an implementation or an audit-of-existing-code.

`implementation.verified`, `review.findings` were reused (not aliased) where
the criterion already honestly fits: "implementation exists and required
verification passes" for every build-a-feature positive/negative in this
cluster, and "review artifact maps findings with file-relative evidence" for
the Web Interface Guidelines audit.

## Files created (11)

`evals/scenarios/skills/{frontend-design,frontend-development,ui-styling,
ui-ux-pro-max,web-design-guidelines,react-best-practices,web-frameworks,
tanstack,mobile-development,stitch,shopify}.json`

## Verification

- `node -e "JSON.parse(...)"` on all 11 files — all parse, ids unique.
- `npx vitest run packages/cli/src/eval/scenario-coverage.test.ts`:
  - Test 1 (filename coverage) and test 2 (subjects coverage): this cluster's
    11 skills do not appear in either failure list.
  - Test 3 (evidence-id resolution): fails as expected, listing the 2 new ids
    above (plus other clusters' proposed ids) pending central vocabulary merge.
- No file outside `evals/scenarios/skills/<one-of-the-11>.json` was touched.
  `evals/vocabulary/evidence-v1.json` was read-only.

Status: DONE
Summary: 11 scenario files authored for the frontend build & style cluster, each with a positive case and a genuinely confusable negative case inside the cluster; 2 new evidence ids proposed (design.visual-fidelity, design.system-decision), each used 3x, none aliased.
Concerns/Blockers: None blocking. The `shopify` vs `web-frameworks` pairing is intentionally the weakest in this cluster (flagged as such by the phase spec itself) — justification is recorded above; orchestrator may want a second opinion if a stronger neighbor emerges once other clusters are visible. The two proposed evidence ids need the orchestrator to add them to `evals/vocabulary/evidence-v1.json` (I did not and must not edit that shared file) before the full coverage test can go green for this cluster's evidence checks.
