---
name: av:design
description: "Design brand identity, logos, CIP deliverables, banners, posters, icons, slides, and social images. Use to decide a brand direction (logo style, palette, typography, voice) or produce visual assets."
user-invocable: true
when_to_use: "Invoke for brand systems and visual identity, not UI code."
category: frontend
keywords: [brand, logo, CIP, banners, posters, identity]
argument-hint: "[design-type] [context]"
license: MIT
metadata:
  origin: ported
  author: upstream
  version: "2.3.0"
---

# Design

One skill for visual identity work: deciding and recording a brand direction,
then producing the assets that express it — logos, corporate identity program
(CIP) mockups, slides, banners, social images, SVG icons, and posters. Seven
built-in sub-skills share one intake, one 4-pass workflow, and one critique.
Does not handle UI code or component styling (`av:ui-styling`), product
mockups and concept art from a prompt library (`av:ai-artist`), or frontend
screens (`av:frontend-design`).

## Routing

| Task | Route | Open |
|------|-------|------|
| Decide a brand direction: logo style, palette, typography, voice | Intake + direction record (below) | `references/design-workflow.md` |
| A real brand or product is named | Locate its real assets before generating | `references/brand-asset-protocol.md` |
| Logo creation, AI generation | Logo | `references/logo-design.md` |
| CIP mockups, deliverable sets | CIP | `references/cip-design.md` |
| Presentations, pitch decks | Slides | `references/slides.md` |
| Banners, covers, headers | Banner | `references/banner-sizes-and-styles.md` |
| Social media images | Social Photos | `references/social-photos-design.md` |
| SVG icons, icon sets | Icon | `references/icon-design.md` |
| Posters (event, editorial, marketing) | Poster | `references/poster-design.md` |
| Design tokens, a design system, UX rules | `av:ui-ux-pro-max` | — |
| shadcn/ui, Tailwind, theming in code | `av:ui-styling` | — |

`references/design-routing.md` carries the question-type routing and the
multi-skill sequences (logo → CIP → slides; banner + brand; icon + tokens).

## Process (before generating)

1. **Design Read declaration.** One line, first: `Reading this as:
   <deliverable> for <audience>, leaning <aesthetic direction>.` If the brief
   is genuinely ambiguous, ask exactly ONE clarifying question — never a
   question dump. `../av-frontend-design/references/design-quality-preflight.md`
   carries the shared failure-mode catalog (generic gradients, template card
   grids, fake screenshots, generic content, decorative furniture, one-note
   palettes) this declaration guards against.
2. **Intake.** For a new, vague, or externally-shipped task, ask the batched
   10-question checklist in `references/design-workflow.md` once, in one
   message. Small tweaks and follow-ups on an approved design skip it.
3. **Real brand → real assets.** When the task names a real brand or product,
   run `references/brand-asset-protocol.md` before generating anything. A logo
   the agent cannot locate is a stop-and-ask, never a fabrication. The
   collected assets are frozen into `brand-spec.md` and every later artifact
   references that file.
4. **Direction record.** Write the design direction (shape under **Output
   format**) and get it accepted before producing individual assets.
5. **4 passes.** Assumptions + placeholders → real components + variations →
   polish → verify and deliver, per `references/design-workflow.md`.
6. **Self-critique.** Before delivery, score the work against
   `references/design-critique-guide.md`. Concept ≤ 5 caps the total at 6.0 —
   fix the idea before polishing craft. Once an asset is integrated into a
   frontend build, demo page, or deck, the consuming skill runs
   `references/handoff-gate.md` instead — the two gates never stack.

## Built-in sub-skills

Each guide carries the full command reference, flags, and workflow; the lines
here are the entry points. Scripts run with `python3` from this skill's
directory and need `GEMINI_API_KEY` (see **Setup**).

### Logo — `references/logo-design.md`

55 styles, 55 color palettes, 55 industry guides (`data/logo/*.csv`).
Generation uses Nano Banana 2 (`gemini-3.1-flash-image-preview`) by default
and Nano Banana Pro (`gemini-3-pro-image-preview`) with `--pro`.

```bash
python3 scripts/logo/search.py "tech startup modern" --design-brief -p "BrandName"
python3 scripts/logo/generate.py --brand "TechFlow" --style minimalist --industry tech
```

Search domains: `--domain style|color|industry`. **ALWAYS** generate logos on
a white background. After generation, ask via `ask_user capability` whether
the user wants an HTML gallery; if yes, activate `av:ui-ux-pro-max` for it.

### CIP — `references/cip-design.md`

50 deliverables, 20 styles, 20 industries, 20 mockup contexts (`data/cip/*.csv`).
Models: `--model flash` (default, `gemini-3.1-flash-image-preview`) or
`--model pro` (`gemini-3-pro-image-preview`, 4K text rendering).

```bash
python3 scripts/cip/search.py "tech startup" --cip-brief -b "BrandName"
python3 scripts/cip/generate.py --brand "TopGroup" --logo /path/to/logo.png --industry "consulting" --set
python3 scripts/cip/render-html.py --brand "TopGroup" --industry "consulting" --images /path/to/cip-output
```

Pass `--logo` whenever a logo exists (image-editing mode keeps it faithful);
`--no-logo-prompt` proceeds without one. A real brand goes through the brand
asset protocol first; an invented brand goes through Logo first.

### Slides — `references/slides.md`

Strategic HTML presentations with Chart.js, design tokens, and copywriting
formulas. `references/slides.md` lists the workflow and the five knowledge
files (layout patterns, HTML template, copywriting, strategies, and the
`slides-create.md` task stub).

### Banner — `references/banner-sizes-and-styles.md`

22 art-direction styles across social, ads, web, and print, with the size
table, safe zones, and text/DPI rules in the guide. Workflow: intake (and the
brand asset protocol for a real brand) → research with `av:ui-ux-pro-max` →
HTML/CSS banner via `av:frontend-design`, visuals via `av:ai-artist` or
`av:ai-multimodal` → export to PNG at exact dimensions with
`av:agent-browser`, headless Chrome, or Playwright → present options
side-by-side and iterate.

### Social Photos — `references/social-photos-design.md`

HTML/CSS per idea × platform size, screenshot-exported at 2× device scale
factor, visually verified in a browser, then reported to `plans/reports/`.
Ideate 3-5 concepts with the 4-pass discipline and present them through
`ask_user capability` before building. Sizes and templates are in the guide.

### Icon — `references/icon-design.md`

15 styles, 12 categories. `gemini-3.1-pro-preview` returns SVG as text, so no
image API is involved.

```bash
python3 scripts/icon/generate.py --prompt "settings gear" --style outlined
python3 scripts/icon/generate.py --prompt "cloud upload" --batch 4 --output-dir ./icons
```

`--sizes "16,24,32,48"` generates the same icon at each size; `--list-styles`
and `--list-categories` print the catalogues.

### Poster — `references/poster-design.md`

22 styles × 16 palettes × 14 layouts × 8 textures (`data/poster/*.csv`).
Model-agnostic: the scripts emit text prompts only, so the prompt goes to
Gemini Nano Banana, GPT Image, Imagen, Midjourney, or another image model.
For a coherent series, pass the same explicit `--style`, `--palette`, and
`--texture` on every call, then vary `--layout` and `--seed`. A shared
`--style` alone does not lock the other axes.

```bash
python3 scripts/poster/search.py --poster-brief --topic "AI Conference" --query "minimal grid"
python3 scripts/poster/generate.py --topic "AI Conference" --style modern-editorial-typographic --seed 42
```

Pipe stdout into the selected image model. `--style` must be the exact
`Style Name` from `search.py` output — an unmatched name silently falls back to
a random style rather than erroring. `references/poster-prompt-engineering.md`
carries prompt anatomy and per-model tweaks; rebuilding the knowledge base
(`scripts/poster/analyze.py`, `scripts/poster/cluster.py`) is in the guide.

## Output format

**1. Design direction record** — written after intake, before any asset, and
accepted by the user (or, when the caller explicitly authorized autonomous
execution, recorded with the reasonable call stated). Saved beside the assets
as `design-direction.md`:

```markdown
# Design direction: <brand or project>

Outcome: <what the assets must achieve, one sentence>
Sub-skills: <logo | cip | slides | banner | social | icon | poster>

| Axis | Decision | Why |
| --- | --- | --- |
| Logo style | <style name from data/logo/styles.csv> | … |
| Palette | <palette or hex set> | … |
| Typography | <heading / body> | … |
| Voice | <3 adjectives> | … |

Constraints: <platforms, sizes, print/screen, brand rules, model or budget>
Non-goals: <what this round will not produce>
Acceptance criteria: <observable checks — e.g. "logo legible at 16px", "every banner passes the <20% text rule">
Brand assets: <brand-spec.md path | invented brand — none to locate>
```

**2. Assets** — every delivered file listed with its path and sub-skill. Record
the producing command and model when generation used them; otherwise write
`n/a (manual composition)` rather than inventing provenance. For a real brand,
each artifact references `brand-spec.md` rather than inline hex codes.

**3. Delivery summary** — the template in `references/design-workflow.md`
(Pass 4): what was delivered, caveats, next step. Short.

**4. Self-critique** — the score block from
`references/design-critique-guide.md`, with the concept cap applied.

## Quality gates

- [ ] A real brand's logo was located through the brand asset protocol, or the
      workflow stopped and asked — no CSS silhouette, no generated stand-in,
      no silent substitution
- [ ] The direction record exists and was accepted before the first asset was
      generated; every asset traces to one of its decisions
- [ ] Each acceptance criterion in the record was checked against the
      delivered file, not the thumbnail: images opened, HTML screenshotted at
      the exact target size, slides previewed in present mode
- [ ] The self-critique ran; a concept score ≤ 5 capped the total at 6.0 and
      the idea was revised before craft polish
- [ ] Poster series pass the same explicit style, palette, and texture across
      calls while layout and seed vary; logo series preserve the approved logo
      direction and palette across variants
- [ ] Every script flag in the report exists in the script's `--help`; a
      failed script was fixed or reported, never worked around with a
      hand-made asset presented as generated

## Workflow position

**Typically follows:** `av:brainstorm`, when the brand direction is itself the
open question — its accepted outcome, constraints, and non-goals seed the
direction record.

**Typically precedes:** `av:ui-ux-pro-max`, which turns the accepted palette
and typography into a design system and tokens, and `av:ui-styling`, which
implements them in shadcn/ui and Tailwind; `av:ai-artist` for marketing
visuals that reuse the recorded direction.

**Invokes directly:** `av:ui-ux-pro-max` for the logo HTML gallery and banner
research; `av:frontend-design` for HTML/CSS banners and social images;
`av:ai-artist` and `av:ai-multimodal` for generated imagery; `av:agent-browser`
for exact-size screenshot export.

**Related:** `av:ai-artist` owns a single product mockup or concept image from
its prompt library — that request does not come here. `av:frontend-design`
owns application screens. `av:frontend-design` and `av:show-off` load this
skill's `references/handoff-gate.md` as their last check before presenting.

## References

| Read when | File |
| --- | --- |
| Choosing a route by question type or chaining sub-skills | `references/design-routing.md` |
| A real brand or product is named | `references/brand-asset-protocol.md` |
| Before delivery (self-review) | `references/design-critique-guide.md` |
| Final gate and handoff template for `av:frontend-design`, `av:show-off`, and Slides outputs | `references/handoff-gate.md` |
| New, vague, or externally-shipped task (intake, 4 passes) | `references/design-workflow.md` |
| Logo: guide, styles, colors, prompts | `references/logo-design.md`, `references/logo-style-guide.md`, `references/logo-color-psychology.md`, `references/logo-prompt-engineering.md` |
| CIP: guide, deliverables, styles, prompts | `references/cip-design.md`, `references/cip-deliverable-guide.md`, `references/cip-style-guide.md`, `references/cip-prompt-engineering.md` |
| Slides: entry, stub, layouts, template, copy, strategy | `references/slides.md`, `references/slides-create.md`, `references/slides-layout-patterns.md`, `references/slides-html-template.md`, `references/slides-copywriting-formulas.md`, `references/slides-strategies.md` |
| Banner sizes and styles | `references/banner-sizes-and-styles.md` |
| Social photo sizes, templates, workflow | `references/social-photos-design.md` |
| Icon styles and commands | `references/icon-design.md` |
| Poster guide and prompt anatomy | `references/poster-design.md`, `references/poster-prompt-engineering.md` |

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/logo/search.py`, `scripts/logo/generate.py` | Search logo styles/colors/industries; generate logos (`core.py` is the BM25 engine) |
| `scripts/cip/search.py`, `scripts/cip/generate.py`, `scripts/cip/render-html.py` | Search CIP data; generate mockups; render the HTML presentation |
| `scripts/icon/generate.py` | Generate SVG icons |
| `scripts/poster/search.py`, `scripts/poster/generate.py` | Search poster data; emit model-agnostic prompts |
| `scripts/poster/analyze.py`, `scripts/poster/cluster.py` | Rebuild the poster knowledge base from reference images |

## Setup

```bash
export GEMINI_API_KEY="your-key"  # https://aistudio.google.com/apikey
pip install -r scripts/requirements.txt   # pillow, google-genai, numpy, scikit-learn
```
