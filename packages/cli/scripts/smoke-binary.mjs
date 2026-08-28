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
export function checkSmokeOutput({ versionOut, validateOut, runHelpOut, graphValidateOut, doctorOut, expectedVersion, buildRoot }) {
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

  // Positive signal, not the absence of a complaint. The binary is cross-compiled
  // to five targets from one Bun build, and `av update` refuses everything both
  // when the release key is unset and when the runtime has no Ed25519 at all —
  // so the release gate has to see the capability asserted, not infer it from
  // silence. `doctor` prints this with or without a receipt.
  if (!/ed25519: available/.test(doctorOut ?? "")) {
    failures.push("doctor did not report ed25519 as available — release signatures cannot be verified here");
  }

  // The storage substrate, on the target that actually ships. Bun bundles its
  // own SQLite on Linux and Windows and uses the system one on macOS, and FTS5
  // is a compile-time option rather than a guarantee — so a probe that passed on
  // a developer's Mac says nothing about the artifact most users download. This
  // rides the `doctor` invocation above rather than spawning again: the release
  // gate is not the place to spend a process proving something already printed.
  if (!/sqlite: available \([a-z]+, fts5, wal\)/.test(doctorOut ?? "")) {
    failures.push("doctor did not report sqlite with fts5 and wal — the operational data plane cannot be built on this target");
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
  const outputs = [versionOut, validateOut, runHelpOut, graphValidateOut, doctorOut ?? ""];
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

/** Same, but a non-zero exit is an answer rather than a failure. */
function runAllowingFailure(bin, args) {
  try {
    return run(bin, args);
  } catch (err) {
    return `${err.stdout ?? ""}${err.stderr ?? ""}`;
  }
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
  const binArg = process.argv[2] ?? (asset && join(releaseDir, asset));
  if (!binArg) {
    console.error(`smoke: no binary for this host (${process.platform}/${process.arch}) — pass a path`);
    process.exit(1);
  }
  // execFileSync spawns with `cwd: scratch`. On POSIX a bin path containing a
  // slash is resolved relative to the child's cwd (execvp), so a relative arg
  // like `candidate/ariadnev-darwin-arm64` breaks the moment cwd changes.
  // Absolute-resolve at the boundary so smoke works from any invocation cwd.
  const bin = resolve(binArg);

  const expectedVersion = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).version;

  let versionOut = "";
  let validateOut = "";
  let runHelpOut = "";
  let graphValidateOut = "";
  let doctorOut = "";
  try {
    versionOut = run(bin, ["--version"]);
    validateOut = run(bin, ["validate"]);
    runHelpOut = run(bin, ["run", "--help"]);
    graphValidateOut = run(bin, ["run", "read-only-delivery", "--validate", "--json"]);
    // Exits 2 with no receipt, which is the normal state on a CI runner, so the
    // output is what matters rather than the code.
    doctorOut = runAllowingFailure(bin, ["doctor"]);
  } catch (err) {
    console.error(`smoke: binary failed to execute: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const { ok, failures } = checkSmokeOutput({
    versionOut, validateOut, runHelpOut, graphValidateOut, doctorOut, expectedVersion,
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
  // silence here would read as a pass. Look next to the bin the caller pointed
  // at (`candidate/` from the release matrix; `dist/release/` locally), not a
  // fixed releaseDir — the two disagree in the cross-platform smoke job.
  const siblingDir = dirname(bin);
  const headerFailures = [];
  for (const { asset: name } of TARGETS) {
    if (name === asset) continue;
    const path = join(siblingDir, name);
    let size;
    try {
      size = statSync(path).size;
    } catch {
      headerFailures.push(`${name} is missing from ${siblingDir}`);
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
