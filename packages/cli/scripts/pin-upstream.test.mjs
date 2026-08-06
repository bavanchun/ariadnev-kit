import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = join(dirname(fileURLToPath(import.meta.url)), "pin-upstream.ts");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "vcskill-pin-"));
  writeFileSync(
    join(root, "SKILL.md"),
    "---\nname: ak:fixture\nmetadata:\n  version: \"1.2.3\"\n---\n\nAgents MUST validate input.\n",
  );
  mkdirSync(join(root, "scripts"));
  writeFileSync(join(root, "scripts", "run.ts"), "export const value = 1;\n");
  mkdirSync(join(root, "workflows"));
  writeFileSync(join(root, "workflows", "release.yml"), "name: release\n");
  mkdirSync(join(root, "references"));
  writeFileSync(join(root, "references", "rules.md"), "Supporting detail.\n");
  mkdirSync(join(root, "tests"));
  writeFileSync(join(root, "tests", "pin.test.ts"), "export const tested = true;\n");
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "assets", "prompt.txt"), "prompt\n");
  writeFileSync(join(root, "config.json"), "{}\n");
  writeFileSync(join(root, "LICENSE"), "fixture license\n");
  return root;
}

function run(root) {
  return spawnSync("bun", [script, root], { encoding: "utf8" });
}

test("pin-upstream emits version, canonical digest, and extracted claims", () => {
  const root = fixture();
  try {
    const result = run(root);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.upstream, "ak:fixture");
    assert.equal(output.upstream_version, "1.2.3");
    assert.match(output.upstream_digest, /^sha256:[a-f0-9]{64}$/);
    assert.equal(output.claims[0].text, "agents must validate input.");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("excludes only volatile paths and hashes every authored file category", () => {
  const root = fixture();
  try {
    const before = JSON.parse(run(root).stdout).upstream_digest;
    for (const dir of [".git", "node_modules", "__pycache__", "dist", "build", "coverage"]) {
      mkdirSync(join(root, dir));
      writeFileSync(join(root, dir, "noise.txt"), "noise");
    }
    writeFileSync(join(root, "cache.pyc"), "noise");
    writeFileSync(join(root, ".DS_Store"), "noise");
    const excluded = JSON.parse(run(root).stdout).upstream_digest;
    assert.equal(excluded, before);

    let previous = excluded;
    for (const relativePath of [
      "references/rules.md",
      "scripts/run.ts",
      "workflows/release.yml",
      "tests/pin.test.ts",
      "assets/prompt.txt",
      "config.json",
      "LICENSE",
    ]) {
      writeFileSync(join(root, relativePath), `changed ${relativePath}\n`);
      const changed = JSON.parse(run(root).stdout).upstream_digest;
      assert.notEqual(changed, previous, relativePath);
      previous = changed;
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pin-upstream rejects symlinks", () => {
  const root = fixture();
  try {
    symlinkSync(join(root, "SKILL.md"), join(root, "linked.md"));
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /symlink is not allowed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pin-upstream rejects a symlink used as the source root", () => {
  const root = fixture();
  const linkedRoot = `${root}-link`;
  try {
    symlinkSync(root, linkedRoot);
    const result = run(linkedRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /symlink is not allowed/);
  } finally {
    rmSync(linkedRoot, { force: true });
    rmSync(root, { recursive: true, force: true });
  }
});
