import type { ProviderId } from "../providers/spec-verified.js";
import {
  HOME_TOKEN,
  AGENTS_SKILLS_DIR,
  VCSKILL_SUPPORT_DIR,
  CODEX_AGENTS_DIR,
  CODEX_COMMANDS_PATH,
  OPENCODE_DIR,
  OPENCODE_USER_CONFIG,
  AGENTS_DIR,
} from "./paths.js";

type Rule = [from: string, to: string];

const h = (p: string) => `${HOME_TOKEN}/${p}`;

const CODEX_RULES: Rule[] = [
  [".claude/skills/", h(`${AGENTS_SKILLS_DIR}/`)],
  [".claude/scripts/", h(`${VCSKILL_SUPPORT_DIR}/scripts/`)],
  [".claude/rules/", h(`${VCSKILL_SUPPORT_DIR}/rules/`)],
  [".claude/agents/", h(`${CODEX_AGENTS_DIR}/`)],
  [".claude/commands/", h(`${CODEX_COMMANDS_PATH}/`)],
  // Reduced-scope prefixes ported from claudekit adapt_content for fidelity;
  // hooks are not shipped in v1 but a body may still reference these paths.
  [".claude/hooks/", h(`${VCSKILL_SUPPORT_DIR}/hooks/`)],
  [".claude/agent-memory/", ".codex/agent-memory/"],
  [".claude/chrome-devtools/", ".codex/chrome-devtools/"],
  [".claude/.ck.json", h(`${VCSKILL_SUPPORT_DIR}/.ck.json`)],
  [".claude/.mcp.json", h(`${VCSKILL_SUPPORT_DIR}/.mcp.json`)],
  [".claude/.env", h(`${VCSKILL_SUPPORT_DIR}/.env`)],
  [".claude/settings.json", h(`${VCSKILL_SUPPORT_DIR}/settings.json`)],
  [".claude/", h(`${VCSKILL_SUPPORT_DIR}/`)],
  ["~/.claude/skills/", h(`${AGENTS_SKILLS_DIR}/`)],
  ["~/.claude/scripts/", h(`${VCSKILL_SUPPORT_DIR}/scripts/`)],
  ["~/.claude/", h(`${VCSKILL_SUPPORT_DIR}/`)],
];

const OPENCODE_RULES: Rule[] = [
  ["~/.claude/", `${OPENCODE_USER_CONFIG}/`],
  [".claude/", `${OPENCODE_DIR}/`],
];

const NEUTRAL_RULES: Rule[] = [
  [".claude/skills/", `${AGENTS_SKILLS_DIR}/`],
  ["~/.claude/skills/", `${AGENTS_SKILLS_DIR}/`],
  [".claude/", `${AGENTS_DIR}/`],
  ["~/.claude/", `${AGENTS_DIR}/`],
];

const TABLES: Record<ProviderId, Rule[]> = {
  "claude-code": [],
  codex: CODEX_RULES,
  cursor: NEUTRAL_RULES,
  antigravity: NEUTRAL_RULES,
  opencode: OPENCODE_RULES,
  generic: NEUTRAL_RULES,
};

/**
 * Rewrite canonical `.claude/...` paths to provider targets. Rules are applied
 * longest-`from`-first so a short prefix (`.claude/`) never clobbers a longer,
 * more-specific one (`.claude/skills/`, `~/.claude/skills/`).
 */
export function rewritePaths(content: string, provider: ProviderId): string {
  const rules = [...TABLES[provider]].sort((a, b) => b[0].length - a[0].length);
  let out = content;
  for (const [from, to] of rules) {
    out = out.split(from).join(to);
  }
  return out;
}
