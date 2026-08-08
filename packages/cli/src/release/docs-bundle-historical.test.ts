import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { buildProgram } from "../index.js";
import { loadKit, resolveKitRoot } from "../kit/load-kit.js";
import { buildProviderMatrix } from "../providers/provider-matrix.js";
import { cleanupTemps, createHistoricalFixture, makeTreeReadOnly, tempDir } from "./docs-bundle-generator-test-helpers.js";
import { generateDocsBundle, readArchiveMember } from "./docs-bundle-generator.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const generatedAt = "2026-08-08T00:00:00.000Z";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  }).trim();
}

function provisional(previousSource: { sourceTree: string; releaseTag: string; productSha: string; generatorSha: string }, outputDir: string) {
  return generateDocsBundle({
    mode: "provisional",
    version: "0.11.0",
    releaseTag: null,
    sourceSha: "f".repeat(40),
    generatorSha: "f".repeat(40),
    generatedAt,
    sourceDateEpoch: Date.parse(generatedAt) / 1000,
    outputDir,
    workspaceRoot: repoRoot,
    cli: buildProgram(),
    kit: loadKit(resolveKitRoot(repoRoot)),
    providers: buildProviderMatrix(),
    proof: { schemaVersion: 1, boundary: "allowlist:v1", sourceDigests: {}, claims: [], attestations: [] },
    changelog: "# Changelog\n\n## 0.11.0\nCandidate\n",
    previousSource,
  });
}

function initializeFixture(sourceTree: string, description: string) {
  createHistoricalFixture(sourceTree, description);
  git(sourceTree, ["init", "-b", "main"]);
  git(sourceTree, ["config", "user.email", "fixture@example.com"]);
  git(sourceTree, ["config", "user.name", "Fixture"]);
  git(sourceTree, ["add", "."]);
  git(sourceTree, ["commit", "-m", "fixture"]);
  git(sourceTree, ["tag", "vcskill@0.10.0"]);
  git(sourceTree, ["checkout", "--detach"]);
  return git(sourceTree, ["rev-parse", "HEAD"]);
}

afterEach(cleanupTemps);

describe("historical docs bundle projection", () => {
  it("executes the actual stable tag from a read-only detached source tree", async () => {
    const sourceTree = tempDir("vcskill-stable-source-");
    const version = JSON.parse(readFileSync(join(repoRoot, "packages", "cli", "package.json"), "utf8")).version as string;
    const previous = JSON.parse(execFileSync("node", [
      join(repoRoot, "packages", "cli", "scripts", "resolve-previous-stable.mjs"),
      "--version", version,
      "--repository-root", repoRoot,
    ], { encoding: "utf8" })) as { releaseTag: string; productSha: string };
    const releaseTag = previous.releaseTag;
    git(sourceTree, [
      "clone",
      "--quiet",
      "--depth=1",
      "--branch",
      releaseTag,
      pathToFileURL(repoRoot).href,
      ".",
    ]);
    const productSha = git(sourceTree, ["rev-parse", "HEAD"]);
    expect(productSha).toBe(previous.productSha);
    expect(git(sourceTree, ["rev-parse", `${releaseTag}^{commit}`])).toBe(previous.productSha);
    expect(git(sourceTree, ["status", "--porcelain"])).toBe("");
    makeTreeReadOnly(sourceTree);

    const result = await provisional(
      { sourceTree, releaseTag, productSha, generatorSha: "f".repeat(40) },
      tempDir("vcskill-stable-output-"),
    );
    const payload = JSON.parse(readArchiveMember(
      readFileSync(result.archivePath),
      "reference/previous-stable/bootstrap.json",
    ).toString("utf8"));
    expect(payload).toMatchObject({ releaseTag, productSha, generatorSha: "f".repeat(40) });
    expect(payload.historicalProjection.cli.commands.length).toBeGreaterThan(1);
    expect(payload.historicalProjection.kit.skills.length).toBeGreaterThan(1);
    expect(git(sourceTree, ["status", "--porcelain"])).toBe("");
    expect(() => readFileSync(join(sourceTree, "node_modules"))).toThrow();
  });

  it("rejects product/tag drift before executing historical code", async () => {
    const sourceTree = tempDir("vcskill-history-drift-");
    initializeFixture(sourceTree, "Safe fixture");
    await expect(provisional(
      { sourceTree, releaseTag: "vcskill@0.10.0", productSha: "f".repeat(40), generatorSha: "f".repeat(40) },
      tempDir("vcskill-history-drift-output-"),
    )).rejects.toThrow(/product sha/i);
  });

  it("rejects hostile tagged projections through the current allowlist boundary", async () => {
    const sourceTree = tempDir("vcskill-history-hostile-");
    const productSha = initializeFixture(sourceTree, `leaks ${repoRoot}`);
    await expect(provisional(
      { sourceTree, releaseTag: "vcskill@0.10.0", productSha, generatorSha: "f".repeat(40) },
      tempDir("vcskill-history-hostile-output-"),
    )).rejects.toThrow(/public allowlist validation/i);
  });
});
