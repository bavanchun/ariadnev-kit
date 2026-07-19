import { resolve, relative, isAbsolute } from "node:path";

/**
 * Cross-platform containment check: `dest` must sit strictly under one of
 * `roots`. Shared by install (never write outside home/cwd) and uninstall
 * (never rm outside home/cwd) — a security boundary duplicated once already
 * is one time too many.
 */
export function assertWithinRoots(dest: string, roots: string[]): void {
  const abs = resolve(dest);
  const within = roots.some((root) => {
    const rel = relative(resolve(root), abs);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  });
  if (!within) throw new Error(`refusing to touch a path outside allowed roots: ${dest}`);
}
