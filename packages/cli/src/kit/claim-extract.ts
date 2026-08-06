const NORMATIVE = /\b(?:must|should|always|never|do not)\b/i;
const NUMBERED_STEP = /^\s*\d+[.)]\s+\S/;
const RULE_BULLET = /^\s*[-*+]\s+(?:\*\*(?:core rule|rule|guard|constraint|requirement|quality gate|check)[^*]*\*\*|(?:rule|guard|constraint|requirement)\s*:)/i;

function normalizeClaim(line: string): string {
  return line
    .replace(/^\s*(?:\d+[.)]|[-*+])\s+/, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function contentLines(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return lines;
  const closing = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  return closing === -1 ? [] : lines.slice(closing + 1);
}

/** Extract deterministic rule-shaped lines while ignoring fenced examples. */
export function extractClaims(markdown: string): string[] {
  const claims: string[] = [];
  const seen = new Set<string>();
  let numberedGroup: string[] = [];
  let fenced = false;

  const add = (claim: string) => {
    if (!claim || seen.has(claim)) return;
    seen.add(claim);
    claims.push(claim);
  };
  const flushNumbered = () => {
    if (numberedGroup.length > 0) add(numberedGroup.join(" → "));
    numberedGroup = [];
  };

  for (const line of contentLines(markdown)) {
    if (/^\s*```/.test(line)) {
      flushNumbered();
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    if (/^\s*#{1,6}\s+/.test(line)) {
      flushNumbered();
      continue;
    }
    if (NUMBERED_STEP.test(line)) {
      numberedGroup.push(normalizeClaim(line));
      continue;
    }
    flushNumbered();
    if (!NORMATIVE.test(line) && !RULE_BULLET.test(line)) {
      continue;
    }
    add(normalizeClaim(line));
  }
  flushNumbered();
  return claims;
}
