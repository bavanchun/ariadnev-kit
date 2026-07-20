import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadKit } from "../kit/load-kit.js";
import { getKitRoot } from "../kit/embedded-kit.js";
import { checkReferenceIntegrity } from "../kit/reference-integrity.js";
import { checkMatrixDrift } from "../providers/matrix-drift.js";
import { scoreDescriptions } from "../kit/description-collision.js";

// `vcskill validate` — lint the kit source without installing it. Wraps the
// same loadKit lint the installer runs, then adds reference-integrity
// (dangling + orphan) which loadKit does not check. Read-only; CI-able.

export interface ValidateFinding {
  skill: string;
  kind: "lint" | "dangling" | "orphan" | "matrix" | "collision";
  message: string;
  /** "warn" findings surface but do not fail validation. Default: "error". */
  level?: "warn" | "error";
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
  /** Also check the README provider matrix is in sync (CI gate). */
  check?: boolean;
  /** Override README path (tests). Default: repo README relative to this module. */
  readmePath?: string;
  /** Restrict per-skill checks to these skill names (accepts "scout" or
   * "vc:scout"). Used by `vc eval --skill`. Undefined = whole kit. */
  skillFilter?: string[];
}

/** Does a skill name match a user-supplied filter entry (bare or vc:-prefixed)? */
export function matchesFilter(name: string, filter: string[]): boolean {
  const bare = name.replace(/^vc:/, "");
  return filter.some((f) => f === name || f === bare || `vc:${f}` === name);
}

// `--check` is a CI/dev gate run from the repo root, so resolve README against
// cwd — robust whether this runs from src (tsx/bun), the bundled dist, or the
// binary. Outside a checkout the file is absent and --check reports that.
function defaultReadmePath(): string {
  return join(process.cwd(), "README.md");
}

function renderSummary(findings: ValidateFinding[], counts: ValidateResult["counts"]): string {
  const header = `vcskill validate — ${counts.skills} skills, ${counts.agents} agents, ${counts.hooks} hooks`;
  if (findings.length === 0) return `${header}\n  all checks passed`;
  const lines = [header];
  for (const f of findings) {
    const tag = (f.level ?? "error") === "warn" ? "warn:" : "";
    lines.push(`  [${tag}${f.kind}] ${f.skill}: ${f.message}`);
  }
  const errors = findings.filter((f) => (f.level ?? "error") === "error").length;
  const warns = findings.length - errors;
  lines.push(`  ${errors} error(s), ${warns} warning(s)`);
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
  const skillsToCheck = opts.skillFilter
    ? kit.skills.filter((s) => matchesFilter(s.name, opts.skillFilter!))
    : kit.skills;
  for (const skill of skillsToCheck) {
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

  // Cross-skill description confusability (routing-collision guard).
  const collisions = scoreDescriptions(
    kit.skills.map((s) => ({ name: s.name, description: String(s.frontmatter.description ?? "") })),
  );
  for (const c of collisions) {
    findings.push({
      skill: `${c.a} ~ ${c.b}`,
      kind: "collision",
      level: c.level,
      message: `descriptions ${(c.score * 100).toFixed(0)}% similar — routing may be ambiguous`,
    });
  }

  if (opts.check) {
    const readmePath = opts.readmePath ?? defaultReadmePath();
    const readme = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : null;
    if (readme === null) {
      findings.push({ skill: "(matrix)", kind: "matrix", message: `README not found at ${readmePath} — --check needs the source tree` });
    } else {
      const drift = checkMatrixDrift(readme);
      if (!drift.ok) findings.push({ skill: "(matrix)", kind: "matrix", message: drift.message });
    }
  }

  const counts = { skills: kit.skills.length, agents: kit.agents.length, hooks: kit.hooks.length };
  // Warnings surface but don't fail; only error-level findings break the gate.
  const ok = !findings.some((f) => (f.level ?? "error") === "error");
  return { ok, findings, counts, summary: renderSummary(findings, counts) };
}
