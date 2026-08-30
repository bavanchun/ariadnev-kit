# Report Formats and Export

What every delivery command produces, and the exact JSON contract the DOCX
generator expects. The format rules here are not stylistic — the generator
fails or silently drops content when they are not met.

### Mandatory File Export (CRITICAL)

**Every `/report`, `/brief`, and `/case` command MUST auto-save two files to disk at the end of delivery:**

1. **Markdown report** — saved as `OSINT-REPORT-[CASE-ID]-[YYYY-MM-DD].md`
2. **Word document** — saved as `OSINT-REPORT-[CASE-ID]-[YYYY-MM-DD].docx`

**Save location:** Current working directory, or `./osint-reports/` subdirectory if it exists.

**DOCX generation (Rich format with charts & diagrams):**

**Step 1 — Build the DOCX-ready JSON file.** The Python generator expects a SPECIFIC flat format (NOT the engine case-schema.json). You MUST construct the JSON matching this exact structure before calling the script. Reference: `scripts/sample-cti-report-data.json`.

```json
{
  "case": {
    "id": "CTI-2026-001",          // string, case identifier
    "label": "Case Title",         // string, human-readable name
    "classification": "OPEN SOURCE", // string
    "analyst": "AI-Assisted CTI",  // string
    "date": "2026-04-08",          // ISO date
    "subject": "target.com",       // string, primary subject
    "status": "active",            // string
    "exposure_score": 72           // integer 0-100 (optional, enables risk gauge)
  },
  "executive_summary": "Full paragraph summarizing investigation findings...",
  "subjects": [
    {
      "id": "SUB-001",            // string ID (not UUID)
      "label": "target.com",      // human-readable name — REQUIRED for display
      "type": "domain",           // lowercase: domain, person, ip, organization, email, username
      "confidence": 95,           // INTEGER 0-100 (not string like "VERIFIED")
      "verified": true,           // boolean
      "aliases": ["alias1"],      // string array
      "first_seen": "2025-01-15", // ISO date string
      "notes": "Primary domain"   // string
    }
  ],
  "findings": [
    {
      "id": "FND-001",            // string ID
      "subject_id": "SUB-001",    // links to subject
      "type": "infrastructure",   // credential, infrastructure, identity, exposure, behavioral, legal
      "weight": "HIGH",           // CRITICAL, HIGH, MEDIUM, LOW, INFO — drives severity colors
      "description": "Full description of the finding...",
      "source_url": "https://...",
      "collected_at": "2026-04-08T10:00:00Z",
      "confidence": 88,           // INTEGER 0-100 (not string)
      "tags": ["tag1", "tag2"]
    }
  ],
  "connections": [
    {
      "id": "CON-001",
      "from_id": "SUB-001",       // subject ID
      "to_id": "SUB-002",         // subject ID
      "relationship": "owns",     // string describing relationship
      "strength": "confirmed"     // confirmed, probable, possible
    }
  ],
  "timeline": [
    {"date": "2025-01-15", "event": "Domain registered"}
  ],
  "sources": [
    {"name": "Source Name", "url": "https://...", "date": "2026-04-08"}
  ],
  "intelligence_gaps": [
    "Gap description string"
  ],
  "recommendations": [
    "Action item string"
  ],
  "visitor_stats": {              // optional — enables visitor intelligence charts
    "domain": "target.com",
    "monthly_visits": 150000,
    "traffic_sources": {"direct": 42, "search": 28, "referral": 15, "social": 10, "paid": 5},
    "top_countries": [{"country": "Vietnam", "share": 60}, {"country": "US", "share": 20}]
  },
  "caveats": ["Caveat string"]   // optional — overrides default methodology notes
}
```

**CRITICAL FORMAT RULES:**
- `confidence` on subjects and findings MUST be an **integer** (e.g., `85`), NOT a string (e.g., `"VERIFIED"`)
- `findings` MUST be a **flat top-level array**, NOT nested inside subjects
- `label` is REQUIRED on each subject (this is what displays in the report — not `value` or `display_name`)
- `weight` on findings drives severity coloring — use CRITICAL/HIGH/MEDIUM/LOW/INFO
- `recommendations` must be an array of **strings** (not objects with `priority`/`action` keys)
- All fields shown above should be **populated with actual data** — empty strings or "N/A" defeat the purpose
- Populate `executive_summary` with a full paragraph — this is the most-read section of the report

**Step 2 — Save the JSON and run the generator:**
```bash
# Primary: HYBRID generator — full narrative from MD + charts/diagrams from JSON
# This produces a complete DOCX with ZERO content loss from the MD report
python3 scripts/generate-cti-docx-hybrid.py \
  "OSINT-REPORT-[CASE-ID]-[YYYY-MM-DD].md" \
  "OSINT-REPORT-[CASE-ID]-[YYYY-MM-DD].json" \
  "OSINT-REPORT-[CASE-ID]-[YYYY-MM-DD].docx"

# Fallback 1: JSON-only generator (charts + structured data, less narrative)
python3 scripts/generate-cti-docx.py \
  "OSINT-REPORT-[CASE-ID]-[YYYY-MM-DD].json" \
  "OSINT-REPORT-[CASE-ID]-[YYYY-MM-DD].docx"

# Fallback 2: MD-only mode (styled narrative, no charts — JSON optional)
python3 scripts/generate-cti-docx-hybrid.py \
  "OSINT-REPORT-[CASE-ID]-[YYYY-MM-DD].md" \
  "OSINT-REPORT-[CASE-ID]-[YYYY-MM-DD].docx"

# Fallback 3: pandoc (basic text conversion, no styling or charts)
pandoc "OSINT-REPORT-[CASE-ID]-[YYYY-MM-DD].md" \
  -o "OSINT-REPORT-[CASE-ID]-[YYYY-MM-DD].docx" \
  --from markdown --to docx --standalone
```

**How the hybrid generator works:**
1. **Phase 1:** pandoc converts the MD file to a base DOCX (preserving ALL narrative content — tables, lists, formatting)
2. **Phase 2:** python-docx post-processes to add CTI professional styling, prepend cover page + TOC, and inject charts/diagrams from JSON at matching section headings

Matching is by keyword in the heading text, case- and accent-insensitive (`CHART_KEYWORDS` in `scripts/cti_report_headings.py`, applied by `scripts/cti_docx_postprocess.py`): risk gauge under a heading containing *executive summary*; finding charts under *findings*; timeline chart under *timeline*; entity diagram under *relationship* or *entity*; visitor charts under *visitor* or *traffic*. A chart whose keyword appears in no heading is appended under a trailing "Visual Analytics" heading instead of its section (`_append_remaining_charts`) — the four chart-bearing INTSUM headings in `handbook/report-template.md` match; visitor charts have no INTSUM section and land in the appendix whenever `visitor_stats` is present.

**The MD file is the primary content source.** It carries the full narrative (detailed person profiles, infrastructure tables, wallet addresses, corporate structure, legal history, etc.). The JSON file provides structured data for visual elements (charts, diagrams, risk gauge). Using both together produces a complete report with zero content loss.

**Rich hybrid DOCX includes:** Cover page titled "CTI REPORT", table of contents, **all narrative content from MD** (every paragraph, table, list, code block), pie chart (finding types), bar chart (severity), risk gauge (exposure score), timeline chart, entity relationship diagram, network topology diagram, traffic/geo charts, CTI-themed styling (navy headings, styled tables), header/footer with classification and page numbers.

**After saving, confirm all files to the user:**
```
📄 Report saved:
   → OSINT-REPORT-CASE001-2026-03-30.md
   → OSINT-REPORT-CASE001-2026-03-30.json
   → OSINT-REPORT-CASE001-2026-03-30.docx  (rich format with charts & diagrams)
```

### Report Formats

| Format | Command | Audience |
|--------|---------|---------|
| Technical INTSUM | `/report` | Analysts, security teams |
| Executive Brief | `/report brief` | Decision-makers, management |
| Plain-Language Summary | `/brief` | Non-technical stakeholders |
| Legal Evidence Format | `/report legal` | Attorneys, compliance teams |
| Journalist Format | `/report journalist` | Reporters, media |
| JSON Export | `/report json` | Downstream tools, pipelines |
| CSV Export | `/report csv` | Spreadsheets, databases |

All formats above auto-save as .md + .docx unless the format is inherently machine-only (JSON, CSV — those save as their native format only).

### HTML mirror (`--format html`, opt-in)

`--format html` on `/report`, `/brief`, or `/case` adds a browser-native mirror
of the DOCX beside it — same narrative, same visuals under the same headings —
for a recipient who needs a link-shareable file or an inline view without an
Office install. The default delivery (`.md` + `.docx`) is unchanged; the HTML is
additive, written by `scripts/generate-cti-html.py` from the same two inputs:

```bash
# Primary: hybrid — narrative from MD, visuals from JSON
python3 scripts/generate-cti-html.py \
  "OSINT-REPORT-[CASE-ID]-[YYYY-MM-DD].md" \
  "OSINT-REPORT-[CASE-ID]-[YYYY-MM-DD].json" \
  "OSINT-REPORT-[CASE-ID]-[YYYY-MM-DD].html"

# Fallback 1: JSON-only — sections built from the JSON in INTSUM order, every visual inline
python3 scripts/generate-cti-html.py \
  "OSINT-REPORT-[CASE-ID]-[YYYY-MM-DD].json" \
  "OSINT-REPORT-[CASE-ID]-[YYYY-MM-DD].html"

# Fallback 2: MD-only — styled narrative, no visuals
python3 scripts/generate-cti-html.py \
  "OSINT-REPORT-[CASE-ID]-[YYYY-MM-DD].md" \
  "OSINT-REPORT-[CASE-ID]-[YYYY-MM-DD].html"
```

The narrative goes through pandoc (`--from markdown --to html5`), or the Python
`markdown` package when pandoc is absent; the HTML path imports neither
python-docx nor matplotlib. Visuals are placed with the same keyword table the
DOCX uses (`scripts/cti_report_headings.py`), so a heading that places a chart
in the `.docx` places it in the `.html`, and the same leftovers go to a trailing
"Visual Analytics" section.

| DOCX visual | HTML rendering (`scripts/cti_html_visuals.py`) | When scripts cannot load |
|---|---|---|
| Risk gauge (exposure score) | Inline SVG semicircle, same four colour bands | Always shown — no script needed |
| Pie (finding types) | Inline SVG sectors + legend with counts | Always shown |
| Bar (severity) | Inline SVG horizontal bars, CRITICAL → INFO order | Always shown |
| Timeline | `<ol class="timeline">`, dated events earliest first | Always shown |
| Entity relationship map | Mermaid `flowchart TD`; node colour by subject type, arrow weight by relationship | Plain edge list (`A —owns→ B`) replaces the diagram |
| Network topology | Mermaid `flowchart LR` over domain / ip / organization subjects | Plain edge list |
| Traffic sources, visitor geography | Inline SVG bar and pie | Always shown |

Mermaid is the page's only external resource, imported as an ES module from
`https://cdn.jsdelivr.net/npm/mermaid@11/…` — the same form the preview skill
uses ([html-libraries](../../av-preview/references/html-libraries.md)); when the
import fails or JavaScript is off, the edge lists show instead. Nothing else is
fetched: CSS and every chart are inline, so the file can be mailed or opened
from disk. Mermaid and inline SVG are the only rendering engines.

**File naming:** `OSINT-REPORT-<CASE-ID>-<YYYY-MM-DD>.html` beside the `.md`,
`.json` and `.docx`; list it in the saved-files confirmation. Without an
explicit output path the script writes next to its first input, swapping the
extension for `.html`.

The per-format specifications live in `output/reports/`: `format-catalog.md`
(the F1–F7 layouts and the auto-save policy), `citation-guide.md` (how a source
is cited), `export-specs.md` (DOCX element rendering), and
`leadership-brief-template.md`. The INTSUM section order every report follows is
`handbook/report-template.md`.

### Visual Outputs

| Type | Command | Format |
|------|---------|--------|
| Subject relationship map | `/render entities` | **ASCII** (default) — `--mermaid` for Mermaid |
| Chronological timeline | `/render timeline` | **ASCII** Gantt |
| Exposure heatmap | `/render risk` | **ASCII** |
| Network topology | `/render network` | **ASCII** |

**All visual outputs use ASCII box-drawing by default.** Mermaid only on explicit `--mermaid` flag.

### Connectors

| Tool | File | What It Exports |
|------|------|----------------|
| Maltego | `connectors/maltego-export.md` | GraphML entity graph |
| Obsidian | `connectors/obsidian-setup.md` | Linked markdown notes |
| Notion | `connectors/notion-schema.md` | Structured database |
