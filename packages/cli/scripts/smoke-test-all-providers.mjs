#!/usr/bin/env node
// Smoke-test the PUBLISHED shape of vcskill: pack the tarball, install it into
// an isolated prefix (mimicking a clean machine), then run `install --dry-run`
// for every supported provider and assert the CLI exits 0 without crashing.
// Catches breakages that unit tests miss — missing kit/ in the tarball, bad
// shebang, runtime resolveKitRoot failures, provider regressions.

import { execSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const pkgDir = resolve(fileURLToPath(import.meta.url), "../..");
// Keep in sync with PROVIDER_IDS in src/providers/index.ts — a new provider must
// be added here too, or it won't be smoke-tested.
const PROVIDERS = ["claude-code", "codex", "cursor", "opencode", "antigravity", "generic"];

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf8", stdio: "pipe", ...opts });
}

console.log("→ Packing tarball (prepack runs build + bundles kit/LICENSE)...");
run("pnpm run prepack", { cwd: pkgDir, stdio: "inherit" });
run("pnpm pack", { cwd: pkgDir, stdio: "inherit" });
const tgz = readdirSync(pkgDir).filter((f) => f.endsWith(".tgz")).sort().at(-1);
const tgzPath = join(pkgDir, tgz);
console.log(`→ Tarball: ${tgzPath}`);

const root = mkdtempSync(join(tmpdir(), "vcskill-smoke-"));
const appDir = join(root, "app");
mkdirSync(appDir, { recursive: true });

console.log("→ Installing tarball into isolated prefix (clean-machine sim)...");
run(`npm install --prefix "${appDir}" "${tgzPath}"`, { stdio: "inherit" });
// bin entry of the installed package; calling it via node avoids PATH assumptions.
const installedBin = join(appDir, "node_modules", "vcskill", "dist", "index.js");

const results = [];
for (const provider of PROVIDERS) {
  const proj = join(root, `proj-${provider}`);
  mkdirSync(proj, { recursive: true });
  let ok = false;
  let detail = "";
  try {
    const out = run(
      `node "${installedBin}" install --provider ${provider} --dry-run --cwd "${proj}" --yes`,
    );
    // Exit 0 reached → no crash. Note whether anything was skipped (unverified cells).
    detail = /skip/i.test(out) ? "ran (some artifacts skipped: unverified)" : "ran (all artifacts planned)";
    ok = true;
  } catch (err) {
    detail = (err.stderr || err.stdout || err.message || "").toString().split("\n").slice(0, 3).join(" ");
    ok = false;
  }
  results.push({ provider, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${provider.padEnd(12)} ${detail}`);
}

rmSync(root, { recursive: true, force: true });

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.error(`\n✗ Smoke-test FAILED for: ${failed.map((r) => r.provider).join(", ")}`);
  process.exit(1);
}
console.log(`\n✓ All ${PROVIDERS.length} providers passed install --dry-run on the packed tarball`);
