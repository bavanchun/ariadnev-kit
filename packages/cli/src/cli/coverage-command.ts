import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkClaimCoverage,
  type ClaimCoverageFinding,
  type ClaimCoverageResult,
} from "../kit/claim-coverage.js";
import { parseDistillRegistry } from "../kit/distill-registry.js";
import { getKitRoot } from "../kit/embedded-kit.js";
import { loadKit } from "../kit/load-kit.js";
import { matchesSkillFilter } from "../kit/skill-filter.js";

export type CoverageFindingKind = ClaimCoverageFinding["kind"] | "registry" | "missing-skill";

export interface CoverageFinding {
  skill: string;
  claimId?: string;
  kind: CoverageFindingKind;
  message: string;
  score?: number;
}

export interface CoverageSkillResult extends ClaimCoverageResult {
  reason?: string;
}

export interface CoverageResult {
  ok: boolean;
  findings: CoverageFinding[];
  skills: CoverageSkillResult[];
  summary: string;
}

export interface CoverageOpts {
  kitRoot?: string;
  /** Public one-skill filter, bare or vc:-prefixed. */
  skill?: string;
  /** Internal exact subset used by aggregate validate. */
  skillNames?: string[];
  threshold?: number;
}

function fullSkillContent(sourcePath: string, body: string): string {
  const references = join(dirname(sourcePath), "references");
  if (!existsSync(references)) return body;
  const contents = readdirSync(references)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => readFileSync(join(references, name), "utf8"));
  return [body, ...contents].join("\n");
}

function render(skills: CoverageSkillResult[], findings: CoverageFinding[]): string {
  const applicable = skills.filter((skill) => skill.applicable).length;
  const lines = [`vcskill coverage — ${skills.length} skill(s), ${applicable} claim-tracked`];
  for (const skill of skills) {
    if (!skill.applicable) {
      lines.push(`  [n/a] ${skill.skill}: ${skill.reason ?? "not claim-tracked"}`);
    } else if (skill.ok) {
      lines.push(`  [pass] ${skill.skill}: ${skill.covered} covered, ${skill.rejected} rejected`);
    } else {
      lines.push(`  [fail] ${skill.skill}: ${skill.findings.length} unresolved claim(s)`);
    }
  }
  for (const finding of findings) {
    const id = finding.claimId ? `/${finding.claimId}` : "";
    lines.push(`  [${finding.kind}] ${finding.skill}${id}: ${finding.message}`);
  }
  lines.push("  static omission ratchet only — not behavioral parity");
  return lines.join("\n");
}

function failed(finding: CoverageFinding): CoverageResult {
  return { ok: false, findings: [finding], skills: [], summary: render([], [finding]) };
}

/** Run strict, offline claim coverage over one skill or a selected kit subset. */
export function runCoverage(opts: CoverageOpts = {}): CoverageResult {
  const root = opts.kitRoot ?? getKitRoot(dirname(fileURLToPath(import.meta.url)));
  let kit;
  let registry;
  try {
    kit = loadKit(root);
    registry = parseDistillRegistry(readFileSync(join(root, "distill-decisions.json"), "utf8"));
  } catch (error) {
    return failed({
      skill: "(registry)",
      kind: "registry",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  let selected = kit.skills;
  if (opts.skill) {
    selected = kit.skills.filter((skill) => matchesSkillFilter(skill.name, [opts.skill!]));
    if (selected.length === 0) {
      return failed({ skill: opts.skill, kind: "missing-skill", message: "skill not found in kit" });
    }
  } else if (opts.skillNames) {
    selected = kit.skills.filter((skill) => matchesSkillFilter(skill.name, opts.skillNames!));
  }

  const findings: CoverageFinding[] = [];
  const skills: CoverageSkillResult[] = [];
  for (const skill of selected) {
    const entry = registry.skills[skill.name];
    if (!entry) {
      findings.push({ skill: skill.name, kind: "registry", message: "registry entry is missing" });
      continue;
    }
    const metadata = skill.frontmatter.metadata as Record<string, unknown>;
    const fields = ["upstream", "upstream_version", "upstream_digest", "upstream_relation"] as const;
    const mismatch = fields.find((field) => metadata[field] !== entry[field]);
    if (mismatch) {
      findings.push({
        skill: skill.name,
        kind: "registry",
        message: `registry ${mismatch} does not match SKILL.md metadata`,
      });
      continue;
    }
    const result = checkClaimCoverage({
      skill: skill.name,
      relation: entry.upstream_relation,
      claims: entry.claims,
      content: fullSkillContent(skill.sourcePath, skill.body),
      threshold: opts.threshold,
    });
    const reason = result.applicable
      ? undefined
      : entry.upstream_relation === "distill"
        ? "no tracked claims"
        : `relation ${entry.upstream_relation}`;
    skills.push({ ...result, ...(reason ? { reason } : {}) });
    findings.push(...result.findings);
  }
  return { ok: findings.length === 0, findings, skills, summary: render(skills, findings) };
}
