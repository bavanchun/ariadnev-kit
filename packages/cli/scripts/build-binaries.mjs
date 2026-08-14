import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TARGETS } from "./binary-targets.mjs";
import { validateReleaseOutputDirectory } from "./release-output-directory.mjs";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const pkgDir = join(scriptDir, "..");
const DOCS_ASSETS = ["docs-bundle.tar.gz", "docs-bundle.manifest.json", "docs-bundle-manifest-v1.schema.json"];

function arg(name, fallback) {
  const matches = process.argv.flatMap((value, index) => value === name ? [index] : []);
  if (matches.length > 1) throw new Error(`duplicate argument: ${name}`);
  if (matches.length === 0) return fallback;
  const value = process.argv[matches[0] + 1];
  if (!value || value.startsWith("--")) throw new Error(`missing value for ${name}`);
  return value;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
const version = pkg.version;
const only = arg("--only");
const defaultOutDir = join(pkgDir, "dist", "release");
const outDir = validateReleaseOutputDirectory(arg("--output-dir", defaultOutDir), defaultOutDir);
const sourceSha = arg("--source-sha");
const generatedAt = arg("--generated-at");
const sourceDateEpoch = arg("--source-date-epoch");
const releaseTag = arg("--release-tag", `ariadnev@${version}`);
const finalConsumerLock = arg("--final-consumer-lock");
const finalConsumerLockDigest = arg("--final-consumer-lock-digest");
const previousSourceTreeValue = arg("--previous-source-tree");
const previousSourceTag = arg("--previous-source-tag");
const previousSourceSha = arg("--previous-source-sha");

if (!sourceSha || !generatedAt || !sourceDateEpoch) {
  throw new Error("build-binaries requires --source-sha, --generated-at, and --source-date-epoch");
}
if (!finalConsumerLock || !finalConsumerLockDigest) throw new Error("build-binaries requires the final consumer lock and its preflight digest");
if (!previousSourceTreeValue || !previousSourceTag || !previousSourceSha) throw new Error("build-binaries requires the immediate previous stable source");
const previousSourceTree = resolve(previousSourceTreeValue);
if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error("source SHA must be a full lowercase commit SHA");
// The predecessor may predate the rename, so its tag carries the old grammar.
// The release tag being produced below stays strict on the current one.
if (!/^(?:ariadnev|vcskill)@(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(previousSourceTag)) throw new Error("previous source tag must be stable"); // brand-drift-allow: accepts pre-rename release tags
if (!/^[a-f0-9]{40}$/.test(previousSourceSha)) throw new Error("previous source SHA must be a full lowercase commit SHA");
if (!Number.isSafeInteger(Number(sourceDateEpoch)) || Number(sourceDateEpoch) < 0) throw new Error("source date epoch must be a non-negative safe integer");
if (Number.isNaN(Date.parse(generatedAt))) throw new Error("generated-at must be an ISO date-time");
if (releaseTag !== `ariadnev@${version}`) throw new Error("release tag must match the package version");
if (!/^sha256:[a-f0-9]{64}$/.test(finalConsumerLockDigest)) throw new Error("final consumer lock digest must be SHA-256");
if (only && !TARGETS.some(({ asset }) => asset === only)) throw new Error(`unknown binary target: ${only}`);

execFileSync("node", [join(pkgDir, "scripts", "generate-embedded-kit.mjs")], { stdio: "inherit", cwd: pkgDir });
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

execFileSync("bun", [
  join(pkgDir, "scripts", "generate-docs-bundle.ts"),
  "--mode", "final",
  "--output-dir", outDir,
  "--source-sha", sourceSha,
  "--generated-at", generatedAt,
  "--source-date-epoch", sourceDateEpoch,
  "--release-tag", releaseTag,
  "--final-consumer-lock", finalConsumerLock,
  "--final-consumer-lock-digest", finalConsumerLockDigest,
  "--previous-source-tree", previousSourceTree,
  "--previous-source-tag", previousSourceTag,
  "--previous-source-sha", previousSourceSha,
], { stdio: "inherit", cwd: pkgDir });

const archivePath = join(outDir, "docs-bundle.tar.gz");
execFileSync("bun", [
  join(pkgDir, "scripts", "verify-docs-bundle-sidecars.ts"),
  archivePath,
  join(outDir, "docs-bundle.manifest.json"),
  join(outDir, "docs-bundle-manifest-v1.schema.json"),
], { stdio: "inherit", cwd: pkgDir });

const builtAssets = TARGETS.filter(({ asset }) => !only || asset === only).map(({ target, asset }) => ({ target, asset, path: join(outDir, asset) }));
const checksums = [];
for (const { target, path } of builtAssets) {
  execFileSync("bun", ["build", "--compile", "src/index.ts", "--target", target, "--outfile", relative(pkgDir, path)], { stdio: "inherit", cwd: pkgDir });
}
const assets = [...builtAssets.map(({ asset, path }) => ({ asset, path })), ...DOCS_ASSETS.map((asset) => ({ asset, path: join(outDir, asset) }))];
if (new Set(assets.map(({ asset }) => asset)).size !== assets.length) {
  throw new Error("release asset list contains duplicates");
}
for (const { asset, path } of assets) {
  checksums.push(`${sha256(path)}  ${asset}`);
}
writeFileSync(join(outDir, "checksums.txt"), `${checksums.join("\n")}\n`);
console.log(`\nariadnev@${version} — ${checksums.length - DOCS_ASSETS.length} binaries + docs bundle assets + checksums.txt in dist/release/`);
