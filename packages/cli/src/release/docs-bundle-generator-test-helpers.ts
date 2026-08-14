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
