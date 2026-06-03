import type { ProviderId } from "../providers/spec-verified.js";

type Rule = [from: string, to: string];

// VERIFIED from claudekit codex_generator_common.py::adapt_content. Order is
// preserved exactly (NOT length-sorted) for byte-parity with the reference.
const CODEX_TOOLS: Rule[] = [
  ["AskUserQuestion", "request_user_input"],
  ["TodoWrite", "update_plan"],
  ["TaskCreate", "Codex task tracking via update_plan"],
  ["TaskUpdate", "Codex task updates via update_plan"],
  ["TaskGet", "Codex local plan/report reads"],
  ["TaskList", "Codex local plan/task review"],
  ["Task tool", "Codex spawn_agent tool"],
  ["Task(Explore)", "spawn_agent(explorer)"],
  ["Task(researcher)", "spawn_agent(researcher)"],
  ["SendMessage", "send_input or final report"],
];

// Cursor: UNVERIFIED → minimal, safe rewrites only. Specific Task variants are
// rewritten (no bare `Task` to avoid clobbering `TaskCreate`); AskUserQuestion
// has no equivalent so it stays and the footer explains it.
const CURSOR_TOOLS: Rule[] = [
  ["Task(Explore)", "spawn_agent(explorer)"],
  ["Task(researcher)", "spawn_agent(researcher)"],
  ["Task tool", "spawn_agent tool"],
  ["SendMessage", "send_message"],
];

const TABLES: Record<ProviderId, Rule[]> = {
  "claude-code": [], // identity — canonical
  codex: CODEX_TOOLS,
  cursor: CURSOR_TOOLS,
  antigravity: [], // UNVERIFIED → identity (footer notes it)
  opencode: [], // UNVERIFIED → identity (footer notes it)
  generic: [],
};

/** Rewrite Claude tool names to provider equivalents (non-Claude only). */
export function rewriteTools(content: string, provider: ProviderId): string {
  let out = content;
  for (const [from, to] of TABLES[provider]) {
    out = out.split(from).join(to);
  }
  return out;
}
