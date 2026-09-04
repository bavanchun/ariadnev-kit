import type { ProviderId } from "../providers/spec-verified.js";

type Rule = [from: string, to: string];

// VERIFIED from reference codex_generator_common.py::adapt_content. Order is
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

/**
 * A hypothesis about antigravity's tool vocabulary, deliberately not applied.
 *
 * Pulled out of the binary as strings: `run_command` (Bash), `view_file`
 * (Read), `write_to_file` (Write), `edit_file` / `multi_replace_file_content` /
 * `propose_code` (Edit), `grep_search` (Grep), `find_by_name` (Glob),
 * `invoke_subagent` + `manage_subagents` (Task), `codebase_search` (no kit
 * equivalent). There is no `AskUserQuestion` equivalent, and `manage_task`
 * governs background tasks — mapping it to `TodoWrite` would rewrite a
 * planning instruction into a process-control one.
 *
 * A name that appears in a binary is a name the binary knows, not a name the
 * model is offered, so the table stays empty and the adapted text keeps
 * Claude's names. Confirming it means an `agy -p` turn, which spends the
 * user's credits. Written down because the next person to open this file will
 * otherwise extract the same strings again and reach for the same shortcut.
 */
const ANTIGRAVITY_TOOLS: Rule[] = [];

const TABLES: Record<ProviderId, Rule[]> = {
  "claude-code": [], // identity — canonical
  codex: CODEX_TOOLS,
  cursor: CURSOR_TOOLS,
  antigravity: ANTIGRAVITY_TOOLS,
  opencode: [], // UNVERIFIED → identity (footer notes it)
  omp: [], // UNVERIFIED → identity (footer notes it)
  grok: [], // UNVERIFIED → identity (footer notes it)
  dsh: [], // UNVERIFIED → identity (footer notes it)
  generic: [],
  "test-provider": [], // mock: identity (unverified tool names)
};

/** Rewrite Claude tool names to provider equivalents (non-Claude only). */
export function rewriteTools(content: string, provider: ProviderId): string {
  let out = content;
  for (const [from, to] of TABLES[provider]) {
    out = out.split(from).join(to);
  }
  return out;
}
