// Skill authoring lint rules for the av kit CI gate.
// Pure functions: load-kit reads files and passes content in, so every rule is
// unit-testable without a filesystem. Spec: docs/av-skill-authoring-spec.md.

import type { Artifact } from "./kit-types.js";

export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 200;
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

  const description = artifact.frontmatter.description;
  if (typeof description === "string") {
    const len = description.trim().length;
    if (len < DESCRIPTION_MIN || len > DESCRIPTION_MAX) {
      errors.push(
        `${label}: description must be ${DESCRIPTION_MIN}-${DESCRIPTION_MAX} chars (got ${len})`,
      );
    }
    if (!TRIGGER_VERB.test(description)) {
      errors.push(
        `${label}: description needs a trigger verb (use/invoke/run/activate/trigger) saying when to fire`,
      );
    }
  }

  const maxLines = resolveMaxLines(artifact, errors);
  const skillLines = countLines(artifact.raw);
  if (skillLines > maxLines) {
    errors.push(`${label}: SKILL.md is ${skillLines} lines, limit ${maxLines} (default ${SKILL_MAX_LINES})`);
  }

  const skillHeadings = headings(artifact.body);
  const exactSections = levelTwoHeadings(artifact.body);
  for (const section of REQUIRED_SECTIONS) {
    if (!exactSections.has(section)) {
      errors.push(`${artifact.sourcePath}: ${label} missing required section "${section}"`);
    }
  }
  for (const ref of references) {
    const refLines = countLines(ref.content);
    if (refLines > REFERENCE_MAX_LINES) {
      errors.push(`${label}: ${ref.name} is ${refLines} lines, limit ${REFERENCE_MAX_LINES}`);
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
