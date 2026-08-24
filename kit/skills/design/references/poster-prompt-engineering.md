# Poster Prompt Engineering

How the poster generator assembles prompts and how to tune them for specific image models.

## Anatomy of a Prompt

Every generated prompt has 7 blocks:

1. **Aspect declaration** — `--aspect a2|a3|square|landscape`
2. **STYLE (locked)** — name, category, description, mood, era, hints
3. **PALETTE (locked)** — name, hex colors, contrast, mood
4. **TEXTURE/MATERIAL (locked)** — material, finish, effect, rendering hints
5. **COMPOSITION (varied)** — grid, whitespace, hierarchy order, focal anchor, secondary positions, shape set, density, rotation jitter
6. **COPY SLOTS** — headline (derived from topic), sub, meta
7. **CONSTRAINTS** — explicit "lock these / vary only these" instructions

The locked vs varied split is the whole point: explicit axes preserve the
selected identity while seeded composition choices provide controlled variety.

## Axis Selection Semantics

The parser accepts `--lock-axis`, but the current generator does not apply its
value. Do not rely on it. Lock an axis across separate calls by passing the
same explicit `--style`, `--palette`, `--layout`, or `--texture` value each
time; use different `--seed` values only for the remaining randomized details.

Use cases:
- **Brand series**: repeat explicit style, palette, and texture values; omit
  layout to vary it.
- **Texture study**: repeat an explicit texture while varying style and palette.
- **Free exploration**: omit explicit axis values.

## Variation Pools

The Shape Pool per style is aggregated from member-image `shape_primitives`
during clustering. Per call, the generator samples between 2 and 4 available
primitives; different seeds may produce different sets but do not guarantee
unique results.

When the selected layout has no focal anchor, the fallback position comes from
a 9-cell grid (3×3). Density picks from `sparse|medium|dense`, rotation jitter
from `[-8°, +8°]`, and hierarchy order is shuffled.

## Model-Specific Tweaks

### Gemini Nano Banana 2 (gemini-3.1-flash-image-preview)

- Reads structured prompts well. The block format above maps cleanly.
- Strong texture/material fidelity — locked TEXTURE block holds.
- Recommend passing prompt as-is.

### GPT Image / GPT-5 Image

- Prefers natural-language prose over bullet structure. Consider piping through a paraphrase step if results feel literal.
- Less reliable at preserving exact hex colors. Pre-load palette as `using a palette dominated by {hex1} and {hex2}` in the headline of the COPY block.

### Imagen / Midjourney

- Imagen: works well with the structured format.
- Midjourney: shorten prompt; emphasize style + texture; rely on `--ar` flag from aspect mapping instead of millimeter dimensions.

## Determinism

`--seed N` makes prompt assembly deterministic — same seed produces same prompt. The image model itself may still introduce sampling variance unless you pass a model-side seed.

## Failure Modes & Fixes

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Outputs in a series look near-identical | Shape Pool too thin for that style | Re-run `cluster.py` after adding more reference images, or widen variation by sampling more shapes |
| Style drifts between calls in a series | Style description too generic | Curate the Style Name + Description rows manually in `poster-styles.csv` |
| Texture not preserved | Model ignored TEXTURE block | Repeat texture material/finish in COPY block or pre-pend to the prompt |
| Color palette ignored | Model deprioritized hex codes | Convert hex to named colors in palette CSV (e.g. "deep navy #0a1f4a") |

## Editing CSVs Manually

The CSVs are the source of truth at runtime. After `cluster.py` produces drafts, you can hand-edit any cell to refine. The audit trail (`data/poster/analysis/clusters.json`) shows which source images map to which cluster — useful when refining style descriptions.

Keep cell values comma-safe (CSV-escape if needed). Re-running `cluster.py` overwrites edits unless you guard your edits in a separate branch / commit.
