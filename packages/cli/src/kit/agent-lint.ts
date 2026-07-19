// Agent authoring lint rules for the vc kit CI gate. Mirrors skill-lint.ts:
// pure functions, no fs — load-kit reads files and passes content in.
// Spec: docs/vc-skill-authoring-spec.md (Agent authoring section).

import type { Artifact } from "./kit-types.js";

export const DESCRIPTION_MIN = 50;
export const DESCRIPTION_MAX = 1200;
export const AGENT_MAX_LINES = 120;
export const VALID_MODELS = ["opus", "sonnet", "haiku"] as const;

const EXAMPLE_PAIR = /<example>[\s\S]*?<\/example>[\s\S]*?<commentary>[\s\S]*?<\/commentary>/i;

export interface AgentLintResult {
  errors: string[];
}

function countLines(text: string): number {
  return text.split("\n").length;
}

/**
 * Lint one agent against the vc authoring spec. `fileStem` is the filename
 * without extension — the file itself is named `vc-<slug>.md`, so fileStem
 * already carries the `vc-` prefix and is the enforced identity anchor.
 */
export function lintAgent(artifact: Artifact, fileStem: string): AgentLintResult {
  const errors: string[] = [];
  const label = `agent "${fileStem}"`;
  const { name, description, tools, model } = artifact.frontmatter as {
    name?: unknown;
    description?: unknown;
    tools?: unknown;
    model?: unknown;
  };

  if (!fileStem.startsWith("vc-")) {
    errors.push(`${label}: agent file name must start with "vc-" (kebab-case, e.g. vc-explore.md)`);
  }
  if (typeof name !== "string" || name !== fileStem) {
    errors.push(`${label}: frontmatter name must equal "${fileStem}" (got ${String(name)})`);
  }

  if (typeof description === "string") {
    const len = description.trim().length;
    if (len < DESCRIPTION_MIN || len > DESCRIPTION_MAX) {
      errors.push(
        `${label}: description must be ${DESCRIPTION_MIN}-${DESCRIPTION_MAX} chars (got ${len})`,
      );
    }
    if (!EXAMPLE_PAIR.test(description)) {
      errors.push(`${label}: description needs at least one <example>...</example><commentary>...</commentary> pair for auto-delegation`);
    }
  } else {
    errors.push(`${label}: missing description`);
  }

  if (tools !== undefined && typeof tools !== "string" && !Array.isArray(tools)) {
    errors.push(`${label}: tools must be a comma-separated string or an array (got ${typeof tools})`);
  }

  if (model !== undefined && !(VALID_MODELS as readonly string[]).includes(model as string)) {
    errors.push(`${label}: model must be one of ${VALID_MODELS.join("/")} (got ${String(model)})`);
  }

  const lines = countLines(artifact.raw);
  if (lines > AGENT_MAX_LINES) {
    errors.push(`${label}: agent file is ${lines} lines, limit ${AGENT_MAX_LINES}`);
  }

  if (!/^#{1,6}\s+Behavioral Checklist\s*$/im.test(artifact.body)) {
    errors.push(`${label}: missing a "Behavioral Checklist" heading`);
  }

  return { errors };
}
