# Slide Deck Patterns

CSS patterns, JS engine, slide type layouts, transitions, navigation chrome, and curated presets for self-contained HTML slide presentations. All slides are viewport-fit (100dvh), single-file, same philosophy as scrollable pages.

**When to use slides:** Only when the user explicitly requests them — `--slides` flag on an existing prompt, or natural language like "as a slide deck." Never auto-select slide format.

**Before generating**, also read `./html-css-patterns.md` for shared patterns (Mermaid zoom controls, overflow protection, depth tiers, status badges) and `./html-libraries.md` for Mermaid theming, Chart.js, and font pairings. Those patterns apply to slides too — this file adds slide-specific patterns on top.

For presentation-grade output, consider invoking `/av:ui-ux-pro-max` for richer style selection and distinctive font/palette pairing.

---

## Planning a Deck from a Source Document

When converting a plan, spec, review, or any structured document into slides, follow this process before writing any HTML. Skipping it leads to polished-looking decks that silently drop 30–40% of the source material.

**Step 1 — Inventory the source.** Read the entire source document and enumerate every section, subsection, card, table row, decision, specification, collapsible detail, and footnote. Count them. A plan with 7 sections, 6 decision cards, a 7-row file table, 4 presets, 6 technique guides, and an engine spec with 3 sub-specs and 2 collapsibles is ~25 distinct content items that all need slide real estate.

**Step 2 — Map source to slides.** Assign each inventory item to one or more slides. Every item must appear somewhere. Rules:
- If a section has 6 decisions, all 6 need slides — not the 2 that fit on one split slide.
- If a table has 7 rows, all 7 rows show up.
- Collapsible/expandable details in the source are not optional in the deck — they become their own slides.
- Subsections with multiple cards may need 2–3 slides to cover at readable density.
- Each plan section typically needs a divider slide + 1–3 content slides depending on density.

**Step 3 — Choose layouts.** For each planned slide, pick a slide type and spatial composition. Vary across the sequence (see Compositional Variety below). This is where narrative pacing happens — alternate dense slides with sparse ones.

**Step 4 — Plan images.** If `/av:ai-multimodal` skill is available and image generation is appropriate, plan 2–4 images for the deck minimum. Target the **title slide** (16:9 background that sets the visual tone) and **one full-bleed slide** (immersive background for a key moment). Content slides with conceptual topics also benefit from a 1:1 illustration in the aside area. Generate these images early — before writing HTML — so you can embed them as base64 data URIs. See the Proactive Imagery section below. If image generation isn't available, degrade to CSS gradients and SVG decorations.

**Step 5 — Verify before writing HTML.** Scan the inventory from Step 1. Is anything unmapped? Would a reader of the source document notice something missing from the deck? If yes, add slides. A source document with 7 sections typically produces 18–25 slides, not 10–13.

**The test:** After generating the deck, a reader who has never seen the source document should be able to reconstruct every major point from the slides alone. If they'd miss entire sections, the deck is incomplete.

---

## Slide Engine Base

The deck is a scroll-snap container. Each slide is exactly one viewport tall.

```html
<body>
<div class="deck">
  <section class="slide slide--title"> ... </section>
  <section class="slide slide--content"> ... </section>
  <section class="slide slide--diagram"> ... </section>
  <!-- one <section> per slide -->
</div>
</body>
```

```css
/* Scroll-snap container */
.deck {
  height: 100dvh;
  overflow-y: auto;
  scroll-snap-type: y mandatory;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
}

/* Individual slide */
.slide {
  height: 100dvh;
  scroll-snap-align: start;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: clamp(40px, 6vh, 80px) clamp(40px, 8vw, 120px);
  isolation: isolate; /* contain z-index stacking */
}
```

---

## Typography Scale

Slide typography is 2–3× larger than scrollable pages. Page-sized text on a viewport-sized canvas looks like a mistake.

```css
.slide__display {
  font-size: clamp(48px, 10vw, 120px);
  font-weight: 800;
  letter-spacing: -3px;
  line-height: 0.95;
  text-wrap: balance;
}

.slide__heading {
  font-size: clamp(28px, 5vw, 48px);
  font-weight: 700;
  letter-spacing: -1px;
  line-height: 1.1;
  text-wrap: balance;
}

.slide__body {
  font-size: clamp(16px, 2.2vw, 24px);
  line-height: 1.6;
  text-wrap: pretty;
}

.slide__label {
  font-family: var(--font-mono);
  font-size: clamp(10px, 1.2vw, 14px);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: var(--text-dim);
}

.slide__subtitle {
  font-family: var(--font-mono);
  font-size: clamp(14px, 1.8vw, 20px);
  color: var(--text-dim);
  letter-spacing: 0.5px;
}
```

| Element | Size range | Notes |
|---------|-----------|-------|
| Display (title slides) | 48–120px | `10vw` preferred, weight 800 |
| Section numbers | 100–240px | Ultra-light (weight 200), decorative |
| Headings | 28–48px | `5vw` preferred, weight 700 |
| Body / bullets | 16–24px | `2.2vw` preferred, 1.6 line-height |
| Code blocks | 14–18px | `1.8vw` preferred, mono |
| Quotes | 24–48px | `4vw` preferred, serif italic |
| Labels / captions | 10–14px | Mono, uppercase, dimmed |

---

## Cinematic Transitions

IntersectionObserver adds `.visible` when a slide enters the viewport. Slides animate in once and stay visible when scrolling back.

```css
/* Slide entrance — fade + lift + subtle scale */
.slide {
  opacity: 0;
  transform: translateY(40px) scale(0.98);
  transition:
    opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide.visible {
  opacity: 1;
  transform: none;
}

/* Staggered child reveals — add .reveal to each content element */
.slide .reveal {
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide.visible .reveal {
  opacity: 1;
  transform: none;
}

/* Stagger delays — up to 6 children per slide */
.slide.visible .reveal:nth-child(1) { transition-delay: 0.1s; }
.slide.visible .reveal:nth-child(2) { transition-delay: 0.2s; }
.slide.visible .reveal:nth-child(3) { transition-delay: 0.3s; }
.slide.visible .reveal:nth-child(4) { transition-delay: 0.4s; }
.slide.visible .reveal:nth-child(5) { transition-delay: 0.5s; }
.slide.visible .reveal:nth-child(6) { transition-delay: 0.6s; }

@media (prefers-reduced-motion: reduce) {
  .slide,
  .slide .reveal {
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
  }
}
```

---

## Navigation Chrome

All navigation is `position: fixed` with high z-index, layered above slides.

### Progress Bar

```css
.deck-progress {
  position: fixed;
  top: 0;
  left: 0;
  height: 3px;
  background: var(--accent);
  z-index: 100;
  transition: width 0.3s ease;
  pointer-events: none;
}
```

### Nav Dots

```css
.deck-dots {
  position: fixed;
  right: clamp(12px, 2vw, 24px);
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 100;
}

.deck-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-dim);
  opacity: 0.3;
  border: none;
  padding: 0;
  cursor: pointer;
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.deck-dot:hover { opacity: 0.6; }

.deck-dot.active {
  opacity: 1;
  transform: scale(1.5);
  background: var(--accent);
}
```

### Slide Counter

```css
.deck-counter {
  position: fixed;
  bottom: clamp(12px, 2vh, 24px);
  right: clamp(12px, 2vw, 24px);
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-dim);
  z-index: 100;
  font-variant-numeric: tabular-nums;
}
```

### Keyboard Hints

Auto-fade after first interaction or after 4 seconds.

```css
.deck-hints {
  position: fixed;
  bottom: clamp(12px, 2vh, 24px);
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-dim);
  opacity: 0.6;
  z-index: 100;
  transition: opacity 0.5s ease;
  white-space: nowrap;
}

.deck-hints.faded {
  opacity: 0;
  pointer-events: none;
}
```

### Chrome Visibility on Mixed Backgrounds

For decks where some slides are light and some dark:

```css
/* Approach A: subtle backdrop on chrome elements */
.deck-dots,
.deck-counter {
  background: color-mix(in srgb, var(--bg) 70%, transparent 30%);
  padding: 6px;
  border-radius: 20px;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

/* Approach B: text shadow for legibility on any background */
.deck-counter,
.deck-hints {
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}
```

---

## SlideEngine JavaScript

Add once at the end of the page. Handles navigation, chrome updates, and scroll-triggered reveals. Event delegation ensures slide-internal interactions (Mermaid zoom, scrollable code, overflow tables) don't trigger slide navigation.

```javascript
class SlideEngine {
  constructor() {
    this.deck = document.querySelector('.deck');
    this.slides = [...document.querySelectorAll('.slide')];
    this.current = 0;
    this.total = this.slides.length;
    this.buildChrome();
    this.bindEvents();
    this.observe();
    this.update();
  }

  buildChrome() {
    var bar = document.createElement('div');
    bar.className = 'deck-progress';
    document.body.appendChild(bar);
    this.bar = bar;

    var dots = document.createElement('div');
    dots.className = 'deck-dots';
    var self = this;
    this.slides.forEach(function(_, i) {
      var d = document.createElement('button');
      d.className = 'deck-dot';
      d.title = 'Slide ' + (i + 1);
      d.onclick = function() { self.goTo(i); };
      dots.appendChild(d);
    });
    document.body.appendChild(dots);
    this.dots = [].slice.call(dots.children);

    var ctr = document.createElement('div');
    ctr.className = 'deck-counter';
    document.body.appendChild(ctr);
    this.counter = ctr;

    var hints = document.createElement('div');
    hints.className = 'deck-hints';
    hints.textContent = '\u2190 \u2192 or scroll to navigate';
    document.body.appendChild(hints);
    this.hints = hints;
    this.hintTimer = setTimeout(function() {
      hints.classList.add('faded');
    }, 4000);
  }

  bindEvents() {
    var self = this;
    // Keyboard — skip if focus is inside interactive content
    document.addEventListener('keydown', function(e) {
      if (e.target.closest('.mermaid-wrap, .table-scroll, .code-scroll, input, textarea, [contenteditable]')) return;
      if (['ArrowDown', 'ArrowRight', ' ', 'PageDown'].includes(e.key)) {
        e.preventDefault(); self.next();
      } else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault(); self.prev();
      } else if (e.key === 'Home') {
        e.preventDefault(); self.goTo(0);
      } else if (e.key === 'End') {
        e.preventDefault(); self.goTo(self.total - 1);
      }
      self.fadeHints();
    });

    // Touch swipe
    var touchY;
    this.deck.addEventListener('touchstart', function(e) {
      touchY = e.touches[0].clientY;
    }, { passive: true });
    this.deck.addEventListener('touchend', function(e) {
      var dy = touchY - e.changedTouches[0].clientY;
      if (Math.abs(dy) > 50) { dy > 0 ? self.next() : self.prev(); }
    });
  }

  observe() {
    var self = this;
    var obs = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          self.current = self.slides.indexOf(entry.target);
          self.update();
        }
      });
    }, { threshold: 0.5 });
    this.slides.forEach(function(s) { obs.observe(s); });
  }

  goTo(i) {
    this.slides[Math.max(0, Math.min(i, this.total - 1))]
      .scrollIntoView({ behavior: 'smooth' });
  }

  next() { if (this.current < this.total - 1) this.goTo(this.current + 1); }
  prev() { if (this.current > 0) this.goTo(this.current - 1); }

  update() {
    this.bar.style.width = ((this.current + 1) / this.total * 100) + '%';
    var self = this;
    this.dots.forEach(function(d, i) { d.classList.toggle('active', i === self.current); });
    this.counter.textContent = (this.current + 1) + ' / ' + this.total;
  }

  fadeHints() {
    clearTimeout(this.hintTimer);
    this.hints.classList.add('faded');
  }
}
```

**Usage:** Instantiate after the DOM is ready and any libraries (Mermaid, Chart.js) have rendered. Always call `autoFit()` before `new SlideEngine()`.

```html
<script>
  document.addEventListener('DOMContentLoaded', function() {
    autoFit();
    new SlideEngine();
  });
</script>
```

---

## Auto-Fit

A single post-render function that handles all known content overflow cases. Call it after Mermaid/Chart.js render but before SlideEngine init.

```javascript
function autoFit() {
  // Mermaid SVGs: fill container instead of rendering at intrinsic size
  document.querySelectorAll('.mermaid svg').forEach(function(svg) {
    svg.removeAttribute('height');
    svg.style.width = '100%';
    svg.style.maxWidth = '100%';
    svg.style.height = 'auto';
    svg.parentElement.style.width = '100%';
  });

  // KPI values: visually scale down text that overflows card width
  document.querySelectorAll('.slide__kpi-val').forEach(function(el) {
    if (el.scrollWidth > el.clientWidth) {
      var s = el.clientWidth / el.scrollWidth;
      el.style.transform = 'scale(' + s + ')';
      el.style.transformOrigin = 'left top';
    }
  });

  // Blockquotes: reduce font proportionally for long text
  document.querySelectorAll('.slide--quote blockquote').forEach(function(el) {
    var len = el.textContent.trim().length;
    if (len > 100) {
      var scale = Math.max(0.5, 100 / len);
      var fs = parseFloat(getComputedStyle(el).fontSize);
      el.style.fontSize = Math.max(16, Math.round(fs * scale)) + 'px';
    }
  });
}
```

Three cases:
- **Mermaid:** SVGs render with fixed dimensions — force them to fill available width.
- **KPI values:** Long text strings at hero scale overflow card boundaries — `transform: scale()` shrinks visually without reflow.
- **Blockquotes:** Quotes longer than ~100 characters get proportionally smaller font.

---
