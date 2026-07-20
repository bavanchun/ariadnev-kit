import { readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadKit } from "../kit/load-kit.js";
import { getKitRoot } from "../kit/embedded-kit.js";
import { checkReferenceIntegrity } from "../kit/reference-integrity.js";

// `vcskill validate` — lint the kit source without installing it. Wraps the
// same loadKit lint the installer runs, then adds reference-integrity
// (dangling + orphan) which loadKit does not check. Read-only; CI-able.

export interface ValidateFinding {
  skill: string;
  kind: "lint" | "dangling" | "orphan";
  message: string;
}

export interface ValidateResult {
  ok: boolean;
  findings: ValidateFinding[];
  counts: { skills: number; agents: number; hooks: number };
  summary: string;
}

export interface ValidateOpts {
  /** Override kit source root (tests / packaging). Default: resolve from module. */
  kitRoot?: string;
}

function renderSummary(findings: ValidateFinding[], counts: ValidateResult["counts"]): string {
  const header = `vcskill validate — ${counts.skills} skills, ${counts.agents} agents, ${counts.hooks} hooks`;
  if (findings.length === 0) return `${header}\n  all checks passed`;
  const lines = [header];
  for (const f of findings) lines.push(`  [${f.kind}] ${f.skill}: ${f.message}`);
  lines.push(`  ${findings.length} finding(s)`);
  return lines.join("\n");
}

/** Validate the kit source. Returns a structured result + rendered summary. */
export function runValidate(opts: ValidateOpts = {}): ValidateResult {
  const root = opts.kitRoot ?? getKitRoot(dirname(fileURLToPath(import.meta.url)));

  let kit;
  try {
    kit = loadKit(root);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const findings: ValidateFinding[] = [{ skill: "(kit)", kind: "lint", message }];
    const counts = { skills: 0, agents: 0, hooks: 0 };
    return { ok: false, findings, counts, summary: renderSummary(findings, counts) };
  }

  const findings: ValidateFinding[] = [];
  for (const skill of kit.skills) {
    const refsDir = join(dirname(skill.sourcePath), "references");
    const names = existsSync(refsDir)
      ? readdirSync(refsDir)
          .filter((f) => f.endsWith(".md"))
          .map((f) => `references/${f}`)
      : [];
    const { dangling, orphans } = checkReferenceIntegrity(skill.body, names);
    for (const d of dangling) {
      findings.push({ skill: skill.name, kind: "dangling", message: `links ${d} but it does not exist` });
    }
    for (const o of orphans) {
      findings.push({ skill: skill.name, kind: "orphan", message: `${o} exists but is never linked from SKILL.md` });
    }
  }

  const counts = { skills: kit.skills.length, agents: kit.agents.length, hooks: kit.hooks.length };
  return { ok: findings.length === 0, findings, counts, summary: renderSummary(findings, counts) };
}
