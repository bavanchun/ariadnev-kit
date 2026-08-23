
## Collapsible Sections

Native `<details>/<summary>` with styled disclosure. Zero JS, accessible. For lower-priority content: file maps, decision logs, reference sections.

```css
details.collapsible {
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}

details.collapsible summary {
  padding: 14px 20px;
  background: var(--surface);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text);
  transition: background 0.15s ease;
}

details.collapsible summary:hover {
  background: var(--surface-elevated, var(--surface));
}

details.collapsible summary::-webkit-details-marker { display: none; }

/* Chevron indicator */
details.collapsible summary::before {
  content: '▸';
  font-size: 11px;
  color: var(--text-dim);
  transition: transform 0.15s ease;
}

details.collapsible[open] summary::before {
  transform: rotate(90deg);
}

details.collapsible .collapsible__body {
  padding: 16px 20px;
  border-top: 1px solid var(--border);
  font-size: 15px;
  line-height: 1.6;
}
```

```html
<details class="collapsible">
  <summary>File Map (14 files changed)</summary>
  <div class="collapsible__body">
    <!-- content here -->
  </div>
</details>
```

## Prose Page Elements

Patterns for documentation, articles, blog posts, and reading-first content. Optimize for sustained reading, not scanning.

### Body Text Settings

```css
.prose {
  font-size: clamp(17px, 1.1vw + 14px, 19px);
  line-height: 1.7;
  max-width: 65ch;
  text-wrap: pretty;
}

.prose p {
  margin-bottom: 1.5em;
}

.prose--narrow {
  max-width: 60ch;
  line-height: 1.8;
}

.prose--wide {
  max-width: 75ch;
  line-height: 1.6;
}
```

### Lead Paragraph

```css
.lead {
  font-size: 20px;
  line-height: 1.6;
  color: var(--text-bright);
  margin-bottom: 32px;
}

.lead--dropcap::first-letter {
  float: left;
  font-family: var(--font-display);
  font-size: 64px;
  font-weight: 600;
  line-height: 0.85;
  padding-right: 12px;
  padding-top: 6px;
  color: var(--accent);
}
```

### Pull Quotes

```css
/* Border left — most versatile */
.pullquote {
  margin: 48px 0;
  padding-left: 24px;
  border-left: 3px solid var(--accent);
}
.pullquote p {
  font-size: 22px;
  font-style: italic;
  line-height: 1.4;
  color: var(--text-bright);
  margin: 0;
}

/* Centered with quotation mark */
.pullquote--centered {
  margin: 56px 0;
  padding: 32px 40px;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  text-align: center;
  position: relative;
}
.pullquote--centered::before {
  content: '"';
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg);
  padding: 0 16px;
  font-size: 48px;
  color: var(--accent);
  line-height: 1;
}
```

### Callout Boxes

```css
.callout {
  padding: 16px 20px;
  border-radius: 8px;
  border-left: 4px solid var(--callout-border);
  background: var(--callout-bg);
  margin: 24px 0;
}

.callout--info {
  --callout-border: var(--accent);
  --callout-bg: color-mix(in srgb, var(--accent) 10%, transparent);
}

.callout--warning {
  --callout-border: var(--amber);
  --callout-bg: color-mix(in srgb, var(--amber) 10%, transparent);
}

.callout--success {
  --callout-border: var(--green);
  --callout-bg: color-mix(in srgb, var(--green) 10%, transparent);
}

.callout__title {
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--callout-border);
}

/* Lists inside callouts need padding fix */
.callout ul, .callout ol {
  padding-left: 1.5em;
  margin: 8px 0 0 0;
}
```

### Theme Toggle

```css
:root, [data-theme="light"] {
  --bg: #fafaf9;
  --surface: #ffffff;
  --text: #1c1917;
  --text-dim: #78716c;
  --border: #e7e5e4;
  --accent: #0d9488;
}

[data-theme="dark"] {
  --bg: #0c0a09;
  --surface: #1c1917;
  --text: #fafaf9;
  --text-dim: #a8a29e;
  --border: #292524;
  --accent: #14b8a6;
}
```

```javascript
// Random initial theme
const themes = ['light', 'dark'];
document.documentElement.setAttribute('data-theme', themes[Math.floor(Math.random() * 2)]);

// Toggle
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  document.documentElement.setAttribute('data-theme', current === 'light' ? 'dark' : 'light');
}
```

### Prose Anti-Patterns

Avoid in reading-first content:
- Body text smaller than 16px
- Line-height below 1.5
- Measure wider than 75ch
- Pull quotes every other paragraph
- Busy background patterns behind text

## Generated Images

For AI-generated illustrations embedded as base64 data URIs. Use `/av:ai-multimodal` skill for image generation if available.

### Hero Banner

```css
.hero-img-wrap {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 24px;
}

.hero-img-wrap img {
  width: 100%;
  height: 240px;
  object-fit: cover;
  display: block;
}

/* Gradient fade into page background */
.hero-img-wrap::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 50%;
  background: linear-gradient(to top, var(--bg), transparent);
  pointer-events: none;
}
```

```html
<div class="hero-img-wrap">
  <img src="data:image/png;base64,..." alt="Descriptive alt text">
</div>
```

### Inline Illustration

```css
.illus {
  text-align: center;
  margin: 24px 0;
}

.illus img {
  max-width: 480px;
  width: 100%;
  border-radius: 10px;
  border: 1px solid var(--border);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.illus figcaption {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-dim);
  margin-top: 8px;
}
```

### Side Accent

```css
.accent-img {
  float: right;
  max-width: 200px;
  margin: 0 0 16px 24px;
  border-radius: 10px;
  border: 1px solid var(--border);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

@media (max-width: 768px) {
  .accent-img {
    float: none;
    max-width: 100%;
    margin: 0 0 16px 0;
  }
}
```
