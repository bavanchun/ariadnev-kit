// SINGLE SOURCE of path constants. Imported by BOTH path-rewrites.ts and the
// Phase 3 provider resolvers so the two never drift (H3). Flip a value here once
// and every consumer follows.

/** Token used in Codex body rewrites; resolvers substitute the real home dir. */
export const HOME_TOKEN = "$HOME";

/** Neutral skills dir read natively by Codex/Cursor/Antigravity/OpenCode-global. */
export const AGENTS_SKILLS_DIR = ".agents/skills";

/** Codex support tree (scripts/rules/env/settings) under the user home. */
export const ARIADNEV_SUPPORT_DIR = ".agents/ariadnev";

/** Codex agent + command dirs (under user home). H3: one constant each. */
export const CODEX_AGENTS_DIR = ".codex/agents";
export const CODEX_COMMANDS_DIR = "commands"; // verified vs reference adapt_content; flip to "prompts" if live Codex differs
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

/**
 * Claude Code's hooks tree and settings file.
 *
 * These are one provider's values, not the installer's. Every hooks destination
 * is resolved through `ProviderConfig.hooksDir` / `hooksConfigFile`, and these
 * constants are what claude-code's entry there is set to — so a second provider
 * with hooks lands in its own tree instead of this one.
 */
export const CLAUDE_HOOKS_DIR = ".claude/hooks/av";
export const CLAUDE_SETTINGS_FILE = ".claude/settings.json";

/**
 * Where the session-init hook reads the kit's coding-level output styles from,
 * relative to whichever hooks tree the hook was installed into. They live inside
 * the hook's own install dir because the hook, not the provider, consumes them —
 * and because everything this tool writes must sit under a root the provider
 * matrix declares. The provider's own `output-styles/` is probed first and stays
 * reserved for styles the user authors natively.
 */
export const OUTPUT_STYLES_SIDECAR_SUBDIR = "output-styles";

/**
 * Namespace prefix for installed skill directories.
 *
 * Every skills root this tool writes is shared: `~/.agents/skills` is read
 * natively by four providers and already holds third-party directories, and
 * `~/.claude/skills` holds Anthropic's built-ins alongside whatever the user
 * installed. Prefixing is the observed norm in those roots, and it is what makes
 * the corpus's `(../)+av-<slug>/…` cross-skill links resolve on disk.
 */
export const SKILL_DIR_PREFIX = "av-";

/**
 * On-disk directory name for a skill, given its canonical kit name.
 *
 * The empty name is not a skill — it is how `targetPathFor` asks for the skills
 * *root* (the README matrix, `av contract --json`, `av kit install-path`). That
 * query must keep returning the bare root, or all three render `…/skills/av-`.
 */
export function installedSkillDirName(name: string): string {
  return name === "" ? "" : `${SKILL_DIR_PREFIX}${name}`;
}
