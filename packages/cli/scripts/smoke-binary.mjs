// Release smoke-test: run the freshly-compiled host binary and prove it actually
// works before it ships — guards the silent-break class (empty --version, kit
// that won't load, a build-machine path baked into output). Runtime-correctness
// only; sha256 is verified client-side by install.sh, not here.
//
// Usage: node smoke-binary.mjs [path-to-binary]
//   default path: dist/release/<hostAssetName()>

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { hostAssetName } from "./binary-targets.mjs";

/**
 * Pure assertion over what the binary printed. Returns { ok, failures[] } so it
 * is unit-testable without spawning anything.
 */
export function checkSmokeOutput({ versionOut, validateOut, runHelpOut, graphValidateOut, expectedVersion }) {
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
  // binary instead of resolving at runtime.
  if ([versionOut, validateOut, runHelpOut, graphValidateOut].some((output) => /\/Users\//.test(output))) {
    failures.push("output leaked an absolute dev path (/Users/…)");
  }

  return { ok: failures.length === 0, failures };
}

function run(bin, args) {
  const scratch = mkdtempSync(join(tmpdir(), "ariadnev-smoke-"));
  return execFileSync(bin, args, { cwd: scratch, encoding: "utf8", timeout: 20000 });
}

// CLI entry — only when invoked directly, so the pure export stays importable.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..");
  const asset = hostAssetName();
  const bin = process.argv[2] ?? (asset && join(pkgDir, "dist", "release", asset));
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

  const { ok, failures } = checkSmokeOutput({ versionOut, validateOut, runHelpOut, graphValidateOut, expectedVersion });
  if (!ok) {
    console.error(`smoke FAILED for ${bin}:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`smoke OK: ${bin} (v${expectedVersion.trim()}, kit and graph lifecycle load, no leaked paths)`);
}
