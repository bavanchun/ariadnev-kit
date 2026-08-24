// Skill authoring lint rules for the av kit CI gate.
// Pure functions: load-kit reads files and passes content in, so every rule is
// unit-testable without a filesystem. Spec: docs/av-skill-authoring-spec.md.

import type { Artifact } from "./kit-types.js";
import { skillReferencePattern } from "./skill-crossrefs.js";

export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 200;

export const SKILL_MAX_LINES = 300;
export const SKILL_MAX_LINES_CEILING = 400;
/**
 * 800, raised from 300. Measured over the 463 reference files the loader
 * actually sees: 83 exceed 300 and 6 exceed 800. A limit two thirds of the
 * corpus-by-weight violates is not a limit, it is a warning generator — and it
 * was suppressed for exactly the files that tripped it. 800 leaves 6 genuine
 * outliers (822-1718 lines) to answer for themselves.
 *
 * "The loader actually sees" is load-bearing: `readReferenceFiles` does not
 * recurse, so `references/<subdir>/*.md` is never linted. Counted recursively
 * the corpus is 500 files, 89 over 300 and 8 over 800 — two outliers this rule
 * cannot reach. They install anyway; the copy in `install-plan.ts` is recursive.
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
  /**
   * Findings that hold for every skill, exempt or not — today only the
   * duplicate-heading heuristic. These are not a backlog and never reach zero
   * by working through the exemption list.
   */
  warnings: string[];
  /**
   * Findings the exemption list suppressed: what this skill *would* have been
   * told, had it not been listed. Separate from `warnings` because they are the
   * backlog ADR 0013 promises to keep countable, and mixing the two produced a
   * number that overstated it 2.8x and could never reach zero.
   */
  held: string[];
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

/**
 * The section name on one level-2 heading line, or `null` if the line is not
 * one. The single definition of "this line is `## <name>`", used both to decide
 * a required section is present and to find its body.
 *
 * Two callers with their own idea of the shape is how a gate goes quiet: an
 * earlier version tested `line.trim() === "## Workflow position"` here and
 * `/^##\s+(.+?)\s*$/` there, so `##<space><space>Workflow position` satisfied
 * the required-section check and made the content check skip the section
 * entirely. One keystroke, no error, rule disabled.
 */
function levelTwoHeadingName(line: string): string | null {
  const match = /^##\s+(.+?)\s*$/.exec(line);
  return match === null ? null : match[1].trim();
}

function levelTwoHeadings(markdown: string): Set<string> {
  const out = new Set<string>();
  for (const line of markdown.split("\n")) {
    const name = levelTwoHeadingName(line);
    if (name !== null) out.add(`## ${name}`);
  }
  return out;
}

/**
 * An explicit "this skill stands alone" — the deliberate-omission escape.
 *
 * "none" has to be the whole answer: a line that is nothing but an optional
 * label (`Related:`, `**Typically precedes:**`) and the word. Anchoring to the
 * line is what makes it a declaration — `\bnone\b` anywhere in the section also
 * accepts "none of the downstream skills depend on it", and even a line-initial
 * or post-colon match accepts "None of the other skills…" and "Caveat: none of
 * this applies". Those are prose, and prose is what this rule exists to reject.
 *
 * No skill in the kit takes the escape today, so the strictness costs nothing —
 * only `av add-skill`'s "Related: none." scaffold and the fixtures rely on it.
 */
const DECLARES_NONE =
  /^[ \t]*(?:[-*+][ \t]+)?(?:\*{0,2}[^:\n*]{0,60}:\*{0,2}[ \t]*)?\*{0,2}none\*{0,2}[ \t]*[.!]?[ \t]*$/im;

/**
 * Body of one level-2 section: everything between its heading and the next
 * level-2 heading, or end of file. `null` when the section is absent — the
 * required-section check above already reports that, and reporting it twice
 * makes one defect look like two.
 */
function sectionBody(markdown: string, name: string): string | null {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => levelTwoHeadingName(line) === name);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (levelTwoHeadingName(lines[i]) !== null) {
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
 * Every house-rule violation is an error; warnings hold independently.
 */
export function lintSkill(
  artifact: Artifact,
  references: ReferenceFile[],
): SkillLintResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const held: string[] = [];
  const label = `skill "${artifact.name}"`;

  for (const field of Object.keys(artifact.frontmatter)) {
    if (!ALLOWED_FIELDS.has(field)) {
      errors.push(`${label}: unknown frontmatter field "${field}"`);
    }
  }

  const description = artifact.frontmatter.description;
  if (typeof description === "string") {
    const len = description.trim().length;
    // Too short is a defect in any skill: a description is how the model decides
    // whether to load it, and one that says nothing makes the skill unreachable.
    if (len < DESCRIPTION_MIN) {
      errors.push(`${label}: description must be at least ${DESCRIPTION_MIN} chars (got ${len})`);
    } else if (len > DESCRIPTION_MAX) {
      const over = `${label}: description is ${len} chars, over the ${DESCRIPTION_MAX}-char house limit`;
      errors.push(over);
    }
    if (!TRIGGER_VERB.test(description)) {
      const noTrigger = `${label}: description needs a trigger verb (use/invoke/run/activate/trigger) saying when to fire`;
      errors.push(noTrigger);
    }
  }

  const maxLines = resolveMaxLines(artifact, errors);
  const skillLines = countLines(artifact.raw);
  if (skillLines > maxLines) {
    const tooLong = `${label}: SKILL.md is ${skillLines} lines, limit ${maxLines} (default ${SKILL_MAX_LINES})`;
    errors.push(tooLong);
  }

  const skillHeadings = headings(artifact.body);
  const exactSections = levelTwoHeadings(artifact.body);
  const houseErrors = errors;
  for (const section of REQUIRED_SECTIONS) {
    if (!exactSections.has(section)) {
      houseErrors.push(`${artifact.sourcePath}: ${label} missing required section "${section}"`);
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
  const position = sectionBody(artifact.body, "Workflow position");
  if (position !== null) {
    // A skill naming only itself has answered nothing — the question is what it
    // hands off to or follows. No skill in the kit does this; excluding it keeps
    // the cheapest way to satisfy the rule from also being a way to dodge it.
    const named = [...position.matchAll(skillReferencePattern())]
      .map((match) => match[1])
      .filter((slug) => slug !== artifact.name);
    if (named.length === 0 && !DECLARES_NONE.test(position)) {
      houseErrors.push(
        `${label}: Workflow position names no other av:<slug> — name what it hands off to or follows, or say "none"`,
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
      // themselves, so this is always an error.
      const tooLong = `${label}: ${ref.name} is ${refLines} lines, limit ${REFERENCE_MAX_LINES}`;
      errors.push(tooLong);
    }
    for (const [normalized, original] of headings(ref.content)) {
      if (skillHeadings.has(normalized)) {
        warnings.push(
          `${label}: heading "${original}" appears in both SKILL.md and ${ref.name} — likely duplicated content`,
        );
      }
    }
  }

  return { errors, warnings, held };
}
