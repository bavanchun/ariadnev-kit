import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildProgram } from "../src/index.js";
import { loadKit, resolveKitRoot } from "../src/kit/load-kit.js";
import { buildProviderMatrix } from "../src/providers/provider-matrix.js";
import { generateDocsBundle } from "../src/release/docs-bundle-generator.js";

function arg(name: string, fallback?: string): string | undefined {
  const matches = process.argv.flatMap((value, index) => value === name ? [index] : []);
  if (matches.length > 1) throw new Error(`duplicate argument: ${name}`);
  if (matches.length === 0) return fallback;
  const value = process.argv[matches[0]! + 1];
  if (!value || value.startsWith("--")) throw new Error(`missing value for ${name}`);
  return value;
}

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function sha256(value: string | Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function main(): Promise<void> {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const pkgDir = join(scriptDir, "..");
  const repoRoot = join(pkgDir, "..", "..");
  const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")) as { version: string };
  const modeValue = arg("--mode", "provisional") ?? "provisional";
  if (modeValue !== "final" && modeValue !== "provisional") throw new Error("mode must be final or provisional");
  const mode = modeValue;
  const sourceSha = arg("--source-sha") ?? git(["rev-parse", "HEAD"], repoRoot);
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error("source-sha must be a full lowercase SHA");
  const outputDir = arg("--output-dir", join(pkgDir, "dist", "release"))!;
  const version = arg("--version", pkg.version)!;
  const releaseTag = mode === "final" ? arg("--release-tag", `vcskill@${version}`)! : null;
  const generatedAt = arg("--generated-at") ?? git(["show", "-s", "--format=%cI", sourceSha], repoRoot);
  const sourceDateEpoch = Number(arg("--source-date-epoch") ?? git(["show", "-s", "--format=%ct", sourceSha], repoRoot));
  const generatorSha = arg("--generator-sha", sourceSha)!;
  const finalConsumerLockPath = arg("--final-consumer-lock");
  const finalConsumerLockDigest = arg("--final-consumer-lock-digest");
  const previousSourceTree = arg("--previous-source-tree");
  const previousSourceTag = arg("--previous-source-tag");
  const previousSourceSha = arg("--previous-source-sha");
  if (Boolean(finalConsumerLockPath) !== Boolean(finalConsumerLockDigest)) throw new Error("final consumer lock path and digest must be supplied together");
  const previousSourceParts = [previousSourceTree, previousSourceTag, previousSourceSha].filter(Boolean).length;
  if (previousSourceParts !== 0 && previousSourceParts !== 3) throw new Error("previous source tree, tag, and SHA must be supplied together");
  if (mode === "final" && previousSourceParts !== 3) throw new Error("final mode requires the immediate previous stable source");
  const changelog = readFileSync(join(pkgDir, "CHANGELOG.md"), "utf8");
  const result = await generateDocsBundle({
    mode,
    version,
    releaseTag,
    sourceSha,
    generatorSha,
    generatedAt,
    sourceDateEpoch,
    outputDir,
    workspaceRoot: repoRoot,
    cli: buildProgram(),
    kit: loadKit(resolveKitRoot(repoRoot)),
    providers: buildProviderMatrix(),
    proof: {
      schemaVersion: 1,
      boundary: "allowlist:v1",
      sourceDigests: { changelog: sha256(changelog) },
      claims: [
        { id: "bundle.allowlist", status: "pass", summary: "Only allowlisted public release facts are projected." },
        { id: "bundle.determinism", status: "pass", summary: "Bundle members derive from explicit immutable release inputs." },
      ],
      attestations: [],
    },
    changelog,
    finalConsumerLock: finalConsumerLockPath && finalConsumerLockDigest
      ? { lockPath: finalConsumerLockPath, digest: finalConsumerLockDigest as `sha256:${string}` }
      : undefined,
    previousSource: previousSourceTree && previousSourceTag && previousSourceSha
      ? { sourceTree: previousSourceTree, releaseTag: previousSourceTag, productSha: previousSourceSha, generatorSha }
      : undefined,
  });
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    archivePath: basename(result.archivePath),
    archiveDigest: result.archiveDigest,
    manifestPath: basename(result.manifestPath),
    manifestDigest: result.manifestDigest,
    schemaPath: basename(result.schemaPath),
    schemaDigest: result.schemaDigest,
    fileCount: result.fileCount,
    totalBytes: result.totalBytes,
  }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(String(error instanceof Error ? error.message : error));
  process.exit(1);
});
