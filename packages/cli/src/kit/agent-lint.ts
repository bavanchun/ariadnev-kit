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

/**
 * Lint one agent against the av authoring spec. `fileStem` is the filename
 * without extension — the file itself is named `av-<slug>.md`, so fileStem
 * already carries the `av-` prefix and is the enforced identity anchor.
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

  // The `av-` prefix is the marker, not a separate flag: an agent we wrote
  // carries it, a ported one keeps the name upstream gave it. House rules — the
  // example pair, the checklist heading, the length budget — describe how we
  // write an agent, and 7 of the 16 ported agents have no example pair, 8 no
  // checklist, 9 exceed the budget. Enforcing them on copied content means
  // rewriting it, which is not what a port is.
  const ported = !fileStem.startsWith("av-");

  // The name is what a provider addresses the agent by, so a mismatch makes it
  // unreachable. Case is the exception, and only for ported agents: upstream
  // ships `explore.md` declaring `name: Explore`, and the provider addresses it
  // by the declared name — renaming either side would change how it is invoked.
  const nameMatches =
    typeof name === "string" && (ported ? name.toLowerCase() === fileStem.toLowerCase() : name === fileStem);
  if (!nameMatches) {
    errors.push(`${label}: frontmatter name must equal "${fileStem}" (got ${String(name)})`);
  }

  if (typeof description === "string") {
    const len = description.trim().length;
    if (len < DESCRIPTION_MIN) {
      errors.push(`${label}: description must be at least ${DESCRIPTION_MIN} chars (got ${len})`);
    } else if (len > DESCRIPTION_MAX && !ported) {
      errors.push(`${label}: description must be ${DESCRIPTION_MIN}-${DESCRIPTION_MAX} chars (got ${len})`);
    }
    if (!EXAMPLE_PAIR.test(description) && !ported) {
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
  if (lines > AGENT_MAX_LINES && !ported) {
    errors.push(`${label}: agent file is ${lines} lines, limit ${AGENT_MAX_LINES}`);
  }

  if (!/^#{1,6}\s+Behavioral Checklist\s*$/im.test(artifact.body) && !ported) {
    errors.push(`${label}: missing a "Behavioral Checklist" heading`);
  }

  return { errors };
}
