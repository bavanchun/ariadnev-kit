// SINGLE SOURCE of path constants. Imported by BOTH path-rewrites.ts and the
// Phase 3 provider resolvers so the two never drift (H3). Flip a value here once
// and every consumer follows.

/** Token used in Codex body rewrites; resolvers substitute the real home dir. */
export const HOME_TOKEN = "$HOME";

/** Neutral skills dir read natively by Codex/Cursor/Antigravity/OpenCode-global. */
export const AGENTS_SKILLS_DIR = ".agents/skills";

/** Codex support tree (scripts/rules/env/settings) under the user home. */
export const VCSKILL_SUPPORT_DIR = ".agents/vcskill";

/** Codex agent + command dirs (under user home). H3: one constant each. */
export const CODEX_AGENTS_DIR = ".codex/agents";
export const CODEX_COMMANDS_DIR = "commands"; // verified vs claudekit adapt_content; flip to "prompts" if live Codex differs
export const CODEX_COMMANDS_PATH = `.codex/${CODEX_COMMANDS_DIR}`;

/** OpenCode plural dirs (verified vs generate-opencode.py). */
export const OPENCODE_DIR = ".opencode";
export const OPENCODE_AGENTS_DIR = `${OPENCODE_DIR}/agents`;
export const OPENCODE_COMMANDS_DIR = `${OPENCODE_DIR}/commands`;
export const OPENCODE_SKILLS_DIR = `${OPENCODE_DIR}/skills`;

/** Neutral (.agents) support dirs for cursor/antigravity/generic. */
export const AGENTS_SCRIPTS_DIR = ".agents/scripts";
export const AGENTS_DIR = ".agents";

/** Cursor-specific dirs. */
export const CURSOR_COMMANDS_DIR = ".cursor/commands";
export const CURSOR_RULES_DIR = ".cursor/rules";

/** OpenCode user-global config root (for ~/.claude rewrites). */
export const OPENCODE_USER_CONFIG = "~/.config/opencode";
