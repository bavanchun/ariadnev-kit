#!/usr/bin/env python3
"""
CTI Report HTML Generator — the browser-native mirror of the hybrid DOCX.

Usage:
    python3 generate-cti-html.py <report.md> <report.json> <output.html>
    python3 generate-cti-html.py <report.md> <output.html>     # MD-only: narrative, no visuals
    python3 generate-cti-html.py <report.md>                   # MD-only, output beside the .md
    python3 generate-cti-html.py <report.json> [output.html]   # JSON-only: sections built from JSON

Phase 1: pandoc converts the Markdown narrative to an HTML fragment (the
         `markdown` package is the fallback when pandoc is absent).
Phase 2: visuals from the JSON are injected under the same keyword-matched
         headings the DOCX generator uses; leftovers land in a "Visual
         Analytics" appendix. The page is one self-contained file: inline
         CSS, inline SVG charts, and Mermaid graphs fetched from a CDN with a
         plain edge list shown when that fetch fails.
"""
import datetime
import html
import json
import os
import re
import shutil
import subprocess
import sys

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPTS_DIR)

from cti_report_headings import CHART_KEYWORDS, heading_matches  # noqa: E402
import cti_html_visuals as vis  # noqa: E402

MERMAID_CDN = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs"
HEADING_RE = re.compile(r"<h([1-6])(\s[^>]*)?>(.*?)</h\1>", re.DOTALL | re.IGNORECASE)
BANDS = [(25, "Minimal"), (50, "Moderate"), (75, "Elevated"), (100, "Critical")]


def _e(value) -> str:
    return html.escape(str(value), quote=True)


def _pct(value) -> str:
    try:
        return f"{int(float(value))}%"
    except (TypeError, ValueError):
        return _e(value)


# ---------------------------------------------------------------- phase 1

def md_to_html(md_path: str) -> str:
    if shutil.which("pandoc"):
        result = subprocess.run(
            ["pandoc", md_path, "--from", "markdown", "--to", "html5", "--wrap=none"],
            check=True, capture_output=True, text=True,
        )
        return result.stdout
    try:
        import markdown  # type: ignore
    except ImportError:
        raise SystemExit(
            "pandoc (or the python 'markdown' package) is required to render the "
            "narrative. Install pandoc first (macOS: brew install pandoc, "
            "Debian/Ubuntu: sudo apt install pandoc)."
        )
    with open(md_path, "r", encoding="utf-8") as f:
        return markdown.markdown(f.read(), extensions=["tables", "fenced_code", "toc"])


def _table(headers: list, rows: list) -> str:
    head = "".join(f"<th>{_e(h)}</th>" for h in headers)
    body = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in row) + "</tr>" for row in rows)
    return f"<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>"


def _list(items: list, ordered: bool = False) -> str:
    tag = "ol" if ordered else "ul"
    return f"<{tag}>" + "".join(f"<li>{_e(i)}</li>" for i in items) + f"</{tag}>"


def json_to_html(data: dict) -> str:
    """Narrative built from the JSON alone, in INTSUM section order, with the
    headings the chart keywords match."""
    labels = {s.get("id"): s.get("label", s.get("id")) for s in data.get("subjects", [])}
    parts = ["<h2>Executive Summary</h2>", f"<p>{_e(data.get('executive_summary', ''))}</p>"]
    if data.get("subjects"):
        parts.append("<h2>Subject Profile</h2>")
        parts.append(_table(
            ["Subject", "Type", "Confidence", "Verified", "Aliases", "First seen", "Notes"],
            [[_e(s.get("label", "?")), _e(s.get("type", "")), _pct(s.get("confidence", "")),
              "Yes" if s.get("verified") else "No", _e(", ".join(s.get("aliases", [])) or "None"),
              _e(s.get("first_seen", "N/A")), _e(s.get("notes", ""))]
             for s in data["subjects"]]))
    if data.get("findings"):
        parts.append("<h2>Key Findings</h2>")
        parts.append(_table(
            ["ID", "Subject", "Type", "Severity", "Confidence", "Description", "Source", "Collected"],
            [[_e(f.get("id", "")), _e(labels.get(f.get("subject_id"), f.get("subject_id", ""))),
              _e(f.get("type", "")),
              f'<span class="sev sev-{_e(str(f.get("weight", "INFO")).lower())}">{_e(f.get("weight", "INFO"))}</span>',
              _pct(f.get("confidence", "")), _e(f.get("description", "")),
              _e(f.get("source_url", "")), _e(f.get("collected_at", ""))]
             for f in data["findings"]]))
    if data.get("connections"):
        parts.append("<h2>Entity Relationship Map</h2>")
        parts.append(_table(
            ["From", "Relationship", "To", "Strength"],
            [[_e(labels.get(c.get("from_id"), c.get("from_id", ""))), _e(c.get("relationship", "")),
              _e(labels.get(c.get("to_id"), c.get("to_id", ""))), _e(c.get("strength", ""))]
             for c in data["connections"]]))
    if data.get("timeline"):
        parts.append("<h2>Timeline</h2>")
    vs = data.get("visitor_stats")
    if vs:
        parts.append("<h2>Visitor Intelligence</h2>")
        parts.append(f"<p>{_e(vs.get('domain', ''))} · {_e(vs.get('monthly_visits', 'N/A'))} monthly visits</p>")
    if data.get("sources"):
        parts.append("<h2>Source List</h2>")
        parts.append(_table(
            ["#", "Source", "URL", "Date accessed"],
            [[str(i), _e(s.get("name", "")), _e(s.get("url", "")), _e(s.get("date", ""))]
             for i, s in enumerate(data["sources"], 1)]))
    if data.get("intelligence_gaps"):
        parts.append("<h2>Intelligence Gaps</h2>" + _list(data["intelligence_gaps"]))
    if data.get("recommendations"):
        parts.append("<h2>Recommended Next Steps</h2>" + _list(data["recommendations"], ordered=True))
    caveats = data.get("caveats") or [
        "This report is based exclusively on publicly available information.",
        "No active exploitation or intrusion was performed; findings reflect external exposure only.",
    ]
    parts.append("<h2>Analyst Caveats &amp; Methodology Notes</h2>" + _list(caveats))
    return "\n".join(parts)


# ---------------------------------------------------------------- phase 2

def build_visuals(data: dict) -> dict:
    """One HTML block per CHART_KEYWORDS key, empty when the JSON lacks the data."""
    case = data.get("case", {})
    findings = data.get("findings", [])
    subjects, connections = data.get("subjects", []), data.get("connections", [])
    vs = data.get("visitor_stats", {}) or {}
    blocks = {
        "risk_gauge": vis.risk_gauge(case["exposure_score"]) if case.get("exposure_score") is not None else "",
        "finding_charts": (vis.finding_type_pie(findings) + vis.severity_bar(findings)) if findings else "",
        "timeline_chart": vis.timeline_list(data["timeline"]) if data.get("timeline") else "",
        "entity_diagram": (vis.entity_diagram(subjects, connections) + vis.network_topology(subjects, connections))
        if subjects and connections else "",
        "visitor_charts": (vis.traffic_sources_bar(vs["traffic_sources"]) if vs.get("traffic_sources") else "")
        + (vis.geographic_pie(vs["top_countries"]) if vs.get("top_countries") else ""),
    }
    return {k: v for k, v in blocks.items() if v}


def _slug(text: str, used: set) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "section"
    slug, n = base, 1
    while slug in used:
        n += 1
        slug = f"{base}-{n}"
    used.add(slug)
    return slug


def inject_visuals(body: str, visuals: dict) -> tuple:
    """Return (body with visuals under matching headings, toc entries, appendix html)."""
    pending = dict(visuals)
    toc, used = [], set()

    def replace(match):
        level, attrs, inner = int(match.group(1)), match.group(2) or "", match.group(3)
        text = html.unescape(re.sub(r"<[^>]+>", "", inner)).strip()
        id_match = re.search(r'\sid="([^"]*)"', attrs)
        if id_match:
            hid = id_match.group(1)
            used.add(hid)
        else:
            hid = _slug(text, used)
            attrs += f' id="{hid}"'
        if level <= 2:
            toc.append((level, hid, text))
        injected = "".join(
            pending.pop(key) for key in list(pending)
            if heading_matches(text, CHART_KEYWORDS[key])
        )
        return f"<h{level}{attrs}>{inner}</h{level}>{injected}"

    body = HEADING_RE.sub(replace, body)
    appendix = ""
    if pending:
        titles = {
            "risk_gauge": "Risk Assessment", "finding_charts": "Finding Statistics",
            "timeline_chart": "Event Timeline", "entity_diagram": "Entity Relationships",
            "visitor_charts": "Visitor Intelligence",
        }
        appendix = '<section class="appendix"><h2 id="visual-analytics">Visual Analytics</h2>'
        for key in CHART_KEYWORDS:
            if key in pending:
                appendix += f"<h3>{titles[key]}</h3>{pending[key]}"
        appendix += "</section>"
        toc.append((2, "visual-analytics", "Visual Analytics"))
    return body, toc, appendix


# ---------------------------------------------------------------- page

CSS = """
:root{--navy:#1A237E;--accent:#0096C7;--text:#1E293B;--muted:#6B7280;--bg:#F1F5F9;--border:#CBD5E1}
*{box-sizing:border-box}body{margin:0;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--text);background:#fff}
.banner{background:var(--navy);color:#fff;font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;text-align:center;padding:.4rem 1rem}
.cover{max-width:960px;margin:0 auto;padding:3rem 1.5rem 2rem;border-bottom:4px solid var(--accent)}
.cover .kicker{color:var(--accent);font-weight:700;letter-spacing:.2em;margin:0}
.cover h1{font-size:2.2rem;line-height:1.2;margin:.3rem 0 1.2rem;color:var(--navy)}
.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.6rem 1.5rem;margin:0}
.meta dt{font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.meta dd{margin:0;font-weight:600}
.badge{display:inline-block;padding:.15rem .6rem;border-radius:999px;color:#fff;font-size:.85rem}
main,.toc{max-width:960px;margin:0 auto;padding:1rem 1.5rem}
.toc{background:var(--bg);border-radius:8px;margin-top:1.5rem}.toc h2{margin:.2rem 0 .5rem;font-size:1rem}.toc ol{margin:0;padding-left:1.3rem}.toc li.l1{font-weight:600}
h1,h2,h3{color:var(--navy)}h2{margin-top:2.5rem;padding-bottom:.3rem;border-bottom:2px solid var(--border)}
table{border-collapse:collapse;width:100%;margin:1rem 0;font-size:.92rem}th{background:var(--navy);color:#fff;text-align:left}
th,td{padding:.45rem .6rem;border:1px solid var(--border);vertical-align:top}tr:nth-child(even) td{background:var(--bg)}
pre{background:var(--bg);padding:.8rem;overflow-x:auto;border-radius:6px}code{font-size:.9em}
.table-wrap,figure{overflow-x:auto}
.cti-visual{margin:1.5rem auto;padding:1rem;border:1px solid var(--border);border-radius:8px;background:#fff;max-width:640px}
.cti-visual figcaption{font-weight:700;color:var(--navy);margin-bottom:.6rem;text-align:center}
.cti-visual svg{display:block;max-width:100%;height:auto;margin:0 auto}
.cti-pie svg{max-width:220px;float:left;margin-right:1rem}.cti-pie .legend{list-style:none;margin:0;padding:.4rem 0;font-size:.9rem}
.cti-pie .legend li{display:flex;align-items:center;gap:.5rem}.cti-pie .legend i{width:.9rem;height:.9rem;border-radius:2px;flex:none}
.cti-pie .legend span{color:var(--muted);margin-left:auto}.cti-pie::after{content:"";display:block;clear:both}
svg text{font-family:inherit;fill:var(--text)}svg .pct{fill:#fff;font-weight:700;font-size:12px;text-anchor:middle}
svg .lbl{text-anchor:end;font-size:13px}svg .val{font-weight:700;font-size:13px}svg .axis{fill:var(--muted);font-size:11px;text-anchor:middle}
svg .score{font-size:32px;font-weight:700;text-anchor:middle}
.timeline{list-style:none;margin:0;padding:0 0 0 1.2rem;border-left:2px solid var(--border)}
.timeline li{position:relative;padding:0 0 .8rem 1rem}.timeline li::before{content:"";position:absolute;left:-1.55rem;top:.45rem;width:.7rem;height:.7rem;border-radius:50%;background:var(--accent);border:2px solid #fff}
.timeline time{display:block;font-size:.8rem;color:var(--muted)}
.sev{padding:.1rem .45rem;border-radius:4px;color:#fff;font-size:.8rem;font-weight:700}
.sev-critical{background:#DC2626}.sev-high{background:#EA580C}.sev-medium{background:#CA8A04}.sev-low{background:#16A34A}.sev-info{background:#64748B}
.mermaid-fallback{display:none;font-family:ui-monospace,monospace;font-size:.85rem}
.no-mermaid .mermaid{display:none}.no-mermaid .mermaid-fallback{display:block}
footer.banner{margin-top:3rem}
@media print{.toc{display:none}h2{break-before:page}.cti-visual{break-inside:avoid}}
"""

MERMAID_LOADER = f"""<noscript><style>.mermaid{{display:none}}.mermaid-fallback{{display:block}}</style></noscript>
<script type="module">
try {{
  const mermaid = (await import("{MERMAID_CDN}")).default;
  mermaid.initialize({{ startOnLoad: false, theme: "neutral", securityLevel: "strict" }});
  await mermaid.run();
}} catch (err) {{
  document.documentElement.classList.add("no-mermaid");
}}
</script>"""


def exposure_badge(score) -> str:
    if score is None:
        return ""
    clamped = max(0, min(100, int(score)))
    label = next(name for limit, name in BANDS if clamped <= limit)
    color = next(c for s, e, c in vis.GAUGE_BANDS if clamped <= e)
    return f'<span class="badge" style="background:{color}">{clamped} / 100 · {label}</span>'


def render_page(data: dict, body: str, toc: list, appendix: str) -> str:
    case = data.get("case", {})
    first_h1 = HEADING_RE.search(body)
    md_title = html.unescape(re.sub(r"<[^>]+>", "", first_h1.group(3))).strip() if first_h1 and first_h1.group(1) == "1" else ""
    title = case.get("label") or md_title or "CTI Report"
    meta = [("Case ID", case.get("id", "")), ("Classification", case.get("classification", "")),
            ("Analyst", case.get("analyst", "")), ("Date", case.get("date", "")),
            ("Subject", case.get("subject", "")), ("Status", case.get("status", ""))]
    meta_html = "".join(f"<div><dt>{_e(k)}</dt><dd>{_e(v)}</dd></div>" for k, v in meta if v)
    badge = exposure_badge(case.get("exposure_score"))
    if badge:
        meta_html += f"<div><dt>Exposure score</dt><dd>{badge}</dd></div>"
    toc_html = "".join(f'<li class="l{lvl}"><a href="#{_e(hid)}">{_e(text)}</a></li>' for lvl, hid, text in toc)
    banner = f"{_e(case.get('classification', 'OPEN SOURCE'))} · {_e(case.get('id', ''))}"
    loader = MERMAID_LOADER if 'class="mermaid"' in body + appendix else ""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CTI Report — {_e(title)}</title>
<style>{CSS}</style>
</head>
<body>
<div class="banner">{banner}</div>
<header class="cover">
<p class="kicker">CTI REPORT</p>
<h1>{_e(title)}</h1>
<dl class="meta">{meta_html}</dl>
</header>
<nav class="toc"><h2>Contents</h2><ol>{toc_html}</ol></nav>
<main>
{body}
{appendix}
</main>
<footer class="banner">{banner} · generated {datetime.date.today().isoformat()}</footer>
{loader}
</body>
</html>
"""


# ---------------------------------------------------------------- cli

def load_json(json_path: str) -> dict:
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    data.setdefault("case", {})
    return data


def parse_args():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)
    md_path = json_path = output_path = None
    for arg in args:
        if arg.endswith(".json"):
            json_path = arg
        elif arg.endswith(".html"):
            output_path = arg
        else:
            md_path = arg
    if md_path is None and json_path is None:
        raise SystemExit("Give a Markdown report, a JSON report, or both.")
    return md_path, json_path, output_path


def main():
    md_path, json_path, output_path = parse_args()
    for path in (md_path, json_path):
        if path and not os.path.exists(path):
            raise SystemExit(f"Error: file not found: {path}")

    data = load_json(json_path) if json_path else {"case": {}}
    if md_path:
        print(f"[Phase 1] narrative: {os.path.basename(md_path)}")
        body = md_to_html(md_path)
        mode = "MD + JSON (hybrid)" if json_path else "MD-only (narrative, no visuals)"
    else:
        print(f"[Phase 1] narrative built from {os.path.basename(json_path)}")
        body = json_to_html(data)
        mode = "JSON-only"

    visuals = build_visuals(data) if json_path else {}
    print(f"[Phase 2] injecting {len(visuals)} visual block(s) at matching headings")
    body, toc, appendix = inject_visuals(body, visuals)

    if not output_path:
        output_path = os.path.splitext(md_path or json_path)[0] + ".html"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(render_page(data, body, toc, appendix))

    print(f"Saved: {output_path}")
    print(f"  Mode: {mode}")
    if appendix:
        print("  Appendix: visuals whose heading keyword was absent moved to Visual Analytics")


if __name__ == "__main__":
    main()
