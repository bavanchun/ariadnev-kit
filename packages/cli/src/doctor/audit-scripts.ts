// `ariadnev audit scripts` — surface what a shipped script would actually do
// if a user ran it. Ported skills carry install scripts that escalate
// privileges, fetch and execute remote code, and write into system
// directories; those are legitimate for a tool the user chose to install, but
// they must not arrive unannounced inside a kit.
//
// Pure: the caller reads the files and passes contents in.

export type RiskId =
  | "privilege-escalation"
  | "remote-code-execution"
  | "remote-package-install"
  | "writes-outside-skill";

export type RiskSeverity = "high" | "medium";

export interface ScriptRisk {
  id: RiskId;
  severity: RiskSeverity;
  /** 1-indexed line in the scanned file. */
  line: number;
  /** The matched line, trimmed — enough to judge without opening the file. */
  excerpt: string;
}

export interface ScriptReport {
  /** Path as the caller identifies it (kit-relative). */
  path: string;
  risks: ScriptRisk[];
}

interface Rule {
  id: RiskId;
  severity: RiskSeverity;
  rx: RegExp;
  /**
   * `command` matches only outside quoted strings — for constructs that are
   * always the command being run, so a message *about* the command
   * (`log_fail "try: sudo apt install $pkg"`) is not mistaken for the act.
   * `any` also matches inside quotes, which argument values need: the risky
   * part of `pip install "git+https://…"` is the quoted URL itself.
   */
  scope: "command" | "any";
}

const RULES: Rule[] = [
  { id: "privilege-escalation", severity: "high", scope: "command", rx: /(?:^|[;&|(]|\b(?:if|elif|then|else|do|while|until)\s)\s*(?:sudo|doas)\s+\S/ },
  // curl/wget piped into an interpreter or an extractor, and the
  // process-substitution spelling of the same thing.
  { id: "remote-code-execution", severity: "high", scope: "command", rx: /\b(curl|wget)\b[^|\n]*\|\s*(sudo\s+)?(ba|z|k|d)?sh\b/ },
  { id: "remote-code-execution", severity: "high", scope: "command", rx: /\b(curl|wget)\b[^|\n]*\|\s*(sudo\s+)?(tar|unzip|python[23]?|perl|ruby|node)\b/ },
  { id: "remote-code-execution", severity: "high", scope: "command", rx: /\b(ba|z|k)?sh\s+<\(\s*(curl|wget)\b/ },
  { id: "remote-package-install", severity: "medium", scope: "command", rx: /\bgo\s+install\s+\S/ },
  { id: "remote-package-install", severity: "medium", scope: "any", rx: /\bpip[23]?\s+install\b[^\n]*\b(git\+|https?:\/\/)/ },
  // `command`, not `any`: a script that *prints* "npm install -g …" as advice is
  // telling the user what to do, not doing it. The quoted form showed up in the
  // first ported wave and would have been a standing false positive.
  { id: "remote-package-install", severity: "medium", scope: "command", rx: /\b(npm|pnpm|yarn)\s+(install|add|i)\b[^\n]*\s-g\b/ },
  { id: "remote-package-install", severity: "medium", scope: "command", rx: /\b(cargo|gem)\s+install\s+\S/ },
  // Anything landing in a system prefix or a shell startup file is reaching
  // well outside the skill's own directory.
  { id: "writes-outside-skill", severity: "medium", scope: "any", rx: /\b(mv|cp|install|tee|ln)\b[^\n]*\s\/(usr|etc|opt|bin|sbin)\// },
  // A system prefix set as a value — `install_dir="${2:-/usr/local/bin}"`.
  // The write itself lands on a variable, so the destination is only
  // knowable where it is assigned.
  { id: "writes-outside-skill", severity: "medium", scope: "any", rx: /[=:]-?\/(usr|etc|opt)\// },
  { id: "writes-outside-skill", severity: "medium", scope: "any", rx: />>?\s*(~|\$HOME)\/\.(bash|zsh|profile|config)\S*/ },

  // Interpreted scripts reach the same capabilities through their own runtime,
  // and the kit ships far more Python than shell — scanning only shell would
  // have left 22 of the first wave's 24 scripts unread while reporting a pass.
  { id: "privilege-escalation", severity: "high", scope: "any", rx: /(?:subprocess\.(?:run|call|check_call|check_output|Popen)|os\.system|os\.exec\w*)\s*\(\s*(?:\[\s*)?['"]sudo['"]/ },
  { id: "privilege-escalation", severity: "high", scope: "any", rx: /\b(?:exec|execSync|spawn|spawnSync)\s*\(\s*['"`]sudo\b/ },
  // A shell string assembled at runtime is where an argument becomes a command.
  { id: "remote-code-execution", severity: "medium", scope: "any", rx: /\bshell\s*=\s*True\b/ },
  { id: "remote-code-execution", severity: "high", scope: "any", rx: /\b(?:exec|eval)\s*\(\s*(?:requests\.get|urlopen|urllib|fetch)\b/ },
  { id: "remote-code-execution", severity: "high", scope: "any", rx: /\b(?:exec|execSync|spawnSync?)\s*\([^\n]*\b(?:curl|wget)\b[^\n]*\|\s*(?:ba|z)?sh\b/ },
];

/**
 * Split a line into the code before any `#` comment, plus the same code with
 * quoted spans blanked out. One quote-aware pass serves both: a `#` inside a
 * string does not start a comment, and quoted text is not command position.
 */
/**
 * Comment marker by language. A `.cjs` hook's `// …` line is a comment, and
 * treating it as code reported a sentence *describing* sudo as an act of
 * privilege escalation — the sort of false positive that teaches people to
 * skim past the whole report.
 */
function commentMarkers(path: string): string[] {
  return /\.(js|mjs|cjs|ts)$/.test(path) ? ["//"] : ["#"];
}

function parseLine(line: string, markers: string[] = ["#"]): { code: string; unquoted: string } {
  let quote: string | null = null;
  let unquoted = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === "\\") {
        unquoted += "  ";
        i++;
        continue;
      }
      if (c === quote) quote = null;
      // Keep the length so reported columns and regex boundaries stay sane.
      unquoted += " ";
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      unquoted += " ";
      continue;
    }
    const marker = markers.find((m) => line.startsWith(m, i));
    if (marker && (i === 0 || /[\s;]/.test(line[i - 1]))) {
      return { code: line.slice(0, i), unquoted };
    }
    unquoted += c;
  }
  return { code: line, unquoted };
}

/** Risky constructs in one script. Order follows the file, top to bottom. */
export function scanScript(path: string, content: string): ScriptReport {
  const risks: ScriptRisk[] = [];
  const lines = content.split("\n");

  lines.forEach((raw, index) => {
    const { code, unquoted } = parseLine(raw, commentMarkers(path));
    if (code.trim() === "") return;
    const seen = new Set<RiskId>();
    for (const rule of RULES) {
      // One finding per risk kind per line: three ways of spelling the same
      // download-and-run on one line is still one thing to review.
      if (seen.has(rule.id) || !rule.rx.test(rule.scope === "command" ? unquoted : code)) continue;
      seen.add(rule.id);
      risks.push({ id: rule.id, severity: rule.severity, line: index + 1, excerpt: raw.trim() });
    }
  });

  return { path, risks };
}

export interface ScriptsAuditResult {
  reports: ScriptReport[];
  counts: Record<RiskSeverity, number>;
  /** Scripts carrying at least one risk. */
  flagged: number;
}

export function auditScripts(scripts: { path: string; content: string }[]): ScriptsAuditResult {
  const reports = scripts.map((s) => scanScript(s.path, s.content));
  const counts: Record<RiskSeverity, number> = { high: 0, medium: 0 };
  for (const r of reports) for (const risk of r.risks) counts[risk.severity]++;
  return { reports, counts, flagged: reports.filter((r) => r.risks.length > 0).length };
}
