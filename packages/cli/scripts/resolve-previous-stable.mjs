import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const STABLE_VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const FULL_SHA = /^[a-f0-9]{40}$/;

function parseVersion(value, label) {
  const match = STABLE_VERSION.exec(value);
  if (!match) throw new Error(`${label} must be a stable semantic version`);
  const parts = match.slice(1).map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error(`${label} exceeds safe integer bounds`);
  return parts;
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function git(repositoryRoot, args) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

// Release history did not restart at the rename: the newest releases carry the
// current prefix, everything before them the old one. Ordered by preference, so
// a version tagged under both spellings resolves to the current grammar.
const TAG_PREFIXES = ["ariadnev@", "vcskill@"]; // brand-drift-allow: reads pre-rename release tags

export function resolvePreviousStable({ repositoryRoot, currentVersion }) {
  const current = parseVersion(currentVersion, "current version");
  const candidates = TAG_PREFIXES.flatMap((prefix, prefixRank) =>
    git(repositoryRoot, ["tag", "--list", `${prefix}*`])
      .split("\n")
      .filter(Boolean)
      .flatMap((releaseTag) => {
        const version = releaseTag.startsWith(prefix) ? releaseTag.slice(prefix.length) : "";
        try {
          const parts = parseVersion(version, "release tag");
          return compareVersions(parts, current) < 0 ? [{ releaseTag, version, parts, prefixRank }] : [];
        } catch {
          return [];
        }
      }),
  ).sort((left, right) => compareVersions(right.parts, left.parts) || left.prefixRank - right.prefixRank);
  const previous = candidates[0];
  if (!previous) throw new Error(`no previous stable release exists before ariadnev@${currentVersion}`);
  const productSha = git(repositoryRoot, ["rev-parse", `${previous.releaseTag}^{commit}`]);
  if (!FULL_SHA.test(productSha)) throw new Error("previous stable tag did not resolve to a full commit SHA");
  const pkg = JSON.parse(git(repositoryRoot, ["show", `${productSha}:packages/cli/package.json`]));
  if (pkg.version !== previous.version) throw new Error(`previous stable tag/version drift: ${previous.releaseTag}`);
  return { schemaVersion: 1, releaseTag: previous.releaseTag, productSha };
}

function arg(name, fallback) {
  const matches = process.argv.flatMap((value, index) => value === name ? [index] : []);
  if (matches.length > 1) throw new Error(`duplicate argument: ${name}`);
  if (matches.length === 0) return fallback;
  const value = process.argv[matches[0] + 1];
  if (!value || value.startsWith("--")) throw new Error(`missing value for ${name}`);
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const currentVersion = arg("--version");
    if (!currentVersion) throw new Error("--version is required");
    const result = resolvePreviousStable({ repositoryRoot: arg("--repository-root", process.cwd()), currentVersion });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
