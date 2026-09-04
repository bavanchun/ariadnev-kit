---
name: av:diagram
description: "Render editorial-grade diagrams as deterministic PNG/SVG, self-contained HTML, or MP4/GIF from Mermaid source, 24 vendored templates, or raw HTML. Use for static images or animated connector clips."
user-invocable: true
when_to_use: "Invoke for editorial-grade static or animated diagram artifacts rendered through the vendored Mermaid and template pipeline."
category: dev-tools
keywords: [diagram, mermaid, animation, architecture, flowchart, sequence, loop, pyramid, quadrant, radar, timeline, gantt, editorial, svg, png, mp4, gif]
argument-hint: "[--input file.mmd|spec.json|page.html] [--type <slug>] [--out <dir>]"
metadata:
  origin: ported
  author: upstream
  version: "1.0.0"
  attribution: "Editorial templates and the three geometry/motion validators vendored from cathrynlavery/diagram-design (MIT, see LICENSE); Mermaid 11.4.1 (MIT) vendored at assets/mermaid.min.js"
  license: MIT
  upstream: "github.com/cathrynlavery/diagram-design"
  upstream_sha: "09df49d8d1a1c7fb2efdfcdc7a2a0713534350a6"
  upstream_templates: cathrynlavery/diagram-design (MIT)
  vendored_mermaid_version: "11.4.1"
  imported_at: "2026-08-30"
---

# av:diagram — unified editorial diagram surface

Generate diagrams that read like a curated editorial page: strict ink-on-paper
palette, one accent for the eye, geometry that carries meaning, and optional
animation for flow. Three tiers of input, one deterministic pipeline out.

## Route carefully

`av:diagram` overlaps other skills that also touch diagrams. Pick by artifact,
not by keyword — several skills mention "diagram" in their description.

| Task | Skill |
|------|-------|
| Static editorial PNG/SVG or animated MP4/GIF from a 24-type template | **av:diagram** (this skill) |
| Plain Mermaid render, no editorial framing | av:mermaidjs-v11 or av:diagram --input file.mmd |
| Editable Excalidraw canvas, MCP live editing | av:excalidraw |
| Codebase auto-visualization ("diagram this repo") | av:excalidraw |
| Large graph exploration, node/edge analytics | av:graphify |
| Whiteboard-style hand-drawn look | av:excalidraw |
| Publish-grade SVG in one of seven fixed visual styles | av:tech-graph |

`av:preview` documents when a visual explanation is worth producing at all;
this skill executes once that decision is made.

## Three input tiers

**Tier 1 — Mermaid source (`.mmd`)**
Wraps the source in an editorial frame (tokens.css + vendored mermaid.min.js),
extracts SVG, screenshots PNG. Zero template lookup, fastest path.

**Tier 2 — Editorial template (`.json` spec + `--type <slug>`)**
Loads a vendored template from `assets/templates/<type>/<variant>.html` and
applies flat `{{key}}` slot replacement from the JSON spec. 24 base types ×
3 variants (light / dark / full) = 72 templates. See
`references/per-type-schemas/*.json` for the intended spec shape.

> **Current limitation:** upstream templates ship as finished exemplars with
> **no `{{key}}` slots declared yet**. Tier 2 is fully wired in `render.py`,
> but until slots are added to the templates the JSON spec's structured
> keys (`nodes`, `layers`, `series`, …) do not render. The workflow today:
> start from the vendored HTML, hand-customize the content, then render as
> Tier 3. Adding slots to selected templates is an incremental follow-up.

**Tier 3 — Raw HTML (`.html`)**
Passes through untouched. Use when you already composed a page or want to
render an artifact from another tool.

## Output artifacts

For each render call the pipeline emits (opt-out via flags):
- `<basename>.html` — self-contained, animated, mobile-safe
- `<basename>.png` — frozen final frame at 2× DPI (deterministic)
- `<basename>.svg` — extracted SVG source when present

For `record.py` the pipeline emits:
- `<basename>.mp4` (h264, crf=18) — default
- `<basename>.gif` — palette-generated GIF when `--gif` is passed

## Setup

Every command below runs from this skill's directory. The scripts need Python
3.10+ with `playwright` (and `pyyaml` for the snapshot suite) — declared in
`scripts/requirements.txt` — plus a Chromium that Playwright can launch.
Nothing here downloads a browser or a package on your behalf.

```bash
# One-time dep probe (never installs anything on your behalf)
python3 scripts/doctor.py

# Vendor / re-vendor upstream templates (idempotent)
git clone --depth 1 https://github.com/cathrynlavery/diagram-design.git /tmp/dd-src
python3 scripts/vendor_from_upstream.py --source /tmp/dd-src
```

The scripts use the shared skill venv when one exists beside the installed
skill tree (`.claude/skills/.venv/bin/python3`), or the root named by
`ARIADNEV_HOME`. `doctor.py` probes Chromium under `$PLAYWRIGHT_BROWSERS_PATH`
(default `/opt/pw-browsers`); point that variable at Playwright's own browser
cache when the browser was installed with `playwright install chromium`.
`ffmpeg` is optional (needed only for `record.py`).

## Common tasks

**Render a Mermaid diagram to PNG + SVG:**
```bash
python3 scripts/render.py --input diagram.mmd --out ./build/
```

**Render an editorial loop from a JSON spec:**
```bash
cat > loop.json <<'EOF'
{
  "variant": "light",
  "title": "Fast-feedback loop",
  "nodes": ["Observe","Orient","Decide","Act"]
}
EOF
python3 scripts/render.py --input loop.json --type loop --out ./build/
```

**Record an animation to MP4:**
```bash
python3 scripts/record.py --input diagram.html --out clip.mp4 --duration 6 --fps 30
python3 scripts/record.py --input diagram.html --out clip.gif --gif --duration 4 --fps 20
```

**Verify goldens haven't drifted (pinned Chromium/font profile required):**
```bash
uv venv .snapshot-venv
uv pip install --python .snapshot-venv/bin/python -r references/snapshot-requirements.txt
PLAYWRIGHT_BROWSERS_PATH=.snapshot-browsers .snapshot-venv/bin/python -m playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=.snapshot-browsers .snapshot-venv/bin/python scripts/snapshot_test.py --all
# After an intentional visual change, replace --all with --update-goldens.
```

**Run the advisory validators over a rendered diagram (opt-in):**
```bash
av skill run diagram scripts/validators/run-validators.sh out/diagram.html
```

Three validators sit in `scripts/validators/`, vendored from the same upstream as
the templates:

| Validator | What it checks |
|---|---|
| `self_check.py` | the accessible-SVG contract, and the single-file safety rules — no remote asset beyond the approved font stylesheet, no executable attributes, no script but the canonical motion controller |
| `verify-geometry.py` | that no arrow-label mask is clipped by a node painted after it, which renders the label as a fragment on the node border |
| `verify-motion.py` | the structural motion contract: one motion root, known modes and actions |

They are opt-in and are never invoked by a render. They need Python 3 and a
rendered artefact that already exists, and they are **advisory** — the wrapper
reports each verdict and exits zero, so a validator cannot fail a delivery.

Two of them disagree with a perfectly good artefact by design, and it is worth
knowing which before reading their output. `verify-motion.py` applies only to a
diagram carrying motion markup and reports every static one. All three resolve
their default asset directory against the upstream repository's layout, which
does not exist inside this skill, so pass explicit file paths — the `--all` flag
finds nothing here.

**What gates them, stated exactly.** `scripts.executionPolicy: never` refuses the
`av skill run` invocation above, and nothing else. An agent that runs
`bash scripts/validators/run-validators.sh` or `python3 scripts/validators/…`
directly executes third-party code with no gate in front of it — the policy is
inert against that path. The three Python files are MIT-licensed upstream code
covered by `LICENSE`, pinned by sha in `references/vendoring-metadata.yaml`;
`run-validators.sh` is this kit's own and carries no upstream attribution.

## Animation effects

Eight zero-dependency SVG connector effects live in
`assets/connector-effects.css`. Apply via `data-fx="<name>"` on any `<path>`:

| Effect | data-fx | What it does |
|--------|---------|--------------|
| marching-ants | `marching-ants` | dashed stroke slides along the path |
| comet | `comet` | short bright segment travels along the path |
| wave | `wave` | sinusoidal amplitude on stroke width |
| morse | `morse` | dot-dash pattern travels along the path |
| glow | `glow` | pulsing drop-shadow |
| silhouette | `silhouette` | tiny shape rides the path via offset-path |
| pulse | `pulse` | opacity + width breath |
| dashed-flow | `dashed-flow` | slow dash-drift for background flows |

Full effect catalog with CSS variable knobs is in `references/animation-effects.md`.
Reduced-motion is respected automatically — effects freeze under
`prefers-reduced-motion: reduce`.

## Determinism

- Vendored `mermaid.min.js` is pinned to a specific version and hashed.
- `document.getAnimations().currentTime = duration; a.pause()` freezes every
  animation before screenshot, so the PNG byte-hash is stable.
- Chromium launched with `--font-render-hinting=none --disable-lcd-text` to
  strip subpixel drift.
- Video capture steps `currentTime` frame-by-frame instead of using vsync-based
  `record_video`, so MP4 output is reproducible across runs.

Golden PNG hashes live in `references/snapshot-hashes.yaml`. Snapshot verification
requires Chromium 151.0.7922.34 and the recorded generic plus effective
Geist/Geist Mono/Instrument Serif font-stack metrics; another renderer profile
refuses to compare instead of reporting a misleading byte-hash drift. Any
intentional visual change requires re-running
`scripts/snapshot_test.py --update-goldens` in that profile and committing the
updated hashes.

## Output format

Report, for every render or recording:

- the input tier used (Mermaid, template `<type>/<variant>`, or raw HTML) and
  the exact `render.py` / `record.py` command;
- every artifact path written (`.html`, `.png`, `.svg`, `.mp4`, `.gif`) with
  the viewport, device scale factor, duration and fps that produced it;
- which effects (`data-fx`) were applied and on which connectors;
- the `doctor.py` verdict when a dependency was missing, and what the user has
  to install — never an attempt to install it for them.

## Quality gates

- [ ] `scripts/doctor.py` reported READY before the first render, or the missing
  dependency was named to the user instead of worked around
- [ ] One accent color per diagram and at most one effect per path — a stacked
  or second accent reads as noise and fails the editorial contract
- [ ] The PNG was captured after the freeze step, so a second run of the same
  command yields the same byte-hash; if it does not, the cause was found
  (fonts, viewport, unpinned Mermaid) rather than the hash being ignored
- [ ] A Tier 2 render was checked for unreplaced `{{key}}` tokens in the
  emitted HTML — the templates ship without slots, so a JSON spec that looks
  accepted may have rendered the exemplar unchanged
- [ ] `record.py` output was opened and its first and last frames match the
  intended loop boundary; `--keep-frames` was used when a frame looked wrong
- [ ] Golden hashes were only updated with `--update-goldens` inside the pinned
  Chromium/font profile, never edited by hand

## Workflow position

**Typically follows:** `av:brainstorm` or `av:plan` when the system just decided
on is the one being drawn; `av:preview` when it has ruled that a visual is worth
producing at all.

**Typically precedes:** `av:docs` when the PNG/SVG is embedded into project
documentation; `av:media-processing` when an MP4/GIF needs further encoding.

**Related:** `av:mermaidjs-v11` owns Mermaid syntax and plain, unframed renders;
`av:excalidraw` owns editable canvases and codebase auto-maps; `av:graphify`
owns large-graph exploration; `av:tech-graph` owns publish-grade SVG in its
seven fixed styles. This skill owns the editorial frame, the 24 vendored
templates, animated connectors, and deterministic image/video capture.

## References

- `references/animation-effects.md` — full effect catalog + CSS var API
- `references/mermaid-input.md` — Mermaid-specific tips and constraints
- `references/per-type-schemas/` — one JSON schema per editorial type
- `references/vendoring-metadata.yaml` — upstream provenance + template hashes
- `references/snapshot-hashes.yaml` — golden PNG byte-hashes
- `references/snapshot-requirements.txt` — exact pins for the golden profile

## Attribution

Editorial templates vendored from
[cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design)
(MIT). Animation concepts adapted (not vendored) from
[ngothanhtung/flow-diagram](https://github.com/ngothanhtung/flow-diagram).
Mermaid v11 (MIT) vendored at `assets/mermaid.min.js`; the bundle keeps the
licence banners of the libraries it embeds. Per-file provenance, upstream
commit, and content digests live in `references/vendoring-metadata.yaml`.
