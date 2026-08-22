// Skill authoring lint rules for the av kit CI gate.
// Pure functions: load-kit reads files and passes content in, so every rule is
// unit-testable without a filesystem. Spec: docs/av-skill-authoring-spec.md.

import type { Artifact } from "./kit-types.js";
import { SKILL_REFERENCE } from "./skill-crossrefs.js";

export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 200;

/**
 * A skill still held to the old severity, named in `kit/skills-lint-exempt.json`.
 *
 * This replaces a blanket downgrade keyed on `metadata.origin: ported`. The
 * difference is measurability: a property of the artifact exempts a class that
 * can silently grow, while a checked-in list of names is countable, shrinks by
 * deletion, and has a test that fails when an entry no longer needs to be there.
 * 101 of 105 skills were unmeasurable under the old rule — not lenient,
 * *unmeasurable*, because nothing distinguished "passes" from "never asked".
 *
 * The list is read in `load-kit.ts`, which has a kit root; this module takes the
 * result. Reading it here would break the purity contract at the top of the file
 * and make the fixture tests depend on the real repo's JSON. Same shape as
 * `pendingPortNames()`.
 *
 * ADR 0013.
 */
export type ExemptNames = ReadonlySet<string>;

export const SKILL_MAX_LINES = 300;
export const SKILL_MAX_LINES_CEILING = 400;
/**
 * 800, raised from 300. Measured over the 463 reference files the loader
 * actually sees: 83 exceed 300 and 6 exceed 800. A limit two thirds of the
 * corpus-by-weight violates is not a limit, it is a warning generator — and it
 * was suppressed for exactly the files that tripped it. 800 leaves 6 genuine
 * outliers (821-1717 lines) to answer for themselves.
 */
export const REFERENCE_MAX_LINES = 800;
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

/**
 * An explicit "this skill stands alone" — the deliberate-omission escape.
 *
 * "none" has to be the answer, not a word in a sentence: after a label's colon,
 * or alone at the start of a line. A bare `\bnone\b` would also accept "none of
 * the downstream skills depend on it", which is prose, not a declaration. No
 * skill in the kit takes this escape today, so tightening it costs nothing —
 * only `av add-skill`'s "Related: none." scaffold and the fixtures rely on it.
 */
const DECLARES_NONE = /(?::\s*|^\s*|\n\s*)(?:\*\*)?\s*none\b/i;

/**
 * Body of one level-2 section: everything between its heading and the next
 * level-2 heading, or end of file. `null` when the section is absent — the
 * required-section check above already reports that, and reporting it twice
 * makes one defect look like two.
 */
function sectionBody(markdown: string, name: string): string | null {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${name}`);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n");
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
export function lintSkill(
  artifact: Artifact,
  references: ReferenceFile[],
  exemptNames: ExemptNames = new Set(),
): SkillLintResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const label = `skill "${artifact.name}"`;

  for (const field of Object.keys(artifact.frontmatter)) {
    if (!ALLOWED_FIELDS.has(field)) {
      errors.push(`${label}: unknown frontmatter field "${field}"`);
    }
  }

  const exempt = exemptNames.has(artifact.name);

  const description = artifact.frontmatter.description;
  if (typeof description === "string") {
    const len = description.trim().length;
    // Too short is a defect in any skill: a description is how the model decides
    // whether to load it, and one that says nothing makes the skill unreachable.
    if (len < DESCRIPTION_MIN) {
      errors.push(`${label}: description must be at least ${DESCRIPTION_MIN} chars (got ${len})`);
    } else if (len > DESCRIPTION_MAX) {
      const over = `${label}: description is ${len} chars, over the ${DESCRIPTION_MAX}-char house limit`;
      (exempt ? warnings : errors).push(over);
    }
    if (!TRIGGER_VERB.test(description)) {
      const noTrigger = `${label}: description needs a trigger verb (use/invoke/run/activate/trigger) saying when to fire`;
      (exempt ? warnings : errors).push(noTrigger);
    }
  }

  const maxLines = resolveMaxLines(artifact, errors);
  const skillLines = countLines(artifact.raw);
  if (skillLines > maxLines) {
    const tooLong = `${label}: SKILL.md is ${skillLines} lines, limit ${maxLines} (default ${SKILL_MAX_LINES})`;
    (exempt ? warnings : errors).push(tooLong);
  }

  const skillHeadings = headings(artifact.body);
  const exactSections = levelTwoHeadings(artifact.body);
  if (!exempt) {
    for (const section of REQUIRED_SECTIONS) {
      if (!exactSections.has(section)) {
        errors.push(`${artifact.sourcePath}: ${label} missing required section "${section}"`);
      }
    }
    // A present heading proves nothing — the fixture corpus already ships a
    // skill whose required sections are headings with nothing under them. This
    // asks Workflow position to answer its own question: name a skill, or say
    // there is none.
    //
    // "None" is a real answer for a standalone skill, and the authoring spec
    // already uses that shape for `Proof/risk: N/A — <reason>`. Without the
    // escape the check forces authors to invent a relationship, and
    // `av add-skill` would scaffold a skill that fails the moment it is created.
    //
    // .match, not .test: SKILL_REFERENCE is global, so .test carries lastIndex
    // between calls and would answer differently on every other skill.
    const position = sectionBody(artifact.body, "Workflow position");
    if (position !== null && position.match(SKILL_REFERENCE) === null && !DECLARES_NONE.test(position)) {
      errors.push(
        `${label}: Workflow position names no av:<slug> — name what it hands off to or follows, or say "none"`,
      );
    }
  }
  for (const ref of references) {
    const refLines = countLines(ref.content);
    if (refLines > REFERENCE_MAX_LINES) {
      // Measured over the 463 reference files the loader sees: 83 exceed 300,
      // 6 exceed 800 (822-1718 lines). The old 300 was a limit most of the
      // corpus-by-weight broke, suppressed for exactly the files that broke it,
      // so it never bound anything. At 800 the six outliers answer for
      // themselves — as errors, unless the skill is on the exemption list.
      const tooLong = `${label}: ${ref.name} is ${refLines} lines, limit ${REFERENCE_MAX_LINES}`;
      (exempt ? warnings : errors).push(tooLong);
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
