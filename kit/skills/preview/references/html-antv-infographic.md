# AntV Infographics (CDN)

Use this file when the ask is an **infographic** — a poster-shaped page whose job
is to make a handful of numbers land, not to render a dashboard or a diagram.
`html-libraries.md` is the general CDN reference and stays the default; this file
is the one extra entry it does not cover, and the two are meant to be read
together.

An infographic here is a single self-contained HTML page built from three things:
oversized stat callouts in CSS, one or two AntV G2 charts, and generous
whitespace between them. Everything else on the page is authored CSS — AntV is
brought in only for the chart marks.

## When this mode applies

| Signal | Mode |
|---|---|
| "Infographic", "poster", "one-pager", "make these numbers land" | This file |
| A dashboard with many small charts | `html-libraries.md` → Chart.js |
| Boxes and arrows, a flow, a state machine | `html-libraries.md` → Mermaid.js |
| A publish-grade editorial diagram from the vendored template system | `/av:diagram` |

Invocation is `/av:preview --html --explain <topic>` with this file loaded
alongside the HTML references — there is no separate `--infographic` flag, and
none of the argument resolution in `../SKILL.md` changes.

---

## AntV G2 — Infographic Charts

Use for the one or two statement-making charts an infographic is built around:
a ranked bar, a share-of-total donut, a trend line, a small-multiple row. G2's
spec API is declarative enough that the whole chart is one object, which keeps a
generated page readable.

Do NOT use for dashboards with six charts on a grid — Chart.js is lighter and
`html-libraries.md` already carries its theming. Do NOT use G6, X6, or L7 from
this file: relationship graphs belong to Mermaid or `/av:diagram`, and a map is
out of preview's scope.

**CDN:**
```html
<script src="https://cdn.jsdelivr.net/npm/@antv/g2@5/dist/g2.min.js"></script>

<div class="ve-figure"><div id="share"></div></div>

<script>
  const data = [
    { area: 'Adapt engine', pct: 41 },
    { area: 'Install path', pct: 27 },
    { area: 'Hooks', pct: 19 },
    { area: 'CLI surface', pct: 13 },
  ];

  const chart = new G2.Chart({ container: 'share', autoFit: true, height: 320 });

  chart.options({
    type: 'interval',
    data,
    encode: { x: 'area', y: 'pct', color: 'area' },
    axis: { y: { labelFormatter: (d) => `${d}%` } },
    legend: false,
  });

  chart.render();
</script>
```

The UMD build exposes a single global, `G2`. Load it before any inline script
that constructs a chart.

### Deep Theming

G2 ships `classicDark`, so the theme switch is a theme name plus the page's own
`viewFill` — do not restyle axes by hand. Read the mode the same way every other
preview page does, and re-render on the theme toggle so a chart drawn in light
mode does not survive the switch:

```js
const themeFor = (dark) => ({
  type: dark ? 'classicDark' : 'classic',
  view: { viewFill: 'transparent' },
  color: dark ? '#818cf8' : '#4f46e5',
});

const spec = (dark) => ({
  type: 'interval',
  data,
  encode: { x: 'area', y: 'pct', color: 'area' },
  theme: themeFor(dark),
  legend: false,
});

const chart = new G2.Chart({ container: 'share', autoFit: true, height: 320 });
const isDark = () => document.documentElement.dataset.theme === 'dark';

chart.options(spec(isDark()));
chart.render();

// The toggle in html-css-patterns.md flips data-theme on <html>.
new MutationObserver(() => {
  chart.options(spec(isDark()));
  chart.render();
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
```

`viewFill: 'transparent'` is the load-bearing part: G2's own dark theme paints a
near-black panel, and on a page that already has `var(--surface)` behind it that
reads as a misaligned rectangle rather than a chart.

Match the chart's type to the page rather than the data's shape:

```js
theme: {
  type: 'classic',
  view: { viewFill: 'transparent' },
  text: { fontFamily: getComputedStyle(document.documentElement)
    .getPropertyValue('--font-body').trim() || 'system-ui, sans-serif' },
}
```

### Stat Callouts Are Not Charts

The numbers an infographic is remembered for should be typography, not a
one-bar chart. Render them in CSS and keep AntV for the comparison beneath:

```css
.ve-stat {
  font-family: var(--font-display, var(--font-body));
  font-size: clamp(2.5rem, 8vw, 4.5rem);
  font-variant-numeric: tabular-nums;
  line-height: 1;
  color: var(--accent);
}

.ve-stat-label {
  font-size: 0.8125rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}
```

Three to five stats is the working range. Past that the page stops being an
infographic and becomes a table, which `html-css-content-patterns.md` covers
better.

### Sizing and Reduced Motion

- Give every chart container an explicit `height`; `autoFit: true` fits the
  width but cannot infer a height from a collapsed parent, and the chart
  silently renders at zero.
- G2 animates on first render. Respect the same guard the rest of preview uses:

```js
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  chart.options({ ...spec(isDark()), animate: false });
}
```

- The page still needs the mandatory light/dark toggle from
  `html-css-patterns.md`. An infographic is not exempt.
