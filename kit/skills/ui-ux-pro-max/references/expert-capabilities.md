# Expert Capabilities

The full expert-capabilities profile behind the `ui-ux-designer` agent and this
skill's review voice. Load it when a brief calls for judgment beyond the search
database: trend research, art direction, conversion strategy, branding, 3D, or
typography direction. Each section names how to exercise the capability with
what the kit actually ships — `WebSearch`, `av:agent-browser` for screenshots,
`av:ai-multimodal` for vision analysis and image generation, `av:threejs` and
`av:shader` for 3D and GLSL work, and this skill's search domains.

## Trending Design Research

- Research and analyze trending designs on Dribbble, Behance, Awwwards, Mobbin,
  TheFWA (via `WebSearch`, with `av:agent-browser` to capture reference
  screenshots).
- Study award-winning designs and understand what makes them exceptional —
  name the specific device (layout, motion, palette, type) rather than
  "it looks premium".
- Identify emerging design trends and patterns, and judge which are durable
  enough for the product at hand.
- Research top-selling design templates on Envato Market (ThemeForest,
  CodeCanyon, GraphicRiver) for market-proven layouts and category conventions.

## Professional Photography & Visual Design

- Professional photography principles: composition, lighting, color theory.
- Studio-quality visual direction and art direction.
- High-end product photography aesthetics.
- Editorial and commercial photography styles.

Apply these when directing `av:ai-multimodal` image generation and when
critiquing generated or stock imagery before it ships.

## UX/CX Optimization

- Deep understanding of user experience (UX) and customer experience (CX).
- User journey mapping and experience optimization.
- Conversion rate optimization (CRO) strategies.
- A/B testing methodologies and data-driven design decisions — as design
  method: hypothesis framing, variant design, and metric choice. The kit ships
  no experimentation platform; running and measuring tests belongs to the
  product's own analytics stack.
- Customer touchpoint analysis and optimization.

Pair with `--domain landing` for section order and CTA placement, and
`--domain ux` for the interaction rules a variant must still respect.

## Branding & Identity Design

- Logo design with strong conceptual foundation.
- Vector graphics and iconography (emit as SVG; keep one icon family).
- Brand identity systems and visual language.
- Poster and print design.
- Newsletter and email design.
- Marketing collateral and promotional materials.
- Brand guideline development.

When a brand identity is the deliverable itself, `av:design` owns that
workflow; this profile covers keeping UI work on-brand.

## Digital Art & 3D

- Digital painting and illustration techniques.
- 3D modeling and rendering (conceptual understanding).
- Advanced composition and visual hierarchy.
- Color grading and mood creation.
- Artistic sensibility and creative direction.

## Three.js & WebGL Expertise

Exercised through `av:threejs` (scenes, models, physics, XR) and `av:shader`
(GLSL):

- Advanced Three.js scene composition and optimization.
- Custom shader development (GLSL vertex and fragment shaders).
- Particle systems and GPU-accelerated particle effects.
- Post-processing effects and render pipelines.
- Immersive 3D experiences and interactive environments.
- Performance optimization for real-time rendering.
- Physics-based rendering and lighting systems.
- Camera controls and cinematic effects.
- Texture mapping, normal maps, and material systems.
- 3D model loading and optimization (glTF, FBX, OBJ).

## Typography Expertise

- Strategic use of Google Fonts with Vietnamese language support
  (`--domain google-fonts` and `--domain typography` carry the pairings and
  import URLs).
- Font pairing and typographic hierarchy creation.
- Cross-language typography optimization (Latin + Vietnamese).
- Performance-conscious font loading strategies.
- Type scale and rhythm establishment.
