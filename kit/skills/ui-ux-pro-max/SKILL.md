---
name: av:ui-ux-pro-max
description: "Use to choose a UI style, palette, font pairing, landing pattern and UX rules for a product from a searchable design database, generate a design system, and check UI for accessibility and polish."
user-invocable: true
when_to_use: "Invoke for UX strategy, design systems, accessibility, or review."
category: frontend
keywords: [ui-ux, styles, palettes, fonts]
metadata:
  origin: ported
  author: upstream
  version: "1.1.0"
---

# UI/UX Pro Max - Design Intelligence

Design guidance for web and mobile interfaces, backed by a searchable CSV
database under `data/`: UI styles, colour palettes, font pairings, Google
Fonts, product types with reasoning rules, landing-page patterns, chart types,
UX guidelines, icons, React performance rules, app-interface rules, and one
stack file (React Native). `scripts/search.py` is the documented entry point —
BM25 search per domain, or `--design-system` to assemble a full recommendation.
It chooses and reviews; it does not write UI code.

## When to apply

Use it when the task changes how a feature **looks, feels, moves, or is
interacted with**: new pages or components, choosing colour / typography /
spacing / layout systems, reviewing UI for usability, accessibility or visual
consistency, navigation, animation, responsive behaviour, product-level style
decisions, or "it looks unprofessional and I don't know why".

Skip it for backend logic, API or database design, performance work that does
not touch the interface, infrastructure, and non-visual scripts.

## Rule categories by priority

Follow priority 1→10 to decide which rule category to focus on first; the rule
ids behind each row are in the [UX quick reference](references/ux-quick-reference.md).
Scripts do not read this table.

| Priority | Category | Impact | Domain | Key Checks (Must Have) | Anti-Patterns (Avoid) |
|----------|----------|--------|--------|------------------------|------------------------|
| 1 | Accessibility | CRITICAL | `ux` | Contrast 4.5:1, Alt text, Keyboard nav, Aria-labels | Removing focus rings, Icon-only buttons without labels |
| 2 | Touch & Interaction | CRITICAL | `ux` | Min size 44×44px, 8px+ spacing, Loading feedback | Reliance on hover only, Instant state changes (0ms) |
| 3 | Performance | HIGH | `ux` | WebP/AVIF, Lazy loading, Reserve space (CLS &lt; 0.1) | Layout thrashing, Cumulative Layout Shift |
| 4 | Style Selection | HIGH | `style`, `product` | Match product type, Consistency, SVG icons (no emoji) | Mixing flat & skeuomorphic randomly, Emoji as icons |
| 5 | Layout & Responsive | HIGH | `ux` | Mobile-first breakpoints, Viewport meta, No horizontal scroll | Horizontal scroll, Fixed px container widths, Disable zoom |
| 6 | Typography & Color | MEDIUM | `typography`, `color` | Base 16px, Line-height 1.5, Semantic color tokens | Text &lt; 12px body, Gray-on-gray, Raw hex in components |
| 7 | Animation | MEDIUM | `ux` | Duration 150–300ms, Motion conveys meaning, Spatial continuity | Decorative-only animation, Animating width/height, No reduced-motion |
| 8 | Forms & Feedback | MEDIUM | `ux` | Visible labels, Error near field, Helper text, Progressive disclosure | Placeholder-only label, Errors only at top, Overwhelm upfront |
| 9 | Navigation Patterns | HIGH | `ux` | Predictable back, Bottom nav ≤5, Deep linking | Overloaded nav, Broken back behavior, No deep links |
| 10 | Charts & Data | LOW | `chart` | Legends, Tooltips, Accessible colors | Relying on color alone to convey meaning |

## Workflow

| Scenario | Trigger examples | Start from |
|----------|------------------|------------|
| New project / page | "Build a landing page", "Build a dashboard" | Step 1 → Step 2 |
| New component | "Create a pricing card", "Add a modal" | Step 3 (`style`, `ux`) |
| Choose style / colour / font | "What style fits a fintech app?" | Step 2 |
| Review existing UI | "Review this page for UX issues" | [UX quick reference](references/ux-quick-reference.md), priority order |
| Fix a UI bug | "Button hover is broken", "Layout shifts on load" | The quick-reference section for that category |
| Improve / optimise | "Improve the mobile experience" | Step 3 (`ux`, `react`) |
| Dark mode | "Add dark mode support" | Step 3 (`style` "dark mode") |
| Charts / data viz | "Add an analytics dashboard chart" | Step 3 (`chart`) |
| Stack best practices | "React Native list performance" | Step 4 |

### Step 1 — Analyze the request

Extract: **product type** (entertainment, tool, productivity, hybrid), **target
audience** and usage context, **style keywords** (playful, minimal, dark mode,
content-first…), and **stack**. The only stack file shipped is `react-native`;
for React / Next.js web use `--domain react`, for iOS / Android interface rules
`--domain web`.

### Step 2 — Generate the design system (required)

Always start here:

```bash
python3 .claude/skills/av-ui-ux-pro-max/scripts/search.py "<product_type> <industry> <keywords>" --design-system [-p "Project Name"]
```

The script searches `product` (top 1) to find the category, looks up that
category's reasoning rule in `data/ui-reasoning.csv` (style priority, colour
and typography mood, effects, anti-patterns; a default rule when nothing
matches), then searches `style` (3, with the first two priority styles appended
to the query), `color` (2), `landing` (2) and `typography` (2), and picks the
style that best matches the priority list and the top hit of each other domain.
The palette hex values it prints are constants — see Output format; take the
real palette from `--domain color`.

To keep the result across sessions (`--persist`, `--page`), see the
[search cookbook](references/search-cookbook.md).

### Step 3 — Supplement with domain searches

```bash
python3 .claude/skills/av-ui-ux-pro-max/scripts/search.py "<keyword>" --domain <domain> [-n <max_results>]
```

| Domain | Use for | Example keywords |
|--------|---------|------------------|
| `product` | Product type → style, landing pattern, palette focus | SaaS, e-commerce, healthcare, beauty |
| `style` | UI styles with effects, CSS keywords, checklist, variables | glassmorphism, minimalism, dark mode, brutalism |
| `color` | Full palette tokens by product type | saas, fintech, healthcare, beauty |
| `typography` | Font pairings with Google Fonts URL, CSS import, Tailwind config | elegant, playful, professional |
| `google-fonts` | Individual Google Fonts | sans serif, monospace, variable font, japanese |
| `landing` | Section order, CTA placement, conversion strategy | hero, testimonial, pricing, social-proof |
| `chart` | Chart type per data type, a11y grade, library | trend, comparison, funnel, pie |
| `ux` | Guidelines with Do / Don't code examples and severity | animation, accessibility, z-index, loading |
| `icons` | Icon names with library and import code | arrow, navigation, lucide |
| `react` | React / Next.js performance | waterfall, bundle, suspense, memo, rerender |
| `web` | App interface rules (iOS / Android / React Native) | accessibilityLabel, touch targets, safe areas |

Without `--domain` the script picks one from keywords in the query and falls
back to `style`. There is no `prompt` domain; AI prompt and CSS keywords are
columns of `style` results.

Before implementing, run `--domain ux "animation accessibility z-index loading"`
as a validation pass.

### Step 4 — Stack guidelines

```bash
python3 .claude/skills/av-ui-ux-pro-max/scripts/search.py "<keyword>" --stack react-native
```

Then synthesise the design system and the searches, and hand the choices to
the implementing skill. For app screens, read the
[app UI rules](references/app-ui-rules.md) before building.

## Output format

**`--design-system`** — `-f ascii` (default, a 91-character-wide box) or
`-f markdown`. In this order: Pattern (name, CTA placement, section order,
conversion strategy; markdown adds colour strategy), Style (name,
keywords, best for, performance | accessibility), Colors (Primary, Secondary,
CTA, Background, Text, Notes), Typography (heading / body, mood, best for,
Google Fonts URL, CSS import), Key Effects, Avoid (the reasoning rule's
anti-patterns), and a fixed seven-item Pre-Delivery Checklist. `--json` has no
effect in this mode.

The five hex values in Colors are the same constants for every query —
`#2563EB`, `#3B82F6`, `#F97316`, `#F8FAFC`, `#1E293B` — because
`design_system.py` reads columns named `Primary (Hex)` that exist neither in
`data/colors.csv` nor in the `color` output columns `core.py` keeps, so adding
CSV columns alone would not fix it. Only the Notes line comes from the matched
palette. The real
palette is the `--domain color` result: Product Type, Primary, On Primary,
Secondary, On Secondary, Accent, On Accent, Background, Foreground, Card, Card Foreground,
Muted, Muted Foreground, Border, Destructive, On Destructive, Ring, Notes.

**`--domain <d>` and `--stack react-native`** —

```markdown
## UI Pro Max Search Results            (or: ## UI Pro Max Stack Guidelines)
**Domain:** <d> | **Query:** <query>     (or: **Stack:** react-native | …)
**Source:** <file>.csv | **Found:** <n> results

### Result 1
- **<Column>:** <value>                  (the domain's output columns; values cut at 300 chars)
```

At most `-n` results (default 3), only rows with a positive BM25 score.
`--json` prints `{domain, query, file, count, results: [{column: value}]}`
(plus `stack` for a stack search) instead. An invalid `--domain` or `--stack`
is rejected by the argument parser before any search runs.

**`--persist`** additionally writes `design-system/<project-slug>/MASTER.md`
and, with `--page`, `design-system/<project-slug>/pages/<page>.md`; the
contents and the slug rule are in the
[search cookbook](references/search-cookbook.md).

## Quality gates

- [ ] `--design-system` ran before any styling, and the delivered UI uses its pattern, style and typography; the palette came from `--domain color`, not from the constant hex values in the design-system block
- [ ] Every recommended pattern, style, palette and font names the search (domain and query) that produced it, and every review finding cites its rule category and priority number from the table above
- [ ] No emoji as icons; one SVG icon family (Lucide / Heroicons) with size and stroke defined as tokens, and official brand assets used unmodified
- [ ] Every tappable element is ≥44×44pt (iOS) / 48×48dp (Android), gives pressed feedback within 150ms, and transitions run 150–300ms with `prefers-reduced-motion` respected
- [ ] Text contrast is ≥4.5:1 (secondary ≥3:1) in light **and** dark mode, checked separately, through semantic colour tokens — no per-screen hex
- [ ] Nothing sits behind fixed headers, tab bars or safe areas, and the layout was checked at 375px and in landscape
- [ ] Icons and images carry accessibility labels, form fields have visible labels and errors near the field, colour is never the only indicator, and Dynamic Type at its largest does not break the layout

## Workflow position

**Typically follows:** `av:plan --html`, which activates `av:frontend-design`;
that skill's design-intelligence rule routes here before styling. `av:design`
when a brand identity exists first; its HTML-preview gallery and social-image
flows invoke this skill.

**Typically precedes:** `av:frontend-design`, whose workflows start by running
this skill's `product` / `style` / `typography` / `color` searches;
`av:frontend-development`, which builds the chosen system in React, MUI and
TanStack; `av:ui-styling`, which implements it in shadcn/ui and Tailwind.

**Related:** `av:web-design-guidelines` reviews existing UI code against the
Web Interface Guidelines checklist; this skill's quick reference is the
design-side counterpart, organised by priority.
`av:stitch` falls back to this skill for text-based design generation when its
quota is exhausted. `av:preview --slides` suggests it for richer style
selection. `av:fix`'s UI workflow runs the same searches before touching a UI
bug. The `ui-ux-designer` agent in `kit/agents/` runs this skill first, before
any design work.

## References

| Reference | Read when |
|---|---|
| [UX quick reference](references/ux-quick-reference.md) | Reviewing UI or fixing a bug in one of the ten rule categories — the rule ids and standards per category; sweep §1–§3 (CRITICAL + HIGH) as the final review before delivering |
| [App UI rules](references/app-ui-rules.md) | Delivering iOS / Android / React Native / Flutter screens — icon, interaction, light/dark and layout rules, and the full delivery checklist |
| [Search cookbook](references/search-cookbook.md) | Python is missing, a query returns nothing useful, a design system must survive across sessions, or a worked example would help |
