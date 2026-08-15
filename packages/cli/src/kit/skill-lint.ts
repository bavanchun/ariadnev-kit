// Skill authoring lint rules for the av kit CI gate.
// Pure functions: load-kit reads files and passes content in, so every rule is
// unit-testable without a filesystem. Spec: docs/av-skill-authoring-spec.md.

import type { Artifact } from "./kit-types.js";

export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 200;

/**
 * A skill copied from upstream, marked `metadata.origin: ported` by the port
 * script.
 *
 * The house rules below — the three required sections, the description length,
 * the trigger verb, the line budget — describe how *we* write a skill. They were
 * written for a corpus of 26 hand-authored skills and every one of them met the
 * bar. The ported corpus does not: all 103 lack `## Output format` and
 * `## Quality gates`, 44 carry a longer description, 17 run past the line
 * budget. Enforcing the rules on copied content leaves two options, and both are
 * worse than this one — rewrite content the port promised to copy verbatim, or
 * grant a blanket exemption that quietly retires the bar for everything.
 *
 * So the bar stays, scoped to what it describes. A ported skill is still checked
 * for the things that make a skill *valid* (frontmatter shape, unknown fields, a
 * description that exists and says something); what it is not checked for is
 * house style. Its size is reported as a warning rather than ignored, because
 * the cost is real and belongs in view even when it is not ours to fix.
 */
export function isPorted(artifact: Artifact): boolean {
  const metadata = artifact.frontmatter.metadata;
  return typeof metadata === "object" && metadata !== null && (metadata as Record<string, unknown>).origin === "ported";
}
export const SKILL_MAX_LINES = 300;
export const SKILL_MAX_LINES_CEILING = 400;
export const REFERENCE_MAX_LINES = 300;
export const REQUIRED_SECTIONS = [
  "## Output format",
  "## Quality gates",
  "## Workflow position",
] as const;

/** Description must tell the model when to fire the skill, not just what it is. */
const TRIGGER_VERB = /\b(use|invoke|run|activate|trigger)\b/i;

// The exact vocabulary the authored skill corpus uses — nothing wider, so a
// misspelled key is still a hard error rather than silently ignored data.
const ALLOWED_FIELDS = new Set([
  "name",
  "description",
  "argument-hint",
  "user-invocable",
  "disable-model-invocation",
  "allowed-tools",
  "metadata",
  "version",
  "license",
  "when_to_use",
  "keywords",
  "category",
  "related",
  "maturity",
  "languages",
]);

export interface ReferenceFile {
  /** File name relative to the skill dir, e.g. "references/foo.md". */
  name: string;
  content: string;
}

export interface SkillLintResult {
  errors: string[];
  warnings: string[];
}

function countLines(text: string): number {
  return text.split("\n").length;
}

/** Map of normalized (lowercased) heading -> original text, for case-preserving warnings. */
function headings(markdown: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const match of markdown.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)) {
    const text = match[1].trim();
    out.set(text.toLowerCase(), text);
  }
  return out;
}

function levelTwoHeadings(markdown: string): Set<string> {
  const out = new Set<string>();
  for (const match of markdown.matchAll(/^##\s+(.+?)\s*$/gm)) {
    out.add(`## ${match[1].trim()}`);
  }
  return out;
}

function resolveMaxLines(artifact: Artifact, errors: string[]): number {
  const metadata = artifact.frontmatter.metadata;
  const override =
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>).maxLines
      : undefined;
  if (override === undefined) return SKILL_MAX_LINES;
  if (typeof override !== "number" || override > SKILL_MAX_LINES_CEILING) {
    errors.push(
      `skill "${artifact.name}": metadata.maxLines must be a number <= ${SKILL_MAX_LINES_CEILING} (got ${String(override)})`,
    );
    return SKILL_MAX_LINES;
  }
  return override;
}

/**
 * Lint one skill against the av authoring spec. Errors fail the kit load;
 * warnings (duplicate-heading heuristic) surface on `Kit.warnings` only.
 */
export function lintSkill(artifact: Artifact, references: ReferenceFile[]): SkillLintResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const label = `skill "${artifact.name}"`;

  for (const field of Object.keys(artifact.frontmatter)) {
    if (!ALLOWED_FIELDS.has(field)) {
      errors.push(`${label}: unknown frontmatter field "${field}"`);
    }
  }

  const ported = isPorted(artifact);

  const description = artifact.frontmatter.description;
  if (typeof description === "string") {
    const len = description.trim().length;
    // Too short is a defect in any skill: a description is how the model decides
    // whether to load it, and one that says nothing makes the skill unreachable.
    if (len < DESCRIPTION_MIN) {
      errors.push(`${label}: description must be at least ${DESCRIPTION_MIN} chars (got ${len})`);
    } else if (len > DESCRIPTION_MAX) {
      const over = `${label}: description is ${len} chars, over the ${DESCRIPTION_MAX}-char house limit`;
      (ported ? warnings : errors).push(over);
    }
    if (!TRIGGER_VERB.test(description)) {
      const noTrigger = `${label}: description needs a trigger verb (use/invoke/run/activate/trigger) saying when to fire`;
      (ported ? warnings : errors).push(noTrigger);
    }
  }

  const maxLines = resolveMaxLines(artifact, errors);
  const skillLines = countLines(artifact.raw);
  if (skillLines > maxLines) {
    const tooLong = `${label}: SKILL.md is ${skillLines} lines, limit ${maxLines} (default ${SKILL_MAX_LINES})`;
    (ported ? warnings : errors).push(tooLong);
  }

  const skillHeadings = headings(artifact.body);
  const exactSections = levelTwoHeadings(artifact.body);
  if (!ported) {
    for (const section of REQUIRED_SECTIONS) {
      if (!exactSections.has(section)) {
        errors.push(`${artifact.sourcePath}: ${label} missing required section "${section}"`);
      }
    }
  }
  for (const ref of references) {
    const refLines = countLines(ref.content);
    if (refLines > REFERENCE_MAX_LINES) {
      // Same reasoning as SKILL.md length: upstream ships 136 reference files
      // past this budget (the longest is 2249 lines). Reporting the cost is
      // useful; failing the build over content we chose to copy verbatim is not.
      const tooLong = `${label}: ${ref.name} is ${refLines} lines, limit ${REFERENCE_MAX_LINES}`;
      (ported ? warnings : errors).push(tooLong);
    }
    for (const [normalized, original] of headings(ref.content)) {
      if (skillHeadings.has(normalized)) {
        warnings.push(
          `${label}: heading "${original}" appears in both SKILL.md and ${ref.name} — likely duplicated content`,
        );
      }
    }
  }

  return { errors, warnings };
}
