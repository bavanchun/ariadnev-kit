# Port: ui-ux-designer Expert Capabilities

Upstream agent's `## Expert Capabilities` block (lines 32–89) ported into the
kit as a skill reference, rebranded.

## What changed

| File | Change | Lines |
|---|---|---|
| `kit/skills/ui-ux-pro-max/references/expert-capabilities.md` | New reference: all 7 upstream sections (trend research, photography, UX/CX-CRO, branding, digital art/3D, Three.js/WebGL, typography), structure preserved, grounded in shipped kit tooling | 93 (cap 800) |
| `kit/skills/ui-ux-pro-max/SKILL.md` | One "Load when" row appended to References table | 213 (cap 300) |
| `kit/agents/ui-ux-designer.md` | One pointer line to load the reference for expert-judgment briefs | 118 (cap 120) |

## Claims audit (tool/site honourability)

| Upstream claim | Verdict | Backed by |
|---|---|---|
| Dribbble / Behance / Awwwards / Mobbin / TheFWA research | Kept | `WebSearch` + `av:agent-browser` |
| Envato Market (ThemeForest, CodeCanyon, GraphicRiver) | Kept | `WebSearch` (public marketplaces) |
| Photography / art direction | Kept | Knowledge + `av:ai-multimodal` generation/critique |
| CRO strategy, journey mapping | Kept | Methodology + `--domain landing` / `--domain ux` |
| A/B testing | Kept, scoped | Reworded as design method only — kit ships no experimentation platform; running/measuring tests named out of scope |
| Branding, vector/print, email design | Kept | `av:ai-multimodal`, SVG output; `av:design` noted as owner of full brand-identity work |
| 3D modeling "(conceptual understanding)" | Kept | Upstream's own hedge preserved |
| Three.js / GLSL / WebGL (10 bullets) | Kept | `av:threejs`, `av:shader` (both shipped, cited) |
| Google Fonts + Vietnamese typography | Kept | `--domain google-fonts` / `--domain typography` |

Dropped: nothing. Zero claims depend on tooling the kit does not ship; the one
soft dependency (A/B test execution) was scoped rather than cut.

## Verification

| Check | Result |
|---|---|
| `av validate --strict` | 105 skills, 16 agents, 14 hooks — all checks passed; 131 pre-existing warnings, none on changed files |
| Brand-drift grep (`ak-`, `ak:`, `ak `) on changed files | No matches |
| Reference linked from its SKILL.md | Yes (References table row) |
| Cross-skill link shape | N/A — no cross-skill links added |

## Unresolved questions

- None.
