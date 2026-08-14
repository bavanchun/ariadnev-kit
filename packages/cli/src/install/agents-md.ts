import { existsSync, readFileSync } from "node:fs";

export const AGENTS_MD_START = "<!-- ariadnev:start -->";
export const AGENTS_MD_END = "<!-- ariadnev:end -->";

// AGENTS.md belongs to the user, and installs before the rename wrote their
// markers with the old brand. Both spellings must still be recognized: an
// unrecognized block is not replaced, so every reinstall would append another
// managed block beside it, and uninstall would leave the old one behind.
const MANAGED_BLOCK =
  /<!-- (?:ariadnev|vcskill):start -->[\s\S]*?<!-- (?:ariadnev|vcskill):end -->/; // brand-drift-allow: matches markers written by pre-rename installs

/**
 * Produce the full contents of an AGENTS.md with the ariadnev-managed block
 * inserted or replaced. User content outside the delimiters is preserved.
 * Pure: caller reads `existing` and writes the return value.
 */
export function mergeAgentsBlock(existing: string, block: string): string {
  const managed = `${AGENTS_MD_START}\n${block.trim()}\n${AGENTS_MD_END}`;
  if (MANAGED_BLOCK.test(existing)) return existing.replace(MANAGED_BLOCK, managed);
  const sep = existing.trim().length ? `${existing.replace(/\s+$/, "")}\n\n` : "";
  return `${sep}${managed}\n`;
}

/**
 * Reverse of mergeAgentsBlock: strip the ariadnev-managed block (and the
 * blank-line separator mergeAgentsBlock inserted before it), restoring the
 * user's original content. No-op when no managed block is present.
 */
export function removeAgentsBlock(existing: string): string {
  if (!MANAGED_BLOCK.test(existing)) return existing;
  return existing.replace(new RegExp(`\\n*${MANAGED_BLOCK.source}\\n?`), "");
}

/** Read AGENTS.md at `path` (empty string when absent). */
export function readAgentsMd(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

/** Build the managed block body from rule artifacts' bodies. */
export function buildRulesBlock(rules: { name: string; body: string }[]): string {
  return rules.map((r) => r.body.trim()).join("\n\n");
}
