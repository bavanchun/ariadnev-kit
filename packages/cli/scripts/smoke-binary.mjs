// Release smoke-test: run the freshly-compiled host binary and prove it actually
// works before it ships — guards the silent-break class (empty --version, kit
// that won't load, a build-machine path baked into output). Runtime-correctness
// only; sha256 is verified client-side by install.sh, not here.
//
// Usage: node smoke-binary.mjs [path-to-binary]
//   default path: dist/release/<hostAssetName()>

import { execFileSync } from "node:child_process";
import { mkdtempSync, openSync, readSync, closeSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hostAssetName, TARGETS, expectedHeader } from "./binary-targets.mjs";

/**
 * Pure assertion over what the binary printed. Returns { ok, failures[] } so it
 * is unit-testable without spawning anything.
 */
export function checkSmokeOutput({ versionOut, validateOut, runHelpOut, graphValidateOut, expectedVersion, buildRoot }) {
  const failures = [];

  if (versionOut.trim() !== expectedVersion.trim()) {
    failures.push(`--version printed "${versionOut.trim()}", expected "${expectedVersion.trim()}"`);
  }

  const counts = validateOut.match(/(\d+)\s+skills?,\s+(\d+)\s+agents?,\s+(\d+)\s+hooks?/);
  if (!counts) {
    failures.push("validate did not report kit counts — embedded kit failed to load");
  } else if (Number(counts[1]) === 0 || Number(counts[2]) === 0 || Number(counts[3]) === 0) {
    failures.push(`validate reported an empty kit count: ${counts[0]}`);
  }

  // Match validate's actual pass contract: it exits 0 with either "all checks
  // passed" (no findings) or "0 error(s)" (only non-failing warnings). Asserting
  // just the zero-findings string would break the release on a warn the validate
  // gate deliberately lets through.
  if (!/all checks passed|0 error\(s\)/.test(validateOut)) {
    failures.push("validate reported errors (expected a clean pass)");
  }

  for (const token of ["resume", "status", "cancel", "--runtime <provider>", "--validate", "--json"]) {
    if (!runHelpOut.includes(token)) failures.push(`run --help is missing ${token}`);
  }

  try {
    const graph = JSON.parse(graphValidateOut);
    if (graph.schemaVersion !== 1 || graph.action !== "validate" || graph.status !== "valid" || graph.ok !== true) {
      failures.push("packaged graph validation returned an incompatible envelope");
    }
    if (graph.workflow !== "read-only-delivery" || graph.graph?.id !== "read-only-delivery"
      || !Number.isInteger(graph.graph?.nodes) || graph.graph.nodes < 1
      || !Number.isInteger(graph.graph?.edges) || graph.graph.edges < 1) {
      failures.push("packaged canonical graph resources are missing or empty");
    }
  } catch {
    failures.push("packaged graph validation did not return JSON");
  }

  // A build-machine absolute path in output means a dev path was baked into the
  // binary instead of resolving at runtime. `/Users/` catches a macOS author's
  // machine; `buildRoot` catches the runner this actually runs on in CI, where
  // the path is `/home/runner/work/…` and the hardcoded pattern never fires.
  const outputs = [versionOut, validateOut, runHelpOut, graphValidateOut];
  if (outputs.some((output) => /\/Users\//.test(output))) {
    failures.push("output leaked an absolute dev path (/Users/…)");
  }
  if (buildRoot && outputs.some((output) => output.includes(buildRoot))) {
    failures.push(`output leaked the build root (${buildRoot})`);
  }

  return { ok: failures.length === 0, failures };
}

// Bun cross-compiles four assets this runner cannot execute. They still get
// checked for the failure classes that "exists and is non-empty" misses: a
// target that silently produced garbage, a truncated upload, and — the reason
// the architecture field is read rather than just the magic — a swapped pair.
const MIN_ASSET_BYTES = 10 * 1024 * 1024;

export function checkAssetHeader(asset, head, size) {
  const failures = [];
  const { magic, archOffset, archBytes, arch } = expectedHeader(asset);
  if (size < MIN_ASSET_BYTES) {
    failures.push(`${asset} is ${size} bytes, too small to contain the embedded kit`);
  }
  if (!head.subarray(0, magic.length).equals(Buffer.from(magic))) {
    failures.push(`${asset} does not start with the expected header for its format`);
  } else if (archBytes.length > 0
    && !head.subarray(archOffset, archOffset + archBytes.length).equals(Buffer.from(archBytes))) {
    failures.push(`${asset} was built for the wrong architecture (expected ${arch})`);
  }
  return { ok: failures.length === 0, failures };
}

// First run loads the embedded kit cold. The bound exists to catch a hang, not
// to measure speed — the same lesson the skill-env deep import taught at 30s.
const RUN_TIMEOUT_MS = 120000;

function run(bin, args) {
  const scratch = mkdtempSync(join(tmpdir(), "ariadnev-smoke-"));
  return execFileSync(bin, args, { cwd: scratch, encoding: "utf8", timeout: RUN_TIMEOUT_MS });
}

/** First bytes of a file, without reading the whole 100MB binary. */
function headBytes(path, length) {
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(length);
    return buffer.subarray(0, readSync(fd, buffer, 0, length, 0));
  } finally {
    closeSync(fd);
  }
}

// CLI entry — only when invoked directly, so the pure exports stay importable.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..");
  const releaseDir = join(pkgDir, "dist", "release");
  const asset = hostAssetName();
  const bin = process.argv[2] ?? (asset && join(releaseDir, asset));
  if (!bin) {
    console.error(`smoke: no binary for this host (${process.platform}/${process.arch}) — pass a path`);
    process.exit(1);
  }

  const expectedVersion = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).version;

  let versionOut = "";
  let validateOut = "";
  let runHelpOut = "";
  let graphValidateOut = "";
  try {
    versionOut = run(bin, ["--version"]);
    validateOut = run(bin, ["validate"]);
    runHelpOut = run(bin, ["run", "--help"]);
    graphValidateOut = run(bin, ["run", "read-only-delivery", "--validate", "--json"]);
  } catch (err) {
    console.error(`smoke: binary failed to execute: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const { ok, failures } = checkSmokeOutput({
    versionOut, validateOut, runHelpOut, graphValidateOut, expectedVersion,
    buildRoot: process.env.GITHUB_WORKSPACE ?? resolve(pkgDir, "..", ".."),
  });
  if (!ok) {
    console.error(`smoke FAILED for ${bin}:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`smoke OK: ${bin} (v${expectedVersion.trim()}, kit and graph lifecycle load, no leaked paths)`);

  // The other four assets are what most users download and this runner cannot
  // execute any of them. Say so explicitly, and check what can be checked —
  // silence here would read as a pass.
  const headerFailures = [];
  for (const { asset: name } of TARGETS) {
    if (name === asset) continue;
    const path = join(releaseDir, name);
    let size;
    try {
      size = statSync(path).size;
    } catch {
      headerFailures.push(`${name} is missing from ${releaseDir}`);
      continue;
    }
    const { magic, archOffset, archBytes } = expectedHeader(name);
    const head = headBytes(path, Math.max(magic.length, archOffset + archBytes.length));
    headerFailures.push(...checkAssetHeader(name, head, size).failures);
    console.log(`smoke: ${name} not executable on ${process.platform}/${process.arch} — header and size checked only`);
  }
  if (headerFailures.length > 0) {
    console.error("smoke FAILED on cross-compiled assets:");
    for (const f of headerFailures) console.error(`  - ${f}`);
    process.exit(1);
  }
}
