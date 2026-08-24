// Agent authoring lint rules for the av kit CI gate. Mirrors skill-lint.ts:
// pure functions, no fs — load-kit reads files and passes content in.
// Spec: docs/av-skill-authoring-spec.md (Agent authoring section).

import type { Artifact } from "./kit-types.js";

export const DESCRIPTION_MIN = 50;
export const DESCRIPTION_MAX = 1200;
export const AGENT_MAX_LINES = 120;
// Tiers, plus `inherit` — which is not a tier but a real, distinct choice: run
// on whatever the caller is running on. Both were missing because the list was
// written before the `fable` tier existed and before any agent declined to pin.
export const VALID_MODELS = ["opus", "sonnet", "haiku", "fable", "inherit"] as const;

const EXAMPLE_PAIR = /<example>[\s\S]*?<\/example>[\s\S]*?<commentary>[\s\S]*?<\/commentary>/i;

export interface AgentLintResult {
  errors: string[];
}

function countLines(text: string): number {
  return text.split("\n").length;
}

// Claude Code ships a built-in `Explore` subagent type, and ten kit agents
// grant `Task(Explore)` against that spelling. `explore.md` declares the same
// name so one grant reaches both; lowercasing it would orphan the grants.
// One file, one spelling — not a case-insensitive rule.
const NAME_CASE_EXCEPTIONS: Readonly<Record<string, string>> = { explore: "Explore" };

/**
 * Lint one agent against the av authoring spec. `fileStem` is the filename
 * without extension and is the enforced identity anchor: a provider addresses
 * the agent by its declared name, so the two must agree.
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

  // The name is what a provider addresses the agent by, so a mismatch makes it
  // unreachable under one spelling and granted under the other.
  const expectedName = NAME_CASE_EXCEPTIONS[fileStem] ?? fileStem;
  if (name !== expectedName) {
    errors.push(`${label}: frontmatter name must equal "${expectedName}" (got ${String(name)})`);
  }

  if (typeof description === "string") {
    const len = description.trim().length;
    if (len < DESCRIPTION_MIN) {
      errors.push(`${label}: description must be at least ${DESCRIPTION_MIN} chars (got ${len})`);
    } else if (len > DESCRIPTION_MAX) {
      errors.push(`${label}: description must be ${DESCRIPTION_MIN}-${DESCRIPTION_MAX} chars (got ${len})`);
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
