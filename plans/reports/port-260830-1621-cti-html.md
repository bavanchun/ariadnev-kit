# Port: cti-expert `--format html` (HTML mirror of the DOCX report)

Date: 2026-08-30 · Branch: `worktree-agent-aa3c073babe3544fe` · Scope: `kit/skills/cti-expert/**` only

Closes the one capability gap the a-to-m scout left open for cti-expert
(`scout-260830-1604-skills-a-to-m-ak-vs-av.md` row 34 / gap #6). Upstream's
feature is prompt-level only — a ~25-line SKILL.md section that maps each DOCX
chart to an AntV or diagram-design engine and points at two `ak-preview`
references; there is no upstream script or template that renders the HTML.
Ariadnev now carries a real renderer that reads the same MD + JSON the DOCX
generator reads and places the same visuals under the same headings.

## Upstream → ariadnev

| Upstream (read-only) | Lines | Ariadnev file | Lines | What moved |
|---|---|---|---|---|
| `ak-cti-expert/SKILL.md` L8 `argument-hint` `[--format html\|md]` | 1 | `cti-expert/SKILL.md` frontmatter | 1 | `[--format html]` added; `md` dropped (see questions) |
| `ak-cti-expert/SKILL.md` L498–522 `### HTML mirror` | 25 | `cti-expert/references/report-formats.md` `### HTML mirror` | 56 | Purpose, three command forms, engine table, CDN note, file naming |
| — (no upstream script) | — | `cti-expert/scripts/generate-cti-html.py` | 367 | Entry point: pandoc/`markdown` narrative, keyword injection, appendix, page shell |
| — (no upstream script) | — | `cti-expert/scripts/cti_html_visuals.py` | 257 | Inline-SVG gauge/pie/bar, CSS timeline, Mermaid entity map + network topology |
| `cti_docx_postprocess.py` `CHART_KEYWORDS` + matcher (existing av file) | 17 | `cti-expert/scripts/cti_report_headings.py` | 27 | Extracted so the HTML path shares the placement contract without importing python-docx; `cti_docx_postprocess.py` now imports it (−17/+4 lines, behaviour unchanged) |
| `ak-preview/references/html-antv-infographic.md`, `html-diagram-design.md` (cited by upstream) | n/a | not ported | — | AntV / diagram-design are non-goals; the reference links `av-preview/references/html-libraries.md` instead for the Mermaid CDN form |

Touched docs: `SKILL.md` 249 → 255 lines (limit 300); `references/report-formats.md`
178 → 233 (limit 800); `references/architecture.md` script tree; `references/command-reference.md`
one Deliver row; `README.md` one `<sub>` line. `metadata.version` 2.0 → 2.1.

## Replaced or cut

Upstream's engine table (9 rows) versus what ships here:

| Upstream row | Upstream preferred engine | Ariadnev rendering |
|---|---|---|
| Pie (finding types) | AntV `ChartPie` → Chart.js | Inline SVG sectors + legend (`cti_html_visuals._pie`) |
| Bar (severity) | Chart.js bar | Inline SVG horizontal bars (`_hbar`) |
| Gauge (exposure) | AntV `CircularProgress` → Chart.js doughnut | Inline SVG semicircle with the DOCX's four colour bands (`risk_gauge`) |
| Timeline | AntV `timeline-*` / diagram-design → Mermaid gantt | `<ol class="timeline">` with CSS dots (mirrors the DOCX dot-and-text list; Mermaid gantt would force fake durations onto point events) |
| Entity relationship | diagram-design Data flow → Mermaid graph | Mermaid `flowchart TD`, node colour by subject type, arrow weight by relationship |
| Network topology | diagram-design Data flow → Mermaid graph | Mermaid `flowchart LR` over domain/ip/organization subjects (same filter as `add_network_topology`) |
| DP security matrix / DP integration / Medallion | diagram-design types #25/#27/#28 | **Cut** — no DOCX counterpart exists in `cti_docx_charts.py` / `cti_docx_diagrams.py`; these rows described diagram-design templates, not report data |
| Resolution ladder (`--no-editorial-visuals` > `--no-antv` > config yaml) | — | **Cut** — nothing to disable; the page has one optional engine (Mermaid) with an automatic fallback |
| AgentWiki `--wiki` UMD inlining (~874 KB) | — | **Cut** — the wiki CSP problem was AntV-specific; the page fetches only Mermaid and degrades to an edge list |

Chart.js was considered and not used: inline SVG makes every chart visible with
no script, offline, and under any CSP, which is the incident-response case the
feature exists for. Mermaid is the page's only external resource, loaded as an
ES module from `https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs`
(the exact form in `kit/skills/preview/references/html-libraries.md` L14). If
the import throws or JavaScript is off, `html.no-mermaid` / `<noscript>` reveal
a plain edge list (`A —owns→ B`) already present in each figure. No SRI hash:
the preview skill pins none either, and a floating `@11` cannot carry one.

## Did the renderer run?

Yes, three times, with `~/.claude/skills/.venv/bin/python3` (3.14), pandoc from
Homebrew, no installs:

| Mode | Inputs | Result |
|---|---|---|
| JSON-only | `scripts/sample-cti-report-data.json` | 21 KB page; all 5 visual groups inline under the INTSUM-ordered headings the script builds |
| Hybrid | scratchpad INTSUM-shaped `.md` + the sample JSON | 17 KB; gauge under *Executive Summary*, pie+bar under *Key Findings*, both graphs under *Entity Relationship Map*, timeline under *Timeline*; visitor charts moved to the *Visual Analytics* appendix — the same outcome `report-formats.md` documents for the DOCX (INTSUM has no visitor heading) |
| MD-only | the scratchpad `.md` | 8 KB narrative, cover titled from the report's own H1, no visuals |

Each output was parsed with `html.parser` (balanced tags, no errors) and the
heading → figure order was listed. Mermaid source was eyeballed for valid v11
syntax (`-->|"label"|`, `==>`, `-.->`, `classDef`), not browser-rendered — see
questions. `python -c "import cti_docx_postprocess"` still succeeds after the
extraction and `_heading_matches` matches the Vietnamese keyword set as before.

Verification run: `py_compile` on all three scripts; `wc -l`; `rg` of the
staged diff for `ak-`/`ak:`/`AgentKit`/`agentkit`/`antv` (clean — the one
mention of AntV was reworded, and CSS `page-break-*` became `break-*` so no
`ak-` substring survives); `~/.local/bin/av validate --strict` → all checks
passed, no warning names cti-expert; `node packages/cli/scripts/check-brand-drift.mjs`
on the staged tree → clean. Not run: any test suite, build, install, or the
DOCX generator.

Frozen corpus: `evals/context/corpus-manifest.json` does **not** list
cti-expert (`rg cti-expert` → no match), so the benchmark is unaffected.

## Conventions

- New importable module names are snake_case (`cti_html_visuals.py`,
  `cti_report_headings.py`) because Python cannot import kebab-case; this
  matches the existing `cti_docx_*.py` siblings. The entry point is
  kebab-case like its sibling `generate-cti-docx-hybrid.py`.
- No `av` command is cited beyond `av validate`; no `ak` CLI calls.
- `kit-embedded.generated.ts` untouched — the embedded kit will need a
  regeneration by whoever owns that step.

## Unresolved questions

1. **`--format md`** — upstream's hint lists `html|md` but never defines `md`.
   Dropped rather than invent semantics; add it if the maintainer wants a
   "markdown only, skip DOCX" switch.
2. **Browser render of the Mermaid blocks** was not done (no browser tooling
   used in this worktree). The syntax matches the v11 forms in
   `preview/references/html-libraries.md`; a one-time open of
   `scratchpad/hybrid.html` in a browser would close this.
3. **SRI for Mermaid** — pinning `mermaid@11.x.y` with an `integrity` hash is
   possible but the preview skill floats `@11` without one; kept consistent.
4. **`install.sh` / `tool-auto-install.md`** were not changed: pandoc is already
   installed there for the DOCX path and the HTML path adds no package. If the
   maintainer wants the `markdown` fallback guaranteed, it would need a
   `requirements.txt` line — deliberately not added (no new pip dependency).
