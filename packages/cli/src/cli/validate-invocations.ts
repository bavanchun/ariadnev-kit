// Feeding kit files to the av-invocation lint. The lint itself is pure; this is
// the fs half, kept out of `validate-command.ts` so that file stays about
// assembling findings.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { lintAvInvocations, type CommandSurface } from "../kit/av-invocation-lint.js";
import { lintScriptAvInvocations } from "../kit/av-invocation-scripts.js";

/** Scripts a skill can ship and a runtime can execute. Anything else in
 *  `scripts/` is data. */
const SCRIPT_FILE = /\.(?:cjs|mjs|js|sh|bash|zsh|py)$/;

export interface InvocationSource {
  /** How the finding names the file, e.g. `cook/references/plan-state.md`. */
  name: string;
  content: string;
  /** Scripts get the call-site rules; prose gets the code-context rules. */
  script?: boolean;
}

export interface InvocationHit {
  source: string;
  line: number;
  severity: "error" | "warning";
  message: string;
}

export function scanInvocations(sources: InvocationSource[], surface: CommandSurface): InvocationHit[] {
  const hits: InvocationHit[] = [];
  for (const source of sources) {
    const findings = source.script
      ? lintScriptAvInvocations(source.content, surface, source.name)
      : lintAvInvocations(source.content, surface);
    for (const finding of findings) {
      hits.push({ source: source.name, line: finding.line, severity: finding.severity, message: finding.message });
    }
  }
  return hits;
}

/** Every script under a skill's `scripts/`, recursively — real skills nest
 *  `scripts/lib`, and the installer copies the whole tree. */
export function readSkillScripts(skillDir: string): InvocationSource[] {
  const root = join(skillDir, "scripts");
  const out: InvocationSource[] = [];
  const walk = (dir: string, prefix: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const name = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(path, name);
      else if (SCRIPT_FILE.test(entry.name)) out.push({ name, content: readFileSync(path, "utf8"), script: true });
    }
  };
  walk(root, "scripts");
  return out;
}
