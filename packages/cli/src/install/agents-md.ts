import { existsSync, readFileSync } from "node:fs";

export const AGENTS_MD_START = "<!-- vcskill:start -->";
export const AGENTS_MD_END = "<!-- vcskill:end -->";

/**
 * Produce the full contents of an AGENTS.md with the vcskill-managed block
 * inserted or replaced. User content outside the delimiters is preserved.
 * Pure: caller reads `existing` and writes the return value.
 */
export function mergeAgentsBlock(existing: string, block: string): string {
  const managed = `${AGENTS_MD_START}\n${block.trim()}\n${AGENTS_MD_END}`;
  if (existing.includes(AGENTS_MD_START) && existing.includes(AGENTS_MD_END)) {
    const re = new RegExp(`${AGENTS_MD_START}[\\s\\S]*?${AGENTS_MD_END}`);
    return existing.replace(re, managed);
  }
  const sep = existing.trim().length ? `${existing.replace(/\s+$/, "")}\n\n` : "";
  return `${sep}${managed}\n`;
}

/** Read AGENTS.md at `path` (empty string when absent). */
export function readAgentsMd(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

/** Build the managed block body from rule artifacts' bodies. */
export function buildRulesBlock(rules: { name: string; body: string }[]): string {
  return rules.map((r) => r.body.trim()).join("\n\n");
}
