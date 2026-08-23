# HTML Output Mode (`--html`)

What `plan.html` must contain and look like when `--html` is present. Read
when the invocation carries `--html`; the artifact and layout rules in
`plan-organization.md` and `output-standards.md` still apply.

When `--html` is present, activate `/av:frontend-design` before composing the
HTML artifact. If `av:frontend-design` requires design intelligence, follow its
`av:ui-ux-pro-max` activation rule before styling.

**Artifact rules:**
- Write the primary output as `plan.html` in the selected plan directory.
- The HTML file must be self-contained: inline CSS and JavaScript, no build
  step, no network-required assets.
- If generated image assets are used, embed selected images as data URIs so
  `plan.html` remains portable; keep source images under `{plan-dir}/assets/`
  for review only.
- Generate `plan.html` after red-team and validation gates so the HTML reflects
  the final reviewed plan. Markdown files produced for gate compatibility are
  not the user-facing deliverable in this mode.
- If another workflow requires `plan.md` (for example `--github`), keep
  `plan.md` as a concise index that points to `plan.html`; do not duplicate the
  full plan body unless a downstream `/av:cook` handoff explicitly needs it.
- Include accessible responsive UI, keyboard-friendly controls, and reduced
  motion handling.

**Content requirements:**
- Plan overview and phase roadmap.
- Main page must show a concise outline summary for every phase: title, status,
  priority, dependencies, objective, 3-6 key bullets, related files,
  success criteria highlights, and test/validation gate when known.
- Each phase outline must open a detail modal rendering the full phase markdown:
  headings, lists, checkboxes, tables, fenced code, inline code, blockquotes,
  links, horizontal rules, and frontmatter metadata. Escape raw HTML unless a
  trusted sanitizer is bundled inline.
- User flows.
- **Implementation workflow diagram (required):** at least one visual diagram
  (flowchart, sequence, or architecture) rendered inline in HTML/CSS/SVG/Canvas
  that shows what will be built and the phase/dependency flow. Under `--html`
  this is mandatory, not optional.
- **UI/UX mockups with annotations (required when the plan touches UI/UX):**
  embed annotated visual mockups of the proposed screens or components directly
  in `plan.html` so the user previews the intended interface before
  implementation. Derive layout, color, type, spacing, and component states from
  the project design guidelines (`docs/design-guidelines.md` when present,
  otherwise the built-in editorial contract below). Annotate each mockup with
  callouts tying elements to design tokens, interaction states, and the
  acceptance criteria they satisfy.
- Other diagrams and charts rendered directly in HTML/CSS/SVG/Canvas when useful.
- Interactive affordances such as tabs, filters, expandable risks, or chart
  toggles when useful.
- Citations as visible URLs for external sources, GitHub issues, docs, and
  any web references used.
- Open questions section; write "None" when there are no unresolved questions.

**Generated illustration requirements:**
- If `imagegen`, built-in `image_gen`, or `create_image` is available, generate
  1-3 raster illustrations for the HTML.
- Prompt style: technical sketch, watercolor wash, hand-drawn engineering
  notebook, ink linework, warm paper, muted red/gold accents, no text, no logo,
  no watermark.
- If image generation is unavailable or fails, continue with typographic
  diagrams / CSS-only structure and state the limitation in the final response.

**Design direction:**
- Use the editorial magazine style contract from the user's supplied guideline
  when present; otherwise use this built-in contract.
- Use warm paper `#faf7f2`, paper panels `#f0ebe1`, ink `#0a0a0a`, muted
  `#6b6258`, accent red `#b8232c`, hairline dividers, serif display, mono
  labels, and restrained sans body.
- Use print-editorial structure: cover section, running mono slide tags/folios,
  generous whitespace, asymmetric grids, rule lines, pull quotes, stat bands,
  and fixed nav dots when useful.
- Avoid gradients, drop shadows, rounded cards, pure white backgrounds, generic
  SaaS styling, decorative bokeh/orbs, emoji icons, and hidden instructions.
- Use accent only for italic serif emphasis, eyebrows, active states, left
  rules, and small data highlights. Include subtle CSS paper grain.
- Keep typography readable on mobile and desktop; no horizontal scrolling.

## Combined `--html --github`

`plan.html` is the authoritative plan. Create a short companion `plan.md` index
only to satisfy the GitHub issue's stable `plan.md` link requirement. The issue
must include both relative links.
