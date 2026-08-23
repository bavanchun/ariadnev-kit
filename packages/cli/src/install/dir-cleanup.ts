import { existsSync, readdirSync, rmdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

/**
 * Remove now-empty directories walking up from `startDir`, stopping before
 * ever deleting a "kind root" — a provider dir (e.g. `.claude`) or the
 * artifact-kind dir beneath it (e.g. `.claude/skills`), depth <= 2 below
 * `scopeRoot`. Only the artifact's own directory and anything nested deeper
 * gets cleaned. Bounded and conservative on purpose — this is the
 * highest-risk operation in the CLI.
 *
 * Shared by uninstall and by the install-time heal, which removes the tree an
 * older resolver wrote. One implementation, because the two answer the same
 * question and a second copy would be the one that forgets the depth floor.
 */
export function cleanEmptyDirsUpward(startDir: string, scopeRoot: string): void {
  let current = resolve(startDir);
  const root = resolve(scopeRoot);
  for (;;) {
    const rel = relative(root, current);
    if (rel === "" || rel.startsWith("..")) return; // at or above scope root
    const depth = rel.split(/[/\\]/).filter(Boolean).length;
    if (depth <= 2) return; // kind root (e.g. .claude/skills) or provider root — never remove
    if (!existsSync(current)) return;
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }
    if (entries.length > 0) return;
    rmdirSync(current);
    current = dirname(current);
  }
}
