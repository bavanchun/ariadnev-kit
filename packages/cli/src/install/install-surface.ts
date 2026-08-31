// What ariadnev actually installs, as opposed to where it is allowed to write.
//
// Those are very different sets, and confusing them is a vulnerability. Install
// guards its own writes with `assertWithinRoots(dest, [home, cwd])`, which is
// sound *there* because `dest` comes from a plan derived from the embedded kit —
// the guard is a backstop over values that cannot be hostile.
//
// `backups restore` is the opposite case. Its target comes from a manifest.json
// that, for project scope, lives at `<cwd>/.ariadnev/backups/` — inside whatever
// repository the user cloned. `[home, cwd]` there permits
// `~/.ssh/authorized_keys` and `<cwd>/.git/hooks/pre-commit`, which is arbitrary
// code execution from cloning a repository and running one command.
//
// A record inside the clone cannot fix that: the receipt is in the clone too, so
// it is equally forgeable. The only thing an attacker cannot rewrite is what this
// binary is capable of installing, which is why the allowlist lives in code and
// is proven against `planInstall` by a test rather than maintained by hand.

import { relative, isAbsolute, sep } from "node:path";

/**
 * Every path prefix, relative to a scope root, that an install may write.
 *
 * Measured by planning an install for every provider in both scopes and taking
 * the first path segment of each destination; `install-surface.test.ts` re-runs
 * that measurement and fails when a plan escapes this list. Two entries are
 * wider than the current measurement on purpose — `.cursor` and
 * `.config/opencode` are declared in `adapt/paths.ts` for providers whose cells
 * are not all spec-verified yet, and a guard that is too narrow silently refuses
 * to restore someone's real backup.
 */
export const INSTALL_SURFACE: readonly string[] = [
  ".agents",
  ".claude",
  ".codex",
  ".config/opencode",
  ".cursor",
  // grok keeps its own Claude-shaped tree, so it is the one provider added in
  // the 9-provider union that needs a prefix of its own — `omp` and `dsh` both
  // resolve under `.agents`, which is already here.
  ".grok",
  // antigravity's own tree. Narrower than `.gemini` deliberately: that
  // directory is the Gemini CLI's whole home and holds credentials
  // (`antigravity-oauth-token`) beside the config; naming the parent would put
  // them inside a surface a restore is allowed to write.
  ".gemini/config",
  ".opencode",
  ".test-provider",
  ".ariadnev",
  "AGENTS.md",
  "CLAUDE.md",
];

function withinPrefix(rel: string, prefix: string): boolean {
  return rel === prefix || rel.startsWith(`${prefix}/`) || rel.startsWith(`${prefix}${sep}`);
}

/**
 * True when `target` is a path this tool installs to, under one of `roots`.
 *
 * Both halves are required. The root check keeps a manifest from naming another
 * user's home; the surface check keeps it from naming a shell profile inside the
 * user's own.
 */
export function isInstallSurfacePath(target: string, roots: readonly string[]): boolean {
  return roots.some((root) => {
    const rel = relative(root, target);
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return false;
    const normalized = rel.split(sep).join("/");
    return INSTALL_SURFACE.some((prefix) => withinPrefix(normalized, prefix));
  });
}

/** The same check, as an assertion, phrased for a restore. */
export function assertInstallSurfacePath(target: string, roots: readonly string[]): void {
  if (!isInstallSurfacePath(target, roots)) {
    throw new Error(`refusing to restore a path ariadnev does not install: ${target}`);
  }
}
