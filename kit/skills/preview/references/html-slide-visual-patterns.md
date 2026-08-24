
## Decorative SVG Elements

Inline SVG accents lift slides from functional to editorial. Use sparingly — one or two per slide, never on every slide.

### Corner Accent

```html
<svg class="slide__decor slide__decor--corner" width="120" height="120" viewBox="0 0 120 120">
  <line x1="120" y1="0" x2="120" y2="40" stroke="var(--accent)" stroke-width="2" opacity="0.2"/>
  <line x1="80" y1="0" x2="120" y2="0" stroke="var(--accent)" stroke-width="2" opacity="0.2"/>
</svg>
```

```css
.slide__decor {
  position: absolute;
  pointer-events: none;
  z-index: 0;
}

.slide__decor--corner {
  top: 0;
  right: 0;
}
```

### Section Divider Mark

```html
<svg class="slide__decor slide__decor--divider" width="200" height="20" viewBox="0 0 200 20">
  <line x1="0" y1="10" x2="85" y2="10" stroke="var(--accent)" stroke-width="1" opacity="0.3"/>
  <rect x="92" y="3" width="14" height="14" transform="rotate(45 99 10)" fill="none" stroke="var(--accent)" stroke-width="1" opacity="0.3"/>
  <line x1="115" y1="10" x2="200" y2="10" stroke="var(--accent)" stroke-width="1" opacity="0.3"/>
</svg>
```

### Geometric Background Pattern

```css
/* Faint grid dots behind a slide */
.slide--with-grid::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle, var(--border) 1px, transparent 1px);
  background-size: 32px 32px;
  opacity: 0.5;
  pointer-events: none;
  z-index: 0;
}
```

### Per-Slide Background Variation

Vary gradient direction across slides to create visual rhythm.

```css
.slide:nth-child(odd) {
  background-image: radial-gradient(ellipse at 20% 80%, var(--accent-dim) 0%, transparent 50%);
}

.slide:nth-child(even) {
  background-image: radial-gradient(ellipse at 80% 20%, var(--accent-dim) 0%, transparent 50%);
}
```

---

## Proactive Imagery

Slides should reach for visuals before defaulting to text alone.

**AI image generation:** If `/av:ai-multimodal` skill is available, use it to generate images for the deck. For any deck over 10 slides, target a minimum of 2–4 images. Priority order:

1. **Title slide** (always): background image that sets the deck's visual tone. Use 16:9 aspect ratio. Match the topic and palette.
2. **Full-bleed slide** (always if deck has one): immersive background for the deck's visual anchor moment.
3. **Content slides with conceptual topics** (1–2 if the deck has room): illustration in the `.slide__aside` area. Use 1:1 aspect ratio.

**Generate images before writing HTML** so they're ready to embed as base64 data URIs:

```bash
# Use /av:ai-multimodal skill for image generation if needed
# Embed result as: <div class="slide__bg" style="background-image:url('data:image/png;base64,...')"></div>
```

**Prompt craft for slides:** Be specific about style, dominant colors, and mood. Pull colors from the preset's CSS variables. Examples:
- Terminal Mono: "dark abstract circuit board pattern, green traces on near-black, minimal, technical"
- Midnight Editorial: "deep navy abstract composition, warm gold accent light, cinematic depth of field"
- Warm Signal: "warm cream textured paper with terracotta geometric accents, confident modern design"

**When image generation isn't available:** Degrade gracefully to CSS gradients and SVG decorations. Use the `.slide__bg--gradient` pattern with bold `linear-gradient` or `radial-gradient` backgrounds. Note the fallback in an HTML comment (`<!-- image generation unavailable, using CSS gradient fallback -->`).

**Inline data visualizations:** Proactively add SVG sparklines next to numbers, mini-charts on dashboard slides, and small Mermaid diagrams on split slides. A number with a sparkline next to it tells a better story than a number alone.

---

## Compositional Variety

Consecutive slides must vary their spatial approach. Three centered slides in a row means push one off-axis.

**Composition patterns to alternate between:**
- Centered (title slides, quotes)
- Left-heavy: content on the left 60%, breathing room on the right
- Right-heavy: content on the right 60%, visual or whitespace on the left
- Edge-aligned: content pushed to bottom or top, large empty space opposite
- Split: two distinct panels filling the viewport
- Full-bleed: background dominates, minimal overlaid text

Plan the slide sequence considering layout rhythm, not just content order. Assign a composition to each slide before writing HTML.

---

## Presentation Readability

Slides get projected, screen-shared, viewed at distance:

- **Minimum body text: 16px.** Nothing smaller except labels and captions.
- **One focal point per slide.** Not three competing elements.
- **Higher contrast than pages.** Dimmed text (`--text-dim`) should still be easily readable at distance.
- **Nav chrome opacity.** Dots and progress bar must be visible on any slide background. Use the backdrop blur or text-shadow approach from the Nav Chrome section.
- **Simpler Mermaid diagrams.** Max 8–10 nodes, 18px+ labels, 2px+ edges.

---

## Content Density Limits

Each slide must fit in exactly 100dvh. If content exceeds these limits, split across multiple slides — never scroll within a slide.

| Slide type | Max content |
|-----------|-------------|
| Title | 1 heading + 1 subtitle |
| Section Divider | 1 number + 1 heading + optional subhead |
| Content | 1 heading + 5–6 bullets (max 2 lines each) |
| Split | 1 heading + 2 panels, each follows its inner type's limits |
| Diagram | 1 heading + 1 Mermaid diagram (max 8–10 nodes) |
| Dashboard | 1 heading + 6 KPI cards. Hero values ≤6 chars. |
| Table | 1 heading + 8 rows; overflow paginates to next slide |
| Code | 1 heading + 10 lines of code |
| Quote | 1 short quote (~25 words / ~150 chars max) + 1 attribution |
| Full-Bleed | 1 heading + 1 subtitle over background |

---

## Responsive Height Breakpoints

Height-based scaling is more critical for slides than width.

```css
/* Compact viewports */
@media (max-height: 700px) {
  .slide {
    padding: clamp(24px, 4vh, 40px) clamp(32px, 6vw, 80px);
  }
  .slide__display { font-size: clamp(36px, 8vw, 72px); }
  .slide--divider .slide__number { font-size: clamp(80px, 16vw, 160px); }
}

/* Small tablets / landscape phones */
@media (max-height: 600px) {
  .slide__decor { display: none; }
  .slide--quote { padding: clamp(32px, 6vh, 60px) clamp(40px, 8vw, 100px); }
  .slide__quote-mark { display: none; }
}

/* Aggressive: landscape phones */
@media (max-height: 500px) {
  .slide {
    padding: clamp(16px, 3vh, 24px) clamp(24px, 5vw, 48px);
  }
  .deck-dots { display: none; }
  .slide__display { font-size: clamp(28px, 7vw, 48px); }
}

/* Width breakpoint for grids */
@media (max-width: 768px) {
  .slide--content .slide__inner { grid-template-columns: 1fr; }
  .slide--content .slide__aside { display: none; }
  .slide--split .slide__panels { grid-template-columns: 1fr; }
  .slide--dashboard .slide__kpis { grid-template-columns: repeat(2, 1fr); }
}
```

---

## Curated Presets

Starting points to riff on. Each defines a font pairing, palette, and background treatment. Different decks with the same preset should still feel distinct.

### Midnight Editorial

Deep navy, serif display, warm gold accents. Cinematic, premium. Dark-first.

```css
:root {
  --font-body: 'Instrument Serif', Georgia, serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', monospace;
  --bg: #0f1729;
  --surface: #162040;
  --surface2: #1d2b52;
  --surface-elevated: #243362;
  --border: rgba(200, 180, 140, 0.08);
  --border-bright: rgba(200, 180, 140, 0.16);
  --text: #e8e4d8;
  --text-dim: #9a9484;
  --accent: #d4a73a;
  --accent-dim: rgba(212, 167, 58, 0.1);
  --code-bg: #0a0f1e;
  --code-text: #d4d0c4;
}
@media (prefers-color-scheme: light) {
  :root {
    --bg: #faf8f2;
    --surface: #ffffff;
    --surface2: #f5f0e6;
    --surface-elevated: #fffdf5;
    --border: rgba(30, 30, 50, 0.08);
    --border-bright: rgba(30, 30, 50, 0.16);
    --text: #1a1814;
    --text-dim: #7a7468;
    --accent: #b8860b;
    --accent-dim: rgba(184, 134, 11, 0.08);
    --code-bg: #2a2520;
    --code-text: #e8e4d8;
  }
}
```

Background: radial gold glow at top center. Decorative corner marks in gold.

### Warm Signal

Cream paper, bold sans, terracotta/coral accents. Confident and modern. Light-first.

```css
:root {
  --font-body: 'Plus Jakarta Sans', system-ui, sans-serif;
  --font-mono: 'Azeret Mono', 'SF Mono', monospace;
  --bg: #faf6f0;
  --surface: #ffffff;
  --surface2: #f5ece0;
  --surface-elevated: #fffdf5;
  --border: rgba(60, 40, 20, 0.08);
  --border-bright: rgba(60, 40, 20, 0.16);
  --text: #2c2a25;
  --text-dim: #7c756a;
  --accent: #c2410c;
  --accent-dim: rgba(194, 65, 12, 0.08);
  --code-bg: #2c2520;
  --code-text: #f5ece0;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1c1916;
    --surface: #262220;
    --surface2: #302b28;
    --surface-elevated: #3a3430;
    --border: rgba(200, 180, 160, 0.08);
    --border-bright: rgba(200, 180, 160, 0.16);
    --text: #f0e8dc;
    --text-dim: #a09888;
    --accent: #e85d2a;
    --accent-dim: rgba(232, 93, 42, 0.1);
    --code-bg: #141210;
    --code-text: #f0e8dc;
  }
}
```

Background: warm radial glow at bottom left. Terracotta accent borders on cards.

### Terminal Mono

Dark, monospace everything, green/cyan accents, faint grid. Developer-native. Dark-first.

```css
:root {
  --font-body: 'Geist Mono', 'SF Mono', Consolas, monospace;
  --font-mono: 'Geist Mono', 'SF Mono', Consolas, monospace;
  --bg: #0a0e14;
  --surface: #12161e;
  --surface2: #1a1f2a;
  --surface-elevated: #222836;
  --border: rgba(80, 250, 123, 0.06);
  --border-bright: rgba(80, 250, 123, 0.12);
  --text: #c8d6e5;
  --text-dim: #5a6a7a;
  --accent: #50fa7b;
  --accent-dim: rgba(80, 250, 123, 0.08);
  --code-bg: #060a10;
  --code-text: #c8d6e5;
}
@media (prefers-color-scheme: light) {
  :root {
    --bg: #f4f6f8;
    --surface: #ffffff;
    --surface2: #eaecf0;
    --surface-elevated: #f8f9fa;
    --border: rgba(0, 80, 40, 0.08);
    --border-bright: rgba(0, 80, 40, 0.16);
    --text: #1a2332;
    --text-dim: #5a6a7a;
    --accent: #0d7a3e;
    --accent-dim: rgba(13, 122, 62, 0.08);
    --code-bg: #1a2332;
    --code-text: #c8d6e5;
  }
}
```

Background: faint dot grid. Everything monospace.

### Swiss Clean

White, geometric sans, single bold accent, visible grid. Minimal and precise. Light-first.

```css
:root {
  --font-body: 'DM Sans', system-ui, sans-serif;
  --font-mono: 'Fira Code', 'SF Mono', monospace;
  --bg: #ffffff;
  --surface: #f8f8f8;
  --surface2: #f0f0f0;
  --surface-elevated: #ffffff;
  --border: rgba(0, 0, 0, 0.08);
  --border-bright: rgba(0, 0, 0, 0.16);
  --text: #111111;
  --text-dim: #666666;
  --accent: #0055ff;
  --accent-dim: rgba(0, 85, 255, 0.06);
  --code-bg: #18181b;
  --code-text: #e4e4e7;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #111111;
    --surface: #1a1a1a;
    --surface2: #222222;
    --surface-elevated: #2a2a2a;
    --border: rgba(255, 255, 255, 0.08);
    --border-bright: rgba(255, 255, 255, 0.16);
    --text: #f0f0f0;
    --text-dim: #888888;
    --accent: #3b82f6;
    --accent-dim: rgba(59, 130, 246, 0.08);
    --code-bg: #0a0a0a;
    --code-text: #e4e4e7;
  }
}
```

Background: subtle grid lines. Typography is geometric and precise.
