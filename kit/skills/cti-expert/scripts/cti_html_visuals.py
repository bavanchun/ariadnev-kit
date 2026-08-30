"""
CTI Report visuals for the HTML mirror — inline SVG charts, a CSS timeline,
and Mermaid graphs, each returned as an HTML fragment.

Every builder here mirrors one DOCX builder in cti_docx_charts.py or
cti_docx_diagrams.py: same input shape, same numbers, same palette. Charts are
SVG written by Python so the page needs no script to show them; only the two
graphs use Mermaid (loaded by the page from a CDN) and each carries a plain
edge list that the page reveals when Mermaid cannot load.
"""
import html
import math
import re

# Hex values match COLORS_HEX / SEVERITY_COLORS_HEX in cti_docx_styles.py and
# ENTITY_COLORS in cti_docx_diagrams.py; those modules import python-docx and
# matplotlib at load time, which the HTML path deliberately avoids.
PRIMARY, ACCENT, TEXT, MUTED, BORDER = "#1A237E", "#0096C7", "#1E293B", "#6B7280", "#CBD5E1"
SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]
SEVERITY_COLORS = {
    "CRITICAL": "#DC2626", "HIGH": "#EA580C", "MEDIUM": "#CA8A04",
    "LOW": "#16A34A", "INFO": "#64748B",
}
TYPE_PIE_COLORS = ["#1A237E", "#0096C7", "#DC2626", "#EA580C",
                   "#CA8A04", "#16A34A", "#64748B", "#8B5CF6"]
GEO_PIE_COLORS = ["#1A237E", "#0096C7", "#16A34A", "#EA580C", "#8B5CF6",
                  "#CA8A04", "#EC4899", "#64748B", "#0369A1", "#92400E"]
TRAFFIC_COLORS = {
    "direct": "#1A237E", "search": "#0096C7", "referral": "#16A34A",
    "social": "#8B5CF6", "paid": "#EA580C", "email": "#EC4899", "display": "#CA8A04",
}
GAUGE_BANDS = [(0, 25, "#16A34A"), (25, 50, "#CA8A04"), (50, 75, "#EA580C"), (75, 100, "#DC2626")]
ENTITY_COLORS = {
    "person": "#1A237E", "username": "#0096C7", "email": "#8B5CF6",
    "domain": "#EA580C", "ip": "#64748B", "organization": "#16A34A",
    "phone": "#EC4899", "location": "#92400E", "asset": "#475569", "event": "#0369A1",
}
ENTITY_ICONS = {
    "person": "[P]", "username": "[@]", "email": "[E]", "domain": "[D]", "ip": "[IP]",
    "organization": "[O]", "phone": "[Ph]", "location": "[L]", "asset": "[A]", "event": "[Ev]",
}
# Relationship → Mermaid arrow, echoing the solid/dashed/dotted weights the
# DOCX diagram gives the same relationships.
EDGE_ARROWS = {
    "owns": "==>", "uses": "-->", "communicated_with": "-->",
    "works_at": "-.->", "alias": "-.->", "linked_to": "-.->",
}


def _e(value) -> str:
    return html.escape(str(value), quote=True)


def _figure(title: str, body: str, kind: str) -> str:
    return (f'<figure class="cti-visual cti-{kind}">'
            f'<figcaption>{_e(title)}</figcaption>{body}</figure>')


def _sector(cx, cy, r, start_deg, end_deg) -> str:
    """Pie sector path, angles clockwise from 12 o'clock."""
    if end_deg - start_deg >= 359.999:
        return f'<circle cx="{cx}" cy="{cy}" r="{r}"/>'
    a0, a1 = math.radians(start_deg), math.radians(end_deg)
    x0, y0 = cx + r * math.sin(a0), cy - r * math.cos(a0)
    x1, y1 = cx + r * math.sin(a1), cy - r * math.cos(a1)
    large = 1 if end_deg - start_deg > 180 else 0
    return (f'<path d="M{cx},{cy} L{x0:.2f},{y0:.2f} '
            f'A{r},{r} 0 {large} 1 {x1:.2f},{y1:.2f} Z"/>')


def _pie(title: str, labels: list, values: list, colors: list) -> str:
    total = float(sum(values)) or 1.0
    cx = cy = 110
    r = 100
    slices, legend, angle = [], [], 0.0
    for label, value, color in zip(labels, values, colors):
        span = 360.0 * value / total
        pct = 100.0 * value / total
        path = _sector(cx, cy, r, angle, angle + span)
        slices.append(f'<g fill="{color}" stroke="#fff" stroke-width="1.5">{path}</g>')
        if pct >= 6:
            mid = math.radians(angle + span / 2)
            tx, ty = cx + 0.7 * r * math.sin(mid), cy - 0.7 * r * math.cos(mid)
            slices.append(f'<text x="{tx:.1f}" y="{ty:.1f}" class="pct">{pct:.0f}%</text>')
        legend.append(f'<li><i style="background:{color}"></i>{_e(label)} '
                      f'<span>{value:g} · {pct:.0f}%</span></li>')
        angle += span
    svg = (f'<svg viewBox="0 0 220 220" role="img" aria-label="{_e(title)}">'
           f'{"".join(slices)}</svg><ul class="legend">{"".join(legend)}</ul>')
    return _figure(title, svg, "pie")


def _hbar(title: str, labels: list, values: list, colors: list, suffix: str = "", x_label: str = "Count") -> str:
    row_h, label_w, width = 30, 130, 560
    bar_w = width - label_w - 60
    vmax = max(values) if values else 1
    rows = []
    for i, (label, value, color) in enumerate(zip(labels, values, colors)):
        y = 10 + i * row_h
        w = bar_w * value / vmax if vmax else 0
        rows.append(
            f'<text x="{label_w - 8}" y="{y + 19}" class="lbl">{_e(label)}</text>'
            f'<rect x="{label_w}" y="{y + 5}" width="{w:.1f}" height="20" rx="3" fill="{color}"/>'
            f'<text x="{label_w + w + 6:.1f}" y="{y + 19}" class="val">{value:g}{suffix}</text>'
        )
    height = 10 + len(labels) * row_h + 24
    rows.append(f'<text x="{label_w + bar_w / 2:.0f}" y="{height - 4}" class="axis">{_e(x_label)}</text>')
    svg = (f'<svg viewBox="0 0 {width} {height}" role="img" aria-label="{_e(title)}">'
           f'{"".join(rows)}</svg>')
    return _figure(title, svg, "bar")


def _gauge_arc(cx, cy, r_out, r_in, v0, v1) -> str:
    """Annular arc across a semicircle, values 0-100 left to right."""
    def pt(v, r):
        a = math.pi - (v / 100.0) * math.pi
        return cx + r * math.cos(a), cy - r * math.sin(a)
    ox0, oy0 = pt(v0, r_out)
    ox1, oy1 = pt(v1, r_out)
    ix0, iy0 = pt(v0, r_in)
    ix1, iy1 = pt(v1, r_in)
    large = 1 if v1 - v0 > 50 else 0
    return (f'M{ox0:.2f},{oy0:.2f} A{r_out},{r_out} 0 {large} 1 {ox1:.2f},{oy1:.2f} '
            f'L{ix1:.2f},{iy1:.2f} A{r_in},{r_in} 0 {large} 0 {ix0:.2f},{iy0:.2f} Z')


def risk_gauge(score, label: str = "Overall Exposure Score") -> str:
    clamped = max(0, min(100, int(score)))
    cx, cy, r_out, r_in = 140, 130, 110, 66
    parts = [f'<path d="{_gauge_arc(cx, cy, r_out, r_in, s, e)}" fill="{c}" opacity="0.3"/>'
             for s, e, c in GAUGE_BANDS]
    for s, e, c in GAUGE_BANDS:
        hi = min(e, clamped)
        if hi > s:
            parts.append(f'<path d="{_gauge_arc(cx, cy, r_out, r_in, s, hi)}" fill="{c}" opacity="0.9"/>')
    a = math.pi - (clamped / 100.0) * math.pi
    nx, ny = cx + 0.85 * r_out * math.cos(a), cy - 0.85 * r_out * math.sin(a)
    parts.append(f'<line x1="{cx}" y1="{cy}" x2="{nx:.1f}" y2="{ny:.1f}" stroke="{TEXT}" stroke-width="3" stroke-linecap="round"/>')
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="5" fill="{TEXT}"/>')
    for v in (0, 25, 50, 75, 100):
        ang = math.pi - (v / 100.0) * math.pi
        tx, ty = cx + (r_out + 16) * math.cos(ang), cy - (r_out + 16) * math.sin(ang)
        parts.append(f'<text x="{tx:.1f}" y="{ty + 4:.1f}" class="axis">{v}</text>')
    parts.append(f'<text x="{cx}" y="{cy + 34}" class="score">{clamped}</text>')
    parts.append(f'<text x="{cx}" y="{cy + 52}" class="axis">{_e(label)}</text>')
    svg = (f'<svg viewBox="0 0 280 190" role="img" aria-label="{_e(label)}: {clamped} of 100">'
           f'{"".join(parts)}</svg>')
    return _figure("Risk Assessment", svg, "gauge")


def finding_type_pie(findings: list) -> str:
    counts: dict = {}
    for f in findings:
        t = f.get("type", "unknown")
        counts[t] = counts.get(t, 0) + 1
    labels = list(counts)
    return _pie("Finding Distribution by Type", labels, list(counts.values()),
                TYPE_PIE_COLORS[:len(labels)] or TYPE_PIE_COLORS)


def severity_bar(findings: list) -> str:
    counts = {s: 0 for s in SEVERITY_ORDER}
    for f in findings:
        w = str(f.get("weight", "INFO")).upper()
        if w in counts:
            counts[w] += 1
    labels = [s for s in SEVERITY_ORDER if counts[s] > 0]
    return _hbar("Findings by Severity", labels, [counts[s] for s in labels],
                 [SEVERITY_COLORS[s] for s in labels])


def timeline_list(events: list) -> str:
    items = "".join(
        f'<li><time>{_e(e.get("date", "N/A"))}</time><span>{_e(e.get("event", ""))}</span></li>'
        for e in sorted(events, key=lambda e: e.get("date", ""))
    )
    return _figure("Event Timeline", f'<ol class="timeline">{items}</ol>', "timeline")


def traffic_sources_bar(traffic_sources: dict) -> str:
    keys = list(traffic_sources)
    return _hbar("Traffic Sources", [k.title() for k in keys],
                 [float(traffic_sources[k]) for k in keys],
                 [TRAFFIC_COLORS.get(k, "#64748B") for k in keys], "%", "Percentage (%)")


def geographic_pie(top_countries: list) -> str:
    labels = [c.get("country", "?") for c in top_countries]
    sizes = [float(c.get("share", 0)) for c in top_countries]
    if sum(sizes) < 100:
        labels.append("Other")
        sizes.append(100 - sum(sizes))
    return _pie("Visitor Geography", labels, sizes, GEO_PIE_COLORS[:len(labels)])


def _node_id(raw) -> str:
    return "N_" + re.sub(r"[^A-Za-z0-9_]", "_", str(raw))


def _mermaid_label(text: str) -> str:
    return '"' + str(text).replace('"', "#quot;") + '"'


def _graph(title: str, header: str, nodes: list, edges: list, class_defs: list, fallback: list, kind: str) -> str:
    source = "\n".join([header, *nodes, *edges, *class_defs])
    fallback_html = "".join(f"<li>{_e(line)}</li>" for line in fallback)
    body = (f'<pre class="mermaid">{_e(source)}</pre>'
            f'<ul class="mermaid-fallback">{fallback_html}</ul>')
    return _figure(title, body, kind)


def entity_diagram(subjects: list, connections: list) -> str:
    nodes, ids, types = [], set(), set()
    for s in subjects:
        sid = s.get("id", s.get("label", "?"))
        stype = str(s.get("type", "person")).lower()
        text = ENTITY_ICONS.get(stype, "?") + " " + str(s.get("label", sid))
        nodes.append(f"  {_node_id(sid)}[{_mermaid_label(text)}]:::{stype}")
        ids.add(sid)
        types.add(stype)
    labels = {s.get("id", s.get("label", "?")): s.get("label", s.get("id", "?")) for s in subjects}
    edges, fallback = [], []
    for c in connections:
        a, b, rel = c.get("from_id", ""), c.get("to_id", ""), c.get("relationship", "linked_to")
        if a in ids and b in ids:
            arrow = EDGE_ARROWS.get(rel, "-->")
            edges.append(f"  {_node_id(a)} {arrow}|{_mermaid_label(rel)}| {_node_id(b)}")
            fallback.append(f"{labels[a]} —{rel}→ {labels[b]}")
    class_defs = [f"  classDef {t} fill:{ENTITY_COLORS.get(t, '#64748B')},color:#fff,stroke:#fff"
                  for t in sorted(types)]
    return _graph("Entity Relationship Map", "flowchart TD", nodes, edges, class_defs, fallback, "entity")


def network_topology(subjects: list, connections: list) -> str:
    """Infrastructure-only view (domain, ip, organization), mirroring the DOCX diagram."""
    infra = [s for s in subjects if str(s.get("type", "")).lower() in {"domain", "ip", "organization"}]
    if not infra:
        infra = subjects
    if len(infra) < 2:
        return ""
    ids = {s.get("id", s.get("label", "")) for s in infra}
    labels = {s.get("id", s.get("label", "?")): s.get("label", s.get("id", "?")) for s in infra}
    nodes, types = [], set()
    for s in infra:
        sid = s.get("id", s.get("label", "?"))
        stype = str(s.get("type", "domain")).lower()
        nodes.append(f'  {_node_id(sid)}({_mermaid_label(s.get("label", sid))}):::{stype}')
        types.add(stype)
    edges, fallback = [], []
    for c in connections:
        a, b, rel = c.get("from_id", ""), c.get("to_id", ""), c.get("relationship", "")
        if a in ids and b in ids:
            edges.append(f"  {_node_id(a)} ---|{_mermaid_label(rel)}| {_node_id(b)}")
            fallback.append(f"{labels[a]} —{rel}— {labels[b]}")
    class_defs = [f"  classDef {t} fill:{ENTITY_COLORS.get(t, '#64748B')},color:#fff,stroke:#fff"
                  for t in sorted(types)]
    return _graph("Network Topology", "flowchart LR", nodes, edges, class_defs, fallback, "network")
