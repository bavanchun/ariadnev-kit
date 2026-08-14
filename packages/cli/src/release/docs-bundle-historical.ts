import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { PreviousSourceOptions } from "./docs-bundle-types.js";

const SHA40 = /^[a-f0-9]{40}$/;
const STABLE_TAG = /^vcskill@(\d+\.\d+\.\d+)$/;

function assertSha(value: string, label: string): void {
  if (!SHA40.test(value)) throw new Error(`${label} must be a full lowercase SHA`);
}

function git(sourceTree: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: sourceTree,
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function validateHistoricalIdentity(previous: PreviousSourceOptions, sourceTree: string): void {
  const tag = STABLE_TAG.exec(previous.releaseTag);
  if (!tag) throw new Error("previousSource.releaseTag must be a stable vcskill tag");
  const head = git(sourceTree, ["rev-parse", "HEAD"]);
  const tagCommit = git(sourceTree, ["rev-parse", `${previous.releaseTag}^{commit}`]);
  if (head !== previous.productSha) throw new Error(`previousSource product SHA drift: expected ${previous.productSha}, got ${head}`);
  if (tagCommit !== previous.productSha) throw new Error(`previousSource tag drift: ${previous.releaseTag}`);
  if (git(sourceTree, ["status", "--porcelain"]) !== "") throw new Error("previousSource tree must be clean");
  let attached = true;
  try {
    git(sourceTree, ["symbolic-ref", "-q", "HEAD"]);
  } catch {
    attached = false;
  }
  if (attached) throw new Error("previousSource tree must be detached at the stable tag");
  const pkg = JSON.parse(readFileSync(join(sourceTree, "packages", "cli", "package.json"), "utf8")) as { version?: unknown };
  if (pkg.version !== tag[1]) throw new Error(`previousSource tag/version drift: ${previous.releaseTag}`);
}

function adapterEnv(workspaceRoot: string, scratchDir: string): NodeJS.ProcessEnv {
  const carry = ["PATH", "SystemRoot", "ComSpec", "PATHEXT", "WINDIR", "TMPDIR", "TEMP", "TMP"];
  const env = Object.fromEntries(carry.flatMap((key) => process.env[key] ? [[key, process.env[key]!]] : []));
  return {
    ...env,
    HOME: scratchDir,
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    NODE_PATH: join(workspaceRoot, "packages", "cli", "node_modules"),
    NO_COLOR: "1",
    TZ: "UTC",
  };
}

function historicalScript(): string {
  return [
    "import { pathToFileURL } from 'node:url';",
    "import { existsSync } from 'node:fs';",
    "const sourceTree = process.argv.at(-2);",
    "const workspaceRoot = process.argv.at(-1);",
    "const current = await import(pathToFileURL(`${workspaceRoot}/packages/cli/src/release/docs-bundle-projector.ts`).href);",
    "const { buildProgram } = await import(pathToFileURL(`${sourceTree}/packages/cli/src/index.ts`).href);",
    "const { loadKit, resolveKitRoot } = await import(pathToFileURL(`${sourceTree}/packages/cli/src/kit/load-kit.ts`).href);",
    "const { buildProviderMatrix } = await import(pathToFileURL(`${sourceTree}/packages/cli/src/providers/provider-matrix.ts`).href);",
    "const kitRoot = resolveKitRoot(sourceTree);",
    "const kit = loadKit(kitRoot);",
    "const workflowPath = `${sourceTree}/packages/cli/src/kit/load-workflows.ts`;",
    "const workflows = Array.isArray(kit.workflows) ? kit.workflows : existsSync(workflowPath) ? (await import(pathToFileURL(workflowPath).href)).loadWorkflows(kitRoot, Array.isArray(kit.skills) ? kit.skills : [], Array.isArray(kit.agents) ? kit.agents : []) : [];",
    "process.stdout.write(JSON.stringify({ cli: current.projectCli(buildProgram()), kit: current.projectKit({ ...kit, workflows }), providers: current.projectProviders(buildProviderMatrix()) }));",
  ].join("\n");
}

export function projectHistoricalSource(previous: PreviousSourceOptions, workspaceRoot: string): unknown {
  assertSha(previous.productSha, "previousSource.productSha");
  assertSha(previous.generatorSha, "previousSource.generatorSha");
  const sourceTree = resolve(previous.sourceTree);
  if (!existsSync(sourceTree)) throw new Error(`previous source tree not found: ${sourceTree}`);
  const sourceTreeStat = lstatSync(sourceTree);
  if (!sourceTreeStat.isDirectory() || sourceTreeStat.isSymbolicLink()) {
    throw new Error("previous source tree must be a real directory");
  }
  validateHistoricalIdentity(previous, sourceTree);
  const scratchDir = mkdtempSync(join(tmpdir(), "vcskill-history-adapter-"));
  try {
    try {
      return JSON.parse(execFileSync("bun", ["--eval", historicalScript(), sourceTree, workspaceRoot], {
        cwd: scratchDir,
        encoding: "utf8",
        env: adapterEnv(workspaceRoot, scratchDir),
        stdio: ["ignore", "pipe", "pipe"],
      }).trim()) as unknown;
    } catch {
      throw new Error("historical projection failed API compatibility or public allowlist validation");
    }
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
}
