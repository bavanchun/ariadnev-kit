---
name: av:ai-artist
description: "Generate mockups, marketing assets, and concept art via Nano Banana from 129 curated prompts (Ukiyo-e, Bento grid, cyberpunk). Use for curated-prompt image generation: search, creative, wild."
user-invocable: true
when_to_use: "Invoke for visual assets, prompt search, or mockups."
category: ai-ml
keywords: [image, generation, prompts, styles]
metadata:
  origin: ported
  author: upstream
  version: 3.1.0
argument-hint: "[concept] [--mode search|creative|wild|all] [--provider auto|google|openrouter] [--skip]"
---

# AI Artist - Nano Banana Image Generation

Generate images using 129 curated prompts from awesome-nano-banana-pro-prompts collection.
`generate.py` renders through the same pinned Multix CLI `av:ai-multimodal` uses
(`npx -y -p @mrgoonie/multix@0.2.0 multix gemini|openrouter generate`), so one
prompt workflow reaches direct Google or OpenRouter-backed Google models.

**Validation interview is mandatory** (pass `--skip` to the skill invocation to bypass).

## Workflow

1. **Validation interview** — unless the invocation carries `--skip`, confirm
   with the user before rendering: subject, intended use (banner, mockup,
   avatar, poster), style or named look, mood, dominant colors, aspect ratio,
   and mode. Ask one grouped question; reuse answers already in the request.
   `--skip` is a skill argument, not a `generate.py` flag — the script rejects it.
2. **Preview the prompt** with `--dry-run -v` and check the `[SEARCH] Matched:`
   title fits the concept (see Quality gates).
3. **Render** with the agreed flags, then report per Output format.

## Quick Start

Run scripts through the kit's script runner (the `--` separator is required so
the script's own flags are not parsed as `av` options), or with `python3` from
the skill directory:

```bash
av skill run ai-artist -- scripts/generate.py "<concept>" -o <output.png> [--mode MODE] [--provider PROVIDER]
python3 scripts/generate.py "<concept>" -o <output.png> [--mode MODE] [--provider PROVIDER]
```

### Generation Modes

| Mode | Description |
|------|-------------|
| `search` | Find best matching prompt from 129 curated prompts (default) |
| `creative` | Remix elements from top 3 matching prompts |
| `wild` | Out-of-the-box creative interpretation (random style transform) |
| `all` | Generate all 3 variations |

### Examples

```bash
# Default search mode
python3 scripts/generate.py "tech conference banner" -o banner.png -ar 16:9

# Route through OpenRouter while keeping Nano Banana prompt behavior
python3 scripts/generate.py "tech conference banner" -o banner.png --provider openrouter

# Creative remix (combines multiple prompts)
python3 scripts/generate.py "AI workshop" -o workshop.png --mode creative

# Wild/experimental (random artistic transformation)
python3 scripts/generate.py "product showcase" -o product.png --mode wild

# Generate all 3 variations at once
python3 scripts/generate.py "futuristic city" -o city.png --mode all -v
```

### Options

| Flag | Description |
|------|-------------|
| `-o, --output` | Output path (required) |
| `-m, --mode` | search, creative, wild, or all |
| `--provider` | auto (default), google, or openrouter |
| `-ar, --aspect-ratio` | 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9 (default 1:1) |
| `--size` | 1K, 2K (default), or 4K |
| `--model` | flash2 (default, fast+quality), flash (previous), pro (quality/4K) |
| `-v, --verbose` | Show matched prompts, provider, model, and the full prompt |
| `--show-prompt` | Print the built prompt (without the rest of `-v`) |
| `--dry-run` | Build the prompt without generating |

`--provider auto` honors `IMAGE_GEN_PROVIDER=google|openrouter` when set; otherwise it picks
OpenRouter only when `OPENROUTER_API_KEY` is set and `GEMINI_API_KEY` is not.

With `--mode all`, each variation is written next to `-o` as
`<stem>-search`, `<stem>-creative`, `<stem>-wild` plus the original suffix.

---

## Prompt Database

**129 curated prompts** extracted from awesome-nano-banana-pro-prompts:

```bash
# Two of core.py's seven domains ship a CSV: `awesome` and `platform`. Always
# pass one of them. Omitting --domain lets detect_domain() route on keywords and
# fall back to `style`, whose CSV is absent — that is the "File not found" path.
python3 scripts/search.py "<query>" --domain awesome
python3 scripts/search.py "<query>" --domain platform

# View all prompts
cat data/awesome-prompts.csv
```

### Categories include:
- **Profile/Avatar**: Thought-leader headshots, mirror selfies
- **Infographics**: Bento grid, chalkboard, ingredient labels
- **Social Media**: Quote cards, banners, thumbnails
- **Product**: Commercial shots, e-commerce, Apple-style
- **Artistic**: Ukiyo-e, patent documents, vaporwave, cyberpunk
- **Character**: Anime, chibi, comic storyboards

---

## Wild Mode Transformations

The `wild` mode randomly applies one of these artistic transformations:

- Japanese Ukiyo-e woodblock print
- Premium liquid glass Bento grid infographic
- Vintage 1800s patent document
- Surreal dreamscape with volumetric god rays
- Cyberpunk neon aesthetic with holograms
- Hand-drawn chalkboard explanation
- Isometric 3D diorama
- Cinematic movie poster
- Vaporwave aesthetic with glitch effects
- Apple-style product showcase

---

## References

| Topic | File |
|-------|------|
| All Prompts | `data/awesome-prompts.csv` |
| Nano Banana Guide | `references/nano-banana.md` |
| Image Prompting | `references/image-prompting.md` |

---

## Scripts

| Script | Purpose |
|--------|---------|
| `generate.py` | Main image generation with 3 modes |
| `search.py` | Search prompts database |
| `core.py` | BM25 search engine |

## Output format

```markdown
## Generated: <concept>
- Interview: answered | skipped (--skip)
- Mode: search | creative | wild | all · Provider: google | openrouter · Model: <model id from -v>
- Matched prompt: "<[SEARCH] Matched title>" by <author> — or "fallback generic prompt"
  (creative: the 3 remixed titles; wild: the `[WILD] Transform:` line)
- Aspect/size: <ar> / <size>

| File | Status |
|------|--------|
| <path> | written / `✗ Error: <message>` |

Next: regenerate with --mode creative|wild, change -ar/--size, or hand off.
```

## Quality gates

- [ ] The interview ran, or the invocation carried `--skip` — and `--skip` was
      never passed to `generate.py`, which exits on the unknown flag.
- [ ] `--dry-run -v` showed a `[SEARCH] Matched:` title that fits the concept;
      with no match the script silently renders a generic "professional image
      of <concept>" prompt, which is not a curated result.
- [ ] Every reported file exists on disk: the script prints `✗ Error:` but still
      exits 0, so the exit code proves nothing.
- [ ] `search.py` was always called with `--domain awesome` or `--domain
      platform` — the only two whose CSV ships.
- [ ] The request was a rendered asset, not a brand identity or poster system —
      those belong to `av:design`.

Proof/risk: N/A — produces image files; no code path changes.

## Workflow position

**Typically follows:** `av:design` when a brand package already fixes style and
palette and this skill renders assets inside it, or `av:copywriting` when the
asset carries approved copy.
**Typically precedes:** `av:media-processing` for crop, resize, or background
removal of the rendered file; `av:ai-multimodal` to analyze the result against
the brief.
**Related:** `av:ai-multimodal` owns the pinned Multix backend this skill renders
through; call it directly for free-form generation without the curated prompt
library.
