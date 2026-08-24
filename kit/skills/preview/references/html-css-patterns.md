# CSS Patterns for HTML Diagrams

Reusable patterns for layout, connectors, theming, and visual effects in self-contained HTML diagrams.

## Theme Setup

Always define both light and dark palettes via custom properties. Start with whichever fits the chosen aesthetic, ensure both work.

**Palette cohesion rule:** Background, text, and accent colors must belong to the same color family. A warm palette (terracotta, cream, sage) should have warm grays for text-dim and warm-tinted borders — never mix warm accents with cool GitHub-gray backgrounds. Each page should feel like one intentional color story, not a generic template with an accent color dropped on top.

**Semantic color richness:** Define 5-6 semantic colors per palette, not just 3 node colors. Richer palettes give the page visual variety without clashing. Include status colors (--green, --red/danger, --amber) and secondary accents (--sage, --teal, --plum) so different sections can have distinct character while staying harmonious.

Light is the default. Dark activates via OS preference (`@media`) OR manual toggle (`[data-theme="dark"]`). The `[data-theme]` selector has higher specificity, so a manual toggle always wins.

```css
/* ── Light (default) ── */
:root {
  --font-body: 'IBM Plex Sans', system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', 'SF Mono', Consolas, monospace;

  --bg: #faf7f5;
  --surface: #ffffff;
  --surface2: #f5f0ec;
  --surface-elevated: #fff9f5;
  --border: rgba(0, 0, 0, 0.07);
  --border-bright: rgba(0, 0, 0, 0.14);
  --text: #292017;
  --text-dim: #8a7e72;
  --text-bright: #1a1510;
  --accent: #c2410c;
  --accent-dim: rgba(194, 65, 12, 0.07);

  --node-a: #c2410c;
  --node-a-dim: rgba(194, 65, 12, 0.07);
  --node-b: #4d7c0f;
  --node-b-dim: rgba(77, 124, 15, 0.07);
  --node-c: #0f766e;
  --node-c-dim: rgba(15, 118, 110, 0.07);

  --green: #4d7c0f;
  --green-dim: rgba(77, 124, 15, 0.07);
  --red: #b91c1c;
  --red-dim: rgba(185, 28, 28, 0.07);
  --amber: #b45309;
  --amber-dim: rgba(180, 83, 9, 0.07);
  --sage: #65a30d;
  --sage-dim: rgba(101, 163, 13, 0.07);
  --teal: #0f766e;
  --teal-dim: rgba(15, 118, 110, 0.07);
  --plum: #9f1239;
  --plum-dim: rgba(159, 18, 57, 0.07);
}

/* ── Dark (OS preference fallback) ── */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #1a1412;
    --surface: #231d1a;
    --surface2: #2e2622;
    --surface-elevated: #352d28;
    --border: rgba(255, 255, 255, 0.06);
    --border-bright: rgba(255, 255, 255, 0.12);
    --text: #ede5dd;
    --text-dim: #a69889;
    --text-bright: #faf5f0;
    --accent: #fb923c;
    --accent-dim: rgba(251, 146, 60, 0.12);

    --node-a: #fb923c;
    --node-a-dim: rgba(251, 146, 60, 0.12);
    --node-b: #a3e635;
    --node-b-dim: rgba(163, 230, 53, 0.1);
    --node-c: #5eead4;
    --node-c-dim: rgba(94, 234, 212, 0.1);

    --green: #a3e635;
    --green-dim: rgba(163, 230, 53, 0.1);
    --red: #fca5a5;
    --red-dim: rgba(252, 165, 165, 0.1);
    --amber: #fbbf24;
    --amber-dim: rgba(251, 191, 36, 0.1);
    --sage: #bef264;
    --sage-dim: rgba(190, 242, 100, 0.1);
    --teal: #5eead4;
    --teal-dim: rgba(94, 234, 212, 0.1);
    --plum: #fda4af;
    --plum-dim: rgba(253, 164, 175, 0.1);
  }
}

/* ── Dark (manual toggle override) ── */
[data-theme="dark"] {
  --bg: #1a1412;
  --surface: #231d1a;
  --surface2: #2e2622;
  --surface-elevated: #352d28;
  --border: rgba(255, 255, 255, 0.06);
  --border-bright: rgba(255, 255, 255, 0.12);
  --text: #ede5dd;
  --text-dim: #a69889;
  --text-bright: #faf5f0;
  --accent: #fb923c;
  --accent-dim: rgba(251, 146, 60, 0.12);

  --node-a: #fb923c;
  --node-a-dim: rgba(251, 146, 60, 0.12);
  --node-b: #a3e635;
  --node-b-dim: rgba(163, 230, 53, 0.1);
  --node-c: #5eead4;
  --node-c-dim: rgba(94, 234, 212, 0.1);

  --green: #a3e635;
  --green-dim: rgba(163, 230, 53, 0.1);
  --red: #fca5a5;
  --red-dim: rgba(252, 165, 165, 0.1);
  --amber: #fbbf24;
  --amber-dim: rgba(251, 191, 36, 0.1);
  --sage: #bef264;
  --sage-dim: rgba(190, 242, 100, 0.1);
  --teal: #5eead4;
  --teal-dim: rgba(94, 234, 212, 0.1);
  --plum: #fda4af;
  --plum-dim: rgba(253, 164, 175, 0.1);
}
```

**How it works:** `:root` = light default. `@media (prefers-color-scheme: dark)` with `:root:not([data-theme="light"])` respects OS preference unless user explicitly chose light. `[data-theme="dark"]` forces dark regardless of OS. No JS needed for the CSS — toggle button JS just sets the attribute.

**Choosing a different palette:** The above is the warm default. For other aesthetics, pick a preset from `html-design-guidelines.md` and extend it with the same semantic color structure (--green, --red, --amber, --sage, --teal, --plum). Every preset in that file defines the core variables; add the semantic layer on top to maintain richness. When using a different preset, replicate the three-tier pattern above (`:root` light, `@media` dark with `:not([data-theme="light"])`, `[data-theme="dark"]` override).

## Theme Toggle Button (MANDATORY)

**MUST include a theme toggle button in EVERY generated HTML page. This is non-negotiable — pages without the toggle are considered incomplete.** Place it fixed in the top-right corner.

### CSS

```css
.theme-toggle {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 300;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-dim);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition: background 0.15s, color 0.15s;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.theme-toggle:hover {
  background: var(--surface2);
  color: var(--text);
}
```

### HTML + JS

Place the button as the first child of `<body>`. The script detects OS preference on load and persists manual choice in `localStorage`.

```html
<button class="theme-toggle" id="themeToggle" title="Toggle theme" aria-label="Toggle light/dark theme"></button>

<script>
(function() {
  var toggle = document.getElementById('themeToggle');
  var saved = localStorage.getItem('theme');
  var initial = saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  if (saved) document.documentElement.setAttribute('data-theme', initial);
  toggle.textContent = initial === 'dark' ? '\u2600' : '\u263E';
  toggle.addEventListener('click', function() {
    var current = document.documentElement.getAttribute('data-theme')
      || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    toggle.textContent = next === 'dark' ? '\u2600' : '\u263E';
  });
})();
</script>
```

**Symbols:** `\u2600` = sun (shown in dark mode — click to go light), `\u263E` = moon (shown in light mode — click to go dark). No emoji — these are Unicode dingbats that render consistently across platforms.

## Typography Floor

Minimum readable font sizes for generated HTML pages. Smaller sizes strain readability, especially on high-DPI screens.

| Element | Minimum | Recommended |
|---------|---------|-------------|
| Body / card content | 15px | 15–16px |
| Code blocks | 14px | 14px |
| Table cells | 14px | 14–15px |
| Table headers (mono uppercase) | 12px | 12px |
| List items | 14px | 15px |
| Section labels (mono uppercase) | 11px | 12px |
| Card labels (mono uppercase) | 11px | 11px |
| Status badges (mono) | 12px | 12px |
| TOC links | 11px | 12px |
| Callout body | 15px | 16px |

Monospace uppercase labels are allowed at 11px because letter-spacing and uppercase improve legibility at small sizes. Body text and content must stay at 14px+.

## Background Atmosphere

Flat backgrounds feel dead. Use subtle gradients or patterns.

```css
/* Radial glow behind focal area */
body {
  background: var(--bg);
  background-image: radial-gradient(ellipse at 50% 0%, var(--accent-dim) 0%, transparent 60%);
}

/* Faint dot grid */
body {
  background-color: var(--bg);
  background-image: radial-gradient(circle, var(--border) 1px, transparent 1px);
  background-size: 24px 24px;
}

/* Diagonal subtle lines */
body {
  background-color: var(--bg);
  background-image: repeating-linear-gradient(
    -45deg, transparent, transparent 40px,
    var(--border) 40px, var(--border) 41px
  );
}

/* Gradient mesh (pick 2-3 positioned radials) */
body {
  background: var(--bg);
  background-image:
    radial-gradient(at 20% 20%, var(--node-a-dim) 0%, transparent 50%),
    radial-gradient(at 80% 60%, var(--node-b-dim) 0%, transparent 50%);
}
```

## Link Styling

**Never rely on browser default link colors.** The default blue (`#0000EE`) has poor contrast on dark backgrounds. Style links with `color: var(--accent)` and keep underlines for discoverability. On dark backgrounds, use bright accents from the palette (`--node-a`, `--teal`, `--sage`). On light backgrounds, use deeper tones (`--accent`, `--node-b`, `--node-c`). Always use palette variables — never hardcode hex values for links.

## Section / Card Components

The fundamental building block. A colored card representing a system component, pipeline step, or data entity.

**IMPORTANT: Never use `.node` as a CSS class name.** Mermaid.js internally uses `.node` on its SVG `<g>` elements with `transform: translate(x, y)` for positioning. Any page-level `.node` styles (hover transforms, box-shadows, transitions) will leak into Mermaid diagrams and break their layout. Use `.ve-card` instead (namespaced to avoid collisions with CSS frameworks like Bootstrap/Tailwind that also use `.card`).

```css
.ve-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px 20px;
  position: relative;
}

/* Colored accent border (left or top) */
.ve-card--accent-a {
  border-left: 3px solid var(--node-a);
}

/* --- Depth tiers: vary card depth to signal importance --- */

/* Elevated: KPIs, key sections, anything that should pop */
.ve-card--elevated {
  background: var(--surface-elevated);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
}

/* Recessed: code blocks, secondary content, detail panels */
.ve-card--recessed {
  background: color-mix(in srgb, var(--bg) 70%, var(--surface) 30%);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.06);
  border-color: var(--border);
}

/* Hero: executive summaries, focal elements — demands attention */
.ve-card--hero {
  background: color-mix(in srgb, var(--surface) 92%, var(--accent) 8%);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);
  border-color: color-mix(in srgb, var(--border) 50%, var(--accent) 50%);
}

/* Glass: special-occasion overlay effect (use sparingly) */
.ve-card--glass {
  background: color-mix(in srgb, var(--surface) 60%, transparent 40%);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-color: rgba(255, 255, 255, 0.1);
}

/* Section label (monospace, uppercase) */
.ve-card__label {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: var(--node-a);
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Colored dot indicator */
.ve-card__label::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}
```

## Code Blocks

Code blocks need explicit whitespace preservation and a max-height constraint. Without these, code runs together and long files overwhelm the page.

### Basic Pattern

```css
.code-block {
  font-family: var(--font-mono);
  font-size: 14px;
  line-height: 1.5;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  overflow-x: auto;
  /* CRITICAL: preserve line breaks and indentation */
  white-space: pre-wrap;
  word-break: break-word;
}

/* Constrain height for long code */
.code-block--scroll {
  max-height: 400px;
  overflow-y: auto;
}
```

```html
<pre class="code-block code-block--scroll"><code>// Your code here
function example() {
  return true;
}</code></pre>
```

### With File Header

```css
.code-file {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.code-file__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-dim);
}

.code-file__body {
  font-family: var(--font-mono);
  font-size: 14px;
  line-height: 1.5;
  padding: 16px;
  background: var(--surface-elevated);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 500px;
  overflow: auto;
}
```

```html
<div class="code-file">
  <div class="code-file__header">
    <span>src/extension.ts</span>
  </div>
  <pre class="code-file__body"><code>export function activate() {
  // ...
}</code></pre>
</div>
```

### Implementation Plans: Don't Dump Full Files

For implementation plans and architecture docs, **don't display entire source files inline**. Instead:

1. **Show structure, not code:**
   ```html
   <div class="file-structure">
     <div class="file-structure__path">src/extension.ts</div>
     <ul class="file-structure__outline">
       <li><code>activate()</code> — Entry point</li>
       <li><code>clearState()</code> — Reset extension state</li>
     </ul>
   </div>
   ```

2. **Use collapsible sections for full code:**
   ```html
   <details class="collapsible">
     <summary>Full implementation (87 lines)</summary>
     <pre class="code-file__body"><code>...</code></pre>
   </details>
   ```

3. **Show key snippets only** — the 5-10 lines illustrating core logic.

**Anti-patterns:**
- Displaying full source files inline (100+ lines overwhelming the page)
- Code blocks without `white-space: pre-wrap` (code runs together)
- No height constraint on long code (page becomes endless scroll)

## Directory Tree

For file structures, use `<pre>` with monospace + `white-space: pre`. Tree connectors (`├──`, `└──`, `│`) only work when vertically aligned.

```css
.dir-tree {
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.7;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px 20px;
  overflow-x: auto;
  white-space: pre;
}

.dir-tree .ann { color: var(--text-dim); font-size: 11px; font-style: italic; }
.dir-tree .hl  { color: var(--accent); font-weight: 600; }
```

```html
<pre class="dir-tree">my-project/
├── src/
│   ├── <span class="hl">index.ts</span>       <span class="ann">— entry point</span>
│   └── utils/
└── README.md</pre>
```

**Never** render tree connectors inside wrapping text, flex children, or grid items — vertical pipes lose alignment and the hierarchy becomes unreadable.

## Overflow Protection

Grid and flex children default to `min-width: auto`, which prevents them from shrinking below their content width.

### Global rules

```css
/* Every grid/flex child must be able to shrink */
.grid > *, .flex > *,
[style*="display: grid"] > *,
[style*="display: flex"] > * {
  min-width: 0;
}

/* Long text wraps instead of overflowing */
body {
  overflow-wrap: break-word;
}
```

### Side-by-side comparison panels

```css
.comparison {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.comparison > * {
  min-width: 0;
  overflow-wrap: break-word;
}

@media (max-width: 768px) {
  .comparison { grid-template-columns: 1fr; }
}
```

### Never use `display: flex` on `<li>` for marker characters

Using `display: flex` on a list item creates an anonymous flex item for the remaining text. That anonymous item gets `min-width: auto` and you **cannot** set `min-width: 0` on anonymous boxes. Lines with many inline `<code>` badges will overflow with no CSS fix possible.

Use absolute positioning for markers instead:

```css
/* WRONG — causes overflow with inline code badges */
li {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
li::before {
  content: '›';
  flex-shrink: 0;
}

/* RIGHT — text wraps normally */
li {
  padding-left: 14px;
  position: relative;
}
li::before {
  content: '›';
  position: absolute;
  left: 0;
}
```

### List markers overlapping container borders

```css
/* RIGHT — use inside positioning or adequate padding */
.card ol, .card ul {
  list-style-position: inside;
}

/* OR — adequate padding for outside markers */
.card ol, .card ul {
  padding-left: 2em;
}

/* OR — custom markers with absolute positioning */
.card ol {
  list-style: none;
  padding-left: 0;
  counter-reset: item;
}
.card ol li {
  counter-increment: item;
  padding-left: 2em;
  position: relative;
}
.card ol li::before {
  content: counter(item) ".";
  position: absolute;
  left: 0;
  color: var(--accent);
  font-weight: 600;
}
```

**Rule of thumb:** Any `<ol>` or `<ul>` inside a bordered container needs either `list-style-position: inside` or `padding-left: 2em` minimum.

## Mermaid Containers

Mermaid diagrams have two common layout issues: they render too small to read, and they left-align leaving awkward dead space.

### Centering (Required)

```css
/* WRONG — diagram hugs left edge */
.mermaid-container {
  padding: 24px;
  border: 1px solid var(--border);
}

/* RIGHT — diagram centers in container */
.mermaid-wrap {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 24px;
  border: 1px solid var(--border);
}
```

### Scaling Small Diagrams

**1. Increase fontSize in themeVariables** (most effective):
```javascript
mermaid.initialize({
  theme: 'base',
  themeVariables: {
    fontSize: '18px',  // default 16px, bump to 18-20px for complex diagrams
  }
});
```

**2. CSS zoom** for diagrams that still render too small:
```css
.mermaid-wrap--scaled .mermaid {
  zoom: 1.3;
}
```

**3. Constrain container width** so the diagram doesn't float in dead space:
```css
.mermaid-wrap--constrained {
  max-width: 800px;
  margin: 0 auto;
}
```

**Rule of thumb:** If the diagram has 10+ nodes or text is smaller than 12px rendered, increase fontSize to 18-20px or apply CSS zoom.

### Zoom Controls — Full Pattern

Add zoom controls to every `.mermaid-wrap` container.

```css
.mermaid-wrap {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 32px 24px;
  overflow: auto;
  /* CRITICAL: center the diagram */
  display: flex;
  justify-content: center;
  align-items: center;
  /* Prevent vertical flowcharts from compressing */
  min-height: 400px;
}

.mermaid-wrap--compact { min-height: 200px; }
.mermaid-wrap--tall { min-height: 600px; }

.zoom-controls {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 2px;
  z-index: 10;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 2px;
}

.zoom-controls button {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 14px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, color 0.15s ease;
}

.zoom-controls button:hover {
  background: var(--border);
  color: var(--text);
}

.mermaid-wrap { cursor: grab; }
.mermaid-wrap.is-panning { cursor: grabbing; user-select: none; }

/* Multi-diagram structure */
.diagram-shell {
  position: relative;
}

.diagram-shell__hint {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-dim);
  margin-bottom: 8px;
  opacity: 0.7;
}

.mermaid-viewport {
  position: relative;
  overflow: hidden;
  width: 100%;
  height: 100%;
  min-height: 300px;
}

.mermaid-canvas {
  position: absolute;
  top: 0;
  left: 0;
}

.zoom-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
  padding: 0 6px;
  white-space: nowrap;
}
```

**How the zoom/pan engine works:** The SVG is rendered into `.mermaid-canvas` which is absolutely positioned inside `.mermaid-viewport`. Zooming sets the SVG's `width` and `height` styles directly. Panning applies `transform: translate()` to the canvas. The viewport has `overflow: hidden` to clip panned content.

### HTML Structure

```html
<section class="diagram-shell">
  <p class="diagram-shell__hint">
    Ctrl/Cmd + wheel to zoom. Scroll to pan. Drag to pan when zoomed. Double-click to fit.
  </p>
  <div class="mermaid-wrap">
    <div class="zoom-controls">
      <button type="button" data-action="zoom-in" title="Zoom in">+</button>
      <button type="button" data-action="zoom-out" title="Zoom out">&minus;</button>
      <button type="button" data-action="zoom-fit" title="Smart fit">&#8634;</button>
      <button type="button" data-action="zoom-one" title="1:1 zoom">1:1</button>
      <button type="button" data-action="zoom-expand" title="Open full size">&#x26F6;</button>
      <span class="zoom-label">Loading...</span>
    </div>
    <div class="mermaid-viewport">
      <div class="mermaid mermaid-canvas"></div>
    </div>
  </div>
  <script type="text/plain" class="diagram-source">
    graph TD
      A --> B
  </script>
</section>
```

Use one `.diagram-shell` per diagram. The source Mermaid text lives in `<script type="text/plain" class="diagram-source">`, so multiple diagrams can coexist without ID collisions.

### JavaScript (Closure-Based)

```javascript
const config = { /* fitPadding, zoom bounds, readabilityFloor */ };
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
let activeDrag = null;

addEventListener('mousemove', (e) => activeDrag?.onMove(e));
addEventListener('mouseup', () => { activeDrag?.onEnd(); activeDrag = null; });

function initDiagram(shell) {
  const wrap = shell.querySelector('.mermaid-wrap');
  const viewport = shell.querySelector('.mermaid-viewport');
  const canvas = shell.querySelector('.mermaid-canvas');
  const source = shell.querySelector('.diagram-source');
  const label = shell.querySelector('.zoom-label');

  if (!wrap || !viewport || !canvas || !source || !label) {
    console.error('initDiagram: missing required elements in', shell);
    return;
  }

  // Per-diagram state in closure
  let zoom = 1;
  let panX = 0;
  let panY = 0;

  async function render() {
    try {
      const code = source.textContent.trim();
      if (!code) { label.textContent = 'Error: Empty source'; return; }
      const id = 'diagram-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const { svg } = await mermaid.render(id, code);
      canvas.innerHTML = svg;
      // wire controls, fit, zoom/pan/touch handlers scoped to this shell
    } catch (err) {
      console.error('Mermaid render failed:', err);
      label.textContent = 'Error: ' + (err.message || 'Render failed');
    }
  }

  render();
}

document.querySelectorAll('.diagram-shell').forEach(initDiagram);
```

This pattern removes all hardcoded IDs and supports unlimited diagrams per page. For the full implementation (smart fit, pinch zoom, shared drag state), use the full template from the skill's `templates/` directory.

**⚠️ Never use bare `<pre class="mermaid">`.** It renders but has no zoom/pan controls — diagrams become tiny and unusable. Always use the full `diagram-shell` pattern above.
