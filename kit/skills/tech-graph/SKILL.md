---
name: av:tech-graph
description: "Generate publish-grade SVG+PNG technical diagrams in 7 visual styles, script-validated and exported with rsvg-convert. Use for architecture, data-flow, sequence, UML, agent, and memory diagrams."
user-invocable: true
when_to_use: "Invoke for publish-grade architecture or flow diagrams."
category: dev-tools
keywords: [diagrams, architecture, flowchart, sequence, svg, png, agent, memory, visualization]
argument-hint: "[diagram-type or system description]"
metadata:
  origin: ported
  author: upstream
  version: "1.0.0"
  attribution: "Vendored from fireworks-tech-graph by yizhiyanhua-ai (MIT)"
  license: MIT
  upstream: "github.com/yizhiyanhua-ai/fireworks-tech-graph"
  upstream_sha: "7b22cdd"
  imported_at: "2026-04-28"
---

# Tech Graph

Generate production-quality SVG technical diagrams exported as PNG via `rsvg-convert`.
The SVG is written by hand or rendered from JSON by `generate-from-template.py`;
`validate-svg.sh` decides whether it is deliverable and `rsvg-convert` exports
the PNG. For diagrams that live inline in markdown use `av:mermaidjs-v11`; for
an editable canvas use `av:excalidraw` — this is the publish-grade output mode.

> Vendored from upstream `fireworks-tech-graph` (yizhiyanhua-ai, MIT). Do not
> install it separately with upstream's `npx skills add` flow. Runtime
> prerequisites: `rsvg-convert` (`brew install librsvg`) for export and the
> validator's render check, and `python3` for the validator's entity and
> collision checks. Verify both through the current install/runtime contract
> before claiming they are available. For source updates, follow the
> repository's source freshness policy and discover the active source manifest
> rather than hard-coding a maintainer home.

## Helper Scripts

| Script | What it does | Use it when |
|---|---|---|
| `bash scripts/validate-svg.sh <file>` | Eight checks on an existing SVG, one warning-only; exit 1 on any failure (see Output format) | Always, before export |
| `bash scripts/generate-diagram.sh -t <type> -s <1-7> -o <file.svg>` | Runs `validate-svg.sh` on an SVG you already wrote, then exports the PNG at `-w` width (default 1920). It generates nothing itself | Validating and exporting in one call — but see the mode note below |
| `python3 scripts/generate-from-template.py <type> <out.svg> '<json>'` | Builds the SVG from scratch from JSON — containers, nodes, arrows, legend entries — snapping arrows to node edges and escaping text so the output stays XML-valid. `templates/<type>.svg` supplies only the viewBox and is optional | Complex diagrams where hand-written routing keeps failing |
| `bash scripts/test-all-styles.sh` | Renders every `fixtures/*.json` with the generator, validates, exports to `test-output/` inside the skill directory. It only checks that the style reference files exist; it never reads their contents | After editing the generator — and only once the scripts are executable (mode note below) |

`<type>` is one of `architecture data-flow flowchart sequence comparison timeline
mind-map agent memory use-case class state-machine er-diagram network-topology`
(the list `generate-diagram.sh` accepts). Write SVG directly for simple diagrams
and quick prototypes; use the scripts for anything with more than a few elements.

The scripts ship with mode 644, so invoke them through `bash` / `python3` as
above. `generate-diagram.sh` and `test-all-styles.sh` both call
`validate-svg.sh` directly and fail with *Permission denied* as installed
(`test-all-styles.sh` reports every fixture failed for that reason alone) — run
the validator and `rsvg-convert` yourself instead until the kit marks the
scripts executable.

## Workflow (Always Follow This Order)

1. **Classify** the diagram type (table below)
2. **Extract structure** — identify layers, nodes, edges, flows, and semantic groups from user description
3. **Plan layout** — apply the layout rules for the diagram type from [diagram types](references/diagram-types.md) and the clearance, routing, and render-order rules in [SVG layout best practices](references/svg-layout-best-practices.md)
4. **Load style reference** — always load `references/style-1-flat-icon.md` unless user specifies another; load the matching numbered style reference for exact color tokens and SVG patterns
5. **Map nodes to shapes** — the shape vocabulary in [diagram types](references/diagram-types.md)
6. **Check icon needs** — load `references/icons.md` for known products
7. **Write SVG** with the Python list method in [SVG authoring](references/svg-authoring.md)
8. **Validate**: `bash scripts/validate-svg.sh file.svg`
9. **Export PNG**: `rsvg-convert -w 1920 file.svg -o file.png`
10. **Report** the generated file paths
11. **(Optional) Visual self-review** — if your runtime can read images, load the exported PNG back and inspect it for arrows through boxes, colliding labels, overlapping boxes, or a legend covering content. Repair with the fixes in [SVG authoring](references/svg-authoring.md) and re-export until clean. Skip this step silently if image reading is unavailable — do not guess.

## Diagram Types

| Type | Layout in one line | ViewBox |
|---|---|---|
| Architecture | Horizontal layers Client → Gateway → Services → Data; dashed containers per layer | `960 600`, `960 800` tall |
| Data flow | Every arrow labelled with its data type; wider primary paths, dashed control | default |
| Flowchart | Top-to-bottom; diamonds decide, rounded rects process, parallelograms I/O; 120/80px grid | default |
| Agent architecture | Input → agent core → memory → tools → output; loop arcs for iteration | default |
| Memory (Mem0-style) | Separate write and read paths; tiers Working → Short → Long → External | default |
| Sequence | Lifelines, horizontal messages in time order, activation boxes, loop/alt frames | height `80 + 50 × messages` |
| Comparison matrix | Systems as columns, attributes as rows; max 5 columns | default |
| Timeline / Gantt | Time on x, items on y; bars by category, milestone markers | `960 400`, `1200 400` wide |
| Mind map | Radial from `480,280`; cubic-bezier branches | default |
| Class (UML) | 3-compartment boxes; UML relationship line/arrowhead notation | `960 600`, `960 800` deep |
| Use case (UML) | Actors outside a dashed system boundary, ellipses inside | `960 600` |
| State machine (UML) | Initial top-left, final bottom-right; `event [guard] / action` labels | `960 600` |
| ER | Entities with underlined PKs, diamond relationships, cardinality labels | `960 600`, `1200 600` wide |
| Network topology | Tiered Internet → Edge → Core → Access → Endpoints; zone containers | `960 600` |

"default" is `0 0 960 600` for hand-written SVG. `generate-from-template.py`
sizes its output from `templates/<type>.svg` when that file exists, otherwise
from its own per-type fallback, with a `viewBox` or `width`/`height` in the
JSON overriding both — the result is taller than 600 for every "default" row
above. The full rules per type, the UML-14
coverage map, and the shape vocabulary are in
[diagram types](references/diagram-types.md) — read it once the type is chosen.

## Arrow Semantics

Always assign arrow meaning, not just color. Each style reference defines its
own arrow palette and stroke rules: keep the meanings below and take the
colors, stroke weights and dashes from the loaded style.

| Flow Type | Color | Stroke | Dash | Meaning |
|-----------|-------|--------|------|---------|
| Primary data flow | blue `#2563eb` | 2px solid | none | Main request/response path |
| Control / trigger | orange `#ea580c` | 1.5px solid | none | One system triggering another |
| Memory read | green `#059669` | 1.5px solid | none | Retrieval from store |
| Memory write | green `#059669` | 1.5px | `5,3` | Write/store operation |
| Async / event | gray `#6b7280` | 1.5px | `4,2` | Non-blocking, event-driven |
| Embedding / transform | purple `#7c3aed` | 1px solid | none | Data transformation |
| Feedback / loop | purple `#7c3aed` | 1.5px curved | none | Iterative reasoning loop |

Always include a **legend** when 2+ arrow types are used.

## Layout Rules

**Spacing**:
- Same-layer nodes: 80px horizontal, 120px vertical between layers
- Canvas margins: 40px minimum, 60px between node edges
- Snap to 8px grid: horizontal 120px intervals, vertical 120px intervals (80px for flowchart rows)

**Arrow Labels** (CRITICAL):
- MUST have background rect: `<rect fill="canvas_bg" opacity="0.95"/>` with 4px horizontal, 2px vertical padding
- Place mid-arrow, ≤3 words, stagger by 15-20px when multiple arrows converge
- Maintain 10px safety distance from nodes

**Arrow Routing**:
- Prefer orthogonal (L-shaped) paths to minimize crossings
- Anchor arrows on component edges, not geometric centers
- Route around dense node clusters, use different y-offsets for parallel arrows
- Jump-over arcs (5px radius) for unavoidable crossings — the pattern is in [SVG authoring](references/svg-authoring.md)

These are the floors. Connection-point offsets, curve control-point clearance,
overlap detection, the z-index render order, the pre-export validation
checklist, and the anti-pattern table are in
[SVG layout best practices](references/svg-layout-best-practices.md).

## SVG Technical Rules

- ViewBox: `0 0 960 600` default; `0 0 960 800` tall; `0 0 1200 600` wide
- Fonts: embed via `<style>font-family: ...</style>` — no external `@import` (breaks rsvg-convert)
- `<defs>`: arrow markers, gradients, filters, clip paths
- Text: minimum 12px, prefer 13-14px labels, 11px sub-labels, 16-18px titles
- All arrows: a `<marker>` in `<defs>` referenced by `marker-end="url(#id)"`, sized as the loaded style reference shows (style 1: 10×7; style 6: 8×8). The validator resolves exactly this attribute form, and its id check has a real bug — see check 4 under Output format for the naming that passes
- Drop shadows: `<feDropShadow>` in `<filter>`, apply sparingly (key nodes only)
- Curved paths: use `M x1,y1 C cx1,cy1 cx2,cy2 x2,y2` cubic bezier for loops/feedback arrows
- Clip content: use `<clipPath>` if text might overflow a node box

Generation method, the pre-tool-call checklist, the error-recovery protocol, and
the catalogue of syntax errors that have actually happened are in
[SVG authoring](references/svg-authoring.md) — read it before writing SVG by hand.

## Styles

| # | Name | Background | Best For | Reference |
|---|------|-----------|----------|-----------|
| 1 | **Flat Icon** (default) | White | Blogs, docs, presentations | `references/style-1-flat-icon.md` |
| 2 | **Dark Terminal** | `#0f0f1a` | GitHub, dev articles | `references/style-2-dark-terminal.md` |
| 3 | **Blueprint** | `#0a1628` | Architecture docs | `references/style-3-blueprint.md` |
| 4 | **Notion Clean** | White, minimal | Notion pages, internal docs | `references/style-4-notion-clean.md` |
| 5 | **Glassmorphism** | Dark gradient | Product sites, keynotes | `references/style-5-glassmorphism.md` |
| 6 | **Claude Official** | Warm cream `#f8f6f3` | Anthropic-style diagrams | `references/style-6-claude-official.md` |
| 7 | **OpenAI Official** | Pure white `#ffffff` | OpenAI-style diagrams | `references/style-7-openai.md` |

Default is style 1. Load the matching numbered reference for exact color tokens
and SVG patterns; load `references/style-diagram-matrix.md` when choosing a
style for a given diagram type is itself the question.

## Output format

Two files, reported back as paths:

```
<name>.svg    the diagram — hand-written or rendered by generate-from-template.py
<name>.png    rsvg-convert -w 1920 <name>.svg -o <name>.png   (1920px = 2× retina)
```

`<name>` is derived from the subject (or given by the user with `--output
/path/` / `输出到 /path/`) and both files go to the current directory unless a
path is given. `generate-diagram.sh` without `-o` names them `<type>-style<N>`.

The SVG is deliverable only when `bash scripts/validate-svg.sh <name>.svg` exits
0. Its eight checks, in order; any ✗ fails the run. Checks 3 and 5 shell out to
`python3`, and on malformed XML check 5 aborts the script before 6 and 7 can
report — so read check 0's result first:

| # | Check | Fails when |
|---|---|---|
| 0 | XML syntax (`xmllint --noout`) | not well-formed — skipped with a warning if `xmllint` is absent |
| 1 | Tag balance | count of opening tags ≠ self-closing `/>` + closing tags |
| 2 | Attribute quotes | any `attr=value` without quotes |
| 3 | Text entities | a bare `&` inside text — **warning only**, never fails |
| 4 | Marker references | a `marker-end="url(#id)"` whose `id` has no `<marker id="…">` — **and**, because the script strips the characters `i d = "` from every defined id (`tr -d 'id="'`), any defined marker whose id contains an `i` or a `d`, or whose `id` is not the element's first attribute, is reported missing. `arrowA` passes; `arrow-red`, which style 1 teaches, false-fails. Name markers without `i`/`d` until the script is fixed |
| 5 | Arrow collisions | a horizontal or vertical segment of a `<line>` or `M`/`L` `<path>` carrying `marker-end` passes clean through the interior of a node — a `<rect>` 70–700 × 30–500 px without `stroke-dasharray`, a `<circle>` r ≥ 20, or an `<ellipse>` rx, ry ≥ 20. A segment that starts or ends inside the node is not flagged; diagonal segments are not tested; dashed or out-of-range rects count as containers and are ignored |
| 6 | Closing tag | no `</svg>` |
| 7 | Render | `rsvg-convert` cannot rasterise it — skipped with a warning if `rsvg-convert` is absent |

What the script does **not** check, and the Quality gates cover: text overflow,
missing label background rects, legend presence, and anything visual.

## Quality gates

- [ ] `bash scripts/validate-svg.sh` exited 0 on the delivered SVG, with checks 0 and 7 actually run, not skipped — a skipped render check means the PNG was never proven
- [ ] No arrow passes through a component interior and every arrow anchors on a shape edge; the script flags only axis-aligned segments that pass clean through, so curved routes and segments ending inside a box were confirmed on the rendered image when image reading was available
- [ ] All text fits its shape with 8px padding (`text.length × 7px ≤ shape_width − 16px`) and every arrow label has a background rect — neither is script-checked
- [ ] A legend is present whenever two or more arrow types appear, and each arrow's meaning follows the Arrow Semantics table while its color, stroke weight and dash follow the loaded style
- [ ] For hand-written SVG, style tokens — colors, fonts, marker sizes — come from the loaded `references/style-N-*.md`, not from memory of what the style looks like; generator output takes them from the script's built-in profiles, which do not match the references in every detail
- [ ] The PNG was exported at 1920px and both paths were reported; if a visual self-review was skipped, the report says so rather than implying the image was checked

## Workflow position

**Typically follows:** `av:brainstorm` or `av:plan` when the system just decided
on is the one being drawn; otherwise nothing — a diagram request usually starts
here.

**Typically precedes:** `av:docs` when the diagram is being embedded into
project documentation.

**Related:** `av:mermaidjs-v11` produces text diagrams that render inline in
markdown and cannot be styled or validated the way an SVG can — use it when the
diagram lives in a document, this skill when it is a published artefact.
`av:excalidraw` produces an editable canvas for diagrams that will keep
changing. Both of those skills load this one's Layout Rules when reviewing their
rendered output for collisions. `av:preview --html --diagram <topic>` builds its
own zoomable HTML diagram of a subject and routes here when the output must be a
publish-grade SVG/PNG.
