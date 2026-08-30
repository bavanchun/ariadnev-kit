"""
Heading keywords that place charts in the CTI report.

Both renderers (DOCX via cti_docx_postprocess, HTML via generate-cti-html)
inject each visual under the first heading whose text contains one of these
keywords, so the two outputs share one section structure. Kept free of
third-party imports so the HTML path never needs python-docx or matplotlib.
"""
import unicodedata

CHART_KEYWORDS = {
    "risk_gauge": ["executive summary", "tom tat", "dieu hanh"],
    "finding_charts": ["phat hien", "findings", "statistical"],
    "timeline_chart": ["timeline", "thoi gian", "dong thoi gian"],
    "entity_diagram": ["moi quan he", "relationship", "entity", "ban do"],
    "visitor_charts": ["visitor", "traffic", "luong truy cap", "hien dien"],
}


def strip_accents(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def heading_matches(text: str, keywords: list[str]) -> bool:
    normalized = strip_accents(text.lower().strip())
    return any(kw in normalized for kw in keywords)
