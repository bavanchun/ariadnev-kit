
## Grid Layouts

### Architecture Diagram (2-column with sidebar)
```css
.arch-grid {
  display: grid;
  grid-template-columns: 260px 1fr;
  grid-template-rows: auto;
  gap: 20px;
  max-width: 1100px;
  margin: 0 auto;
}

.arch-grid__sidebar { grid-column: 1; }
.arch-grid__main { grid-column: 2; }
.arch-grid__full { grid-column: 1 / -1; }
```

### Pipeline (horizontal steps)
```css
.pipeline {
  display: flex;
  align-items: stretch;
  gap: 0;
  overflow-x: auto;
  padding-bottom: 8px;
}

.pipeline__step {
  min-width: 130px;
  flex-shrink: 0;
}

.pipeline__arrow {
  display: flex;
  align-items: center;
  padding: 0 4px;
  color: var(--border-bright);
  font-size: 18px;
  flex-shrink: 0;
}

/* Parallel branch within a pipeline */
.pipeline__parallel {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
```

### Card Grid (dashboard / metrics)
```css
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}
```

### Data Tables

Use real `<table>` elements for tabular data. Wrap in a scrollable container for wide tables.

```css
/* Scrollable wrapper for wide tables */
.table-wrap {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}

.table-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

/* Base table */
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  line-height: 1.5;
}

/* Header */
.data-table thead {
  position: sticky;
  top: 0;
  z-index: 2;
}

.data-table th {
  background: var(--surface-elevated, var(--surface));
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-dim);
  text-align: left;
  padding: 12px 16px;
  border-bottom: 2px solid var(--border-bright);
  white-space: nowrap;
}

/* Cells */
.data-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
  color: var(--text);
}

/* Let text-heavy columns wrap naturally */
.data-table .wide {
  min-width: 200px;
  max-width: 500px;
}

/* Right-align numeric columns */
.data-table td.num,
.data-table th.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono);
}

/* Alternating rows */
.data-table tbody tr:nth-child(even) {
  background: var(--accent-dim);
}

/* Row hover */
.data-table tbody tr {
  transition: background 0.15s ease;
}

.data-table tbody tr:hover {
  background: var(--border);
}

/* Last row: no bottom border */
.data-table tbody tr:last-child td {
  border-bottom: none;
}

/* Code inside cells */
.data-table code {
  font-family: var(--font-mono);
  font-size: 11px;
  background: var(--accent-dim);
  color: var(--accent);
  padding: 1px 5px;
  border-radius: 3px;
}

/* Secondary detail text */
.data-table small {
  display: block;
  color: var(--text-dim);
  font-size: 11px;
  margin-top: 2px;
}
```

#### Status Indicators

Styled spans for match/gap/warning states. Never use emoji.

```css
.status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 6px;
  white-space: nowrap;
}

.status--match {
  background: var(--green-dim, rgba(5, 150, 105, 0.1));
  color: var(--green, #059669);
}

.status--gap {
  background: var(--red-dim, rgba(239, 68, 68, 0.1));
  color: var(--red, #ef4444);
}

.status--warn {
  background: var(--orange-dim, rgba(217, 119, 6, 0.1));
  color: var(--orange, #d97706);
}

.status--info {
  background: var(--accent-dim);
  color: var(--accent);
}

/* Dot variant (compact, no text) */
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.status-dot--match { background: var(--green, #059669); }
.status-dot--gap { background: var(--red, #ef4444); }
.status-dot--warn { background: var(--orange, #d97706); }
```

Usage in table cells:
```html
<td><span class="status status--match">Match</span></td>
<td><span class="status status--gap">Gap</span></td>
<td><span class="status status--warn">Partial</span></td>
```

#### Table Summary Row

```css
.data-table tfoot td {
  background: var(--surface-elevated, var(--surface));
  font-weight: 600;
  font-size: 12px;
  border-top: 2px solid var(--border-bright);
  border-bottom: none;
  padding: 12px 16px;
}
```

#### Sticky First Column (for very wide tables)

```css
.data-table th:first-child,
.data-table td:first-child {
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--surface);
}

.data-table tbody tr:nth-child(even) td:first-child {
  background: color-mix(in srgb, var(--surface) 95%, var(--accent) 5%);
}
```

## Connectors

### CSS Arrow (vertical, between stacked sections)
```css
.flow-arrow {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 6px 0;
}

.flow-arrow svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: var(--border-bright);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
```

Down arrow SVG (reuse inline):
```html
<svg viewBox="0 0 20 20"><path d="M10 4 L10 16 M6 12 L10 16 L14 12"/></svg>
```

### CSS Arrow (horizontal, between inline steps)
```css
.h-arrow::after {
  content: '→';
  color: var(--border-bright);
  font-size: 18px;
  padding: 0 4px;
}
```

### SVG Curved Connector (between arbitrary nodes)
```html
<svg class="connectors" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;">
  <path d="M 150,100 C 150,200 350,100 350,200" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="4 3"/>
  <!-- Arrowhead -->
  <polygon points="348,195 352,205 356,195" fill="var(--accent)"/>
</svg>
```

Position the parent container as `position: relative` to scope the SVG overlay.

## Animations

### Staggered Fade-In on Load

Define the keyframe once, then stagger via a `--i` CSS variable set per element.

```css
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

.ve-card {
  animation: fadeUp 0.4s ease-out both;
  animation-delay: calc(var(--i, 0) * 0.05s);
}
```

Set `--i` per element to control stagger order:
```html
<div class="ve-card" style="--i: 0">First</div>
<div class="ve-card" style="--i: 1">Second</div>
<div class="ve-card" style="--i: 2">Third</div>
```

### Hover Lift
```css
.ve-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.ve-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
```

### Scale-Fade (for KPI cards, badges)

```css
@keyframes fadeScale {
  from { opacity: 0; transform: scale(0.92); }
  to { opacity: 1; transform: scale(1); }
}

.kpi-card {
  animation: fadeScale 0.35s ease-out both;
  animation-delay: calc(var(--i, 0) * 0.06s);
}
```

### SVG Draw-In (for connectors, path elements)

```css
@keyframes drawIn {
  from { stroke-dashoffset: var(--path-length); }
  to { stroke-dashoffset: 0; }
}

/* Set --path-length to the path's getTotalLength() value */
.connector path {
  stroke-dasharray: var(--path-length);
  animation: drawIn 0.8s ease-in-out both;
  animation-delay: calc(var(--i, 0) * 0.1s);
}
```

### CSS Counter (hero numbers without JS)

Uses `@property` to animate a custom property as an integer. Falls back to showing the final value in browsers without `@property` support.

```css
@property --count {
  syntax: '<integer>';
  initial-value: 0;
  inherits: false;
}

@keyframes countUp {
  to { --count: var(--target); }
}

.kpi-card__value--animated {
  --target: 247;
  counter-reset: val var(--count);
  animation: countUp 1.2s ease-out forwards;
}

.kpi-card__value--animated::after {
  content: counter(val);
}
```

### Choreography

Mix animation types by element role:
- **Cards**: `fadeUp` — default entrance, reliable and subtle
- **KPI / badges**: `fadeScale` — scale draws the eye to important numbers
- **SVG connectors**: `drawIn` — reveals flow direction, pairs with card stagger
- **Hero numbers**: `countUp` — counting motion signals "this number matters"
- **Stagger timing**: `calc(var(--i) * 0.06s)` with lower `--i` on important elements (appear first)

### Respect Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Sparklines and Simple Charts (Pure SVG)

```html
<!-- Sparkline -->
<svg viewBox="0 0 100 30" style="width:100px;height:30px;">
  <polyline points="0,25 15,20 30,22 45,10 60,15 75,5 90,12 100,8"
    fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round"/>
</svg>

<!-- Progress bar -->
<div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
  <div style="height:100%;width:72%;background:var(--accent);border-radius:3px;"></div>
</div>
```

## Responsive Breakpoint

Include a single breakpoint for narrow viewports:

```css
@media (max-width: 768px) {
  .arch-grid { grid-template-columns: 1fr; }
  .pipeline { flex-wrap: wrap; gap: 8px; }
  .pipeline__arrow { display: none; }
  body { padding: 16px; }
}
```

## Badges and Tags

```css
.tag {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--node-a-dim);
  color: var(--node-a);
}
```

## Lists Inside Nodes

```css
.node-list {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 14px;
  line-height: 1.8;
}

.node-list li {
  padding-left: 14px;
  position: relative;
}

.node-list li::before {
  content: '›';
  color: var(--text-dim);
  font-weight: 600;
  position: absolute;
  left: 0;
}

.node-list code {
  font-family: var(--font-mono);
  font-size: 11px;
  background: var(--accent-dim);
  color: var(--accent);
  padding: 1px 5px;
  border-radius: 3px;
}
```

## KPI / Metric Cards

```css
.kpi-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
}

.kpi-card {
  background: var(--surface-elevated);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.kpi-card__value {
  font-size: 36px;
  font-weight: 700;
  letter-spacing: -1px;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.kpi-card__label {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: var(--text-dim);
  margin-top: 6px;
}

.kpi-card__trend {
  font-family: var(--font-mono);
  font-size: 12px;
  margin-top: 4px;
}

.kpi-card__trend--up { color: var(--node-b, #059669); }
.kpi-card__trend--down { color: var(--red, #ef4444); }
```

```html
<div class="kpi-row">
  <div class="kpi-card">
    <div class="kpi-card__value">247</div>
    <div class="kpi-card__label">Lines Added</div>
    <div class="kpi-card__trend kpi-card__trend--up">+34%</div>
  </div>
</div>
```

## Before / After Panels

```css
.diff-panels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}

.diff-panels > * { min-width: 0; overflow-wrap: break-word; }

.diff-panel__header {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: 10px 16px;
}

.diff-panel__header--before {
  background: var(--red-dim, rgba(239, 68, 68, 0.08));
  color: var(--red, #ef4444);
  border-bottom: 2px solid var(--red, #ef4444);
}

.diff-panel__header--after {
  background: var(--green-dim, rgba(5, 150, 105, 0.08));
  color: var(--green, #059669);
  border-bottom: 2px solid var(--green, #059669);
}

.diff-panel__body {
  padding: 16px;
  background: var(--surface);
  font-size: 15px;
  line-height: 1.6;
}

.diff-changed {
  background: var(--accent-dim);
  border-radius: 3px;
  padding: 0 3px;
}

@media (max-width: 768px) {
  .diff-panels { grid-template-columns: 1fr; }
}
```
