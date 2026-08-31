import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const temps: string[] = [];

export function tempDir(prefix: string, root = tmpdir()): string {
  const path = mkdtempSync(join(root, prefix));
  temps.push(path);
  return path;
}

export function cleanupTemps(): void {
  while (temps.length > 0) {
    const path = temps.pop()!;
    unlockTree(path);
    rmSync(path, { recursive: true, force: true });
  }
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

export function sha256File(path: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

export function createHistoricalFixture(root: string, description: string): void {
  write(join(root, "packages", "cli", "package.json"), JSON.stringify({ name: "ariadnev", version: "0.10.0" }));
  write(join(root, "kit", "kit-data.json"), JSON.stringify({
    skills: [{ name: "historical-skill", frontmatter: { name: "historical-skill", description, metadata: { safe: true }, raw: "private" } }],
    agents: [],
  }));
  write(join(root, "packages", "cli", "src", "index.ts"), [
    "import { Command } from 'commander';",
    "export function buildProgram() {",
    "  return new Command('ariadnev').description('Historical CLI').option('--safe');",
    "}",
  ].join("\n"));
  write(join(root, "packages", "cli", "src", "kit", "load-kit.ts"), [
    "import { readFileSync } from 'node:fs';",
    "import { join } from 'node:path';",
    "export function resolveKitRoot(root: string) { return join(root, 'kit'); }",
    "export function loadKit(root: string) {",
    "  return JSON.parse(readFileSync(join(root, 'kit-data.json'), 'utf8'));",
    "}",
  ].join("\n"));
  write(join(root, "packages", "cli", "src", "kit", "load-workflows.ts"), [
    "export function loadWorkflows() {",
    "  return [{ name: 'historical-flow', graph: { title: 'Historical Flow', description: 'Public workflow', nodes: [{ id: 'node-1', type: 'task', handler: { kind: 'tool', ref: 'historical.handler' } }], edges: [] } }];",
    "}",
  ].join("\n"));
  write(join(root, "packages", "cli", "src", "providers", "provider-matrix.ts"), [
    "export function buildProviderMatrix() {",
    "  return { claude: { claudeCode: { verified: true, path: 'providers/claude/code.md' } } };",
    "}",
  ].join("\n"));
}

export function makeTreeReadOnly(root: string): void {
  const directories: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      directories.push(current);
      for (const entry of readdirSync(current)) stack.push(join(current, entry));
    } else {
      chmodSync(current, 0o444);
    }
  }
  for (const directory of directories.reverse()) chmodSync(directory, 0o555);
}

function unlockTree(root: string): void {
  if (!statSync(root, { throwIfNoEntry: false })) return;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) continue;
    chmodSync(current, stat.isDirectory() ? 0o755 : 0o644);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(current)) stack.push(join(current, entry));
    }
  }
}

/**
 * The newest release tag this repository can actually replay as a previous
 * source tree.
 *
 * WHAT WAS WRONG. This was the literal `vcskill@0.7.0`, annotated "real // brand-drift-allow: quoting the removed literal is the point of this note
 * pre-rename tag in this repository". It was neither real nor replayable:
 *
 *   - No such tag has ever existed. The pre-rename tags stop at 0.5.0, so git
 *     could not resolve the ref, fell back to reading it as a pathspec, and the
 *     suite died on `fatal: --detach does not take a path argument` — a message
 *     naming neither the tag nor the cause.
 *   - Pinning to that era was itself the mistake, not just the number. Measured
 *     against every pre-rename tag that does exist: 0.2.0, 0.3.0 and 0.4.0 all
 *     fail the historical projection adapter, and 0.5.0 is mis-tagged (the tag
 *     says 0.5.0, its `packages/cli/package.json` says 0.4.0) so it trips the
 *     generator's own tag/version check. There is no pre-rename tree this test
 *     can replay, and there has not been since the rename.
 *
 * It went unnoticed because CI is two-tiered — a pull request into `dev` runs
 * the unit gate, pushes to dev/main run the full gate, and a change touching no
 * code skips both. The first code PR to reach the unit tier found it at once.
 *
 * WHAT IT DOES NOW. Takes the newest tag whose recorded version agrees with its
 * own name, which today is the latest `ariadnev@*` release and every post-rename
 * tag replays cleanly. This is also the more faithful fixture: the "previous
 * stable" a docs bundle points at is the last release, not a relic from before
 * a rename. Resolving rather than hardcoding means a deleted, mis-tagged, or
 * newly cut release moves the answer instead of breaking the suite.
 */
export function highestReplayableReleaseTag(cwd: string): string {
  const tags = execFileSync("git", ["tag", "--list", "ariadnev@*", "vcskill@*"], { cwd, encoding: "utf8" }) // brand-drift-allow: the pre-rename tag namespace is this repository's own frozen history
    .split("\n")
    .map((tag) => tag.trim())
    // Pre-releases are not a "previous stable" and their trees are transient.
    .filter((tag) => tag.length > 0 && !tag.includes("-"))
    .sort((a, b) => collateVersion(a) - collateVersion(b))
    .reverse();

  const skipped: string[] = [];
  for (const tag of tags) {
    if (versionAt(cwd, tag) === tag.split("@").at(-1)) return tag;
    skipped.push(tag);
  }
  // Named here rather than left to git's pathspec message or the generator's
  // drift error. A shallow clone is the likely cause; both CI tiers set
  // fetch-depth: 0 for this test and say why.
  throw new Error(
    "no replayable release tag (this test needs full history and tags, fetch-depth: 0). " +
      `Skipped for tag/version drift: ${skipped.join(", ") || "none found"}`,
  );
}

/** The `packages/cli/package.json` version recorded at a tag, or null. */
function versionAt(cwd: string, tag: string): string | null {
  try {
    const pkg = execFileSync("git", ["show", `${tag}:packages/cli/package.json`], { cwd, encoding: "utf8" });
    const version = (JSON.parse(pkg) as { version?: string }).version;
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

/** Sort `name@1.2.3` by numeric version, so 0.10.0 outranks 0.9.0. */
function collateVersion(tag: string): number {
  const [major = 0, minor = 0, patch = 0] = (tag.split("@").at(-1) ?? "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  return major * 1_000_000 + minor * 1_000 + patch;
}
