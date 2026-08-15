import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// The generator is the first of four hops between a kit asset and the user's
// disk. It runs against the real repo, so these tests drive it over a synthetic
// tree instead, by pointing it at a fake repo root.

const scriptDir = dirname(fileURLToPath(import.meta.url));
const generator = join(scriptDir, "generate-embedded-kit.mjs");
const repoRoot = join(scriptDir, "..", "..", "..");

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0xc0, 0x80]);

/**
 * Build a throwaway repo whose layout matches what the generator expects, run
 * the generator inside it, and return the parsed asset map.
 */
function runGenerator(build) {
  const root = mkdtempSync(join(tmpdir(), "ariadnev-gen-"));
  const pkgDir = join(root, "packages", "cli");
  mkdirSync(join(pkgDir, "src", "kit"), { recursive: true });
  mkdirSync(join(pkgDir, "scripts"), { recursive: true });
  mkdirSync(join(root, "kit"), { recursive: true });
  writeFileSync(join(pkgDir, "package.json"), JSON.stringify({ name: "ariadnev", version: "9.9.9" }));
  writeFileSync(join(root, "portable-manifest.json"), "{}\n");
  writeFileSync(join(root, "kit.config.json"), "{}\n");

  // The generator imports install-types from src; symlink the real source in so
  // the fixture exercises the same ignore list production uses.
  symlinkSync(join(repoRoot, "packages", "cli", "src", "install"), join(pkgDir, "src", "install"));
  writeFileSync(join(pkgDir, "scripts", "generate-embedded-kit.mjs"), readFileSync(generator));

  build(join(root, "kit"));
  // bun, matching how build-binaries invokes it. Running this under node would
  // pass on a node new enough to strip types and hide that the release runner's
  // node is not — which is exactly how this reached CI.
  execFileSync("bun", [join(pkgDir, "scripts", "generate-embedded-kit.mjs")], { stdio: "pipe" });

  const generated = readFileSync(join(pkgDir, "src", "kit", "kit-embedded.generated.ts"), "utf8");
  const body = generated.slice(generated.indexOf("EMBEDDED_ASSETS: Record<string, EmbeddedAsset> = "));
  // The emitted object literal ends with a trailing comma, which JSON rejects.
  const literal = body.slice(body.indexOf("{"), body.lastIndexOf("};") + 1).replace(/,(\s*})/g, "$1");
  const digest = /EMBEDDED_DIGEST = "([a-f0-9]+)"/.exec(generated)[1];
  return { assets: JSON.parse(literal), digest, root };
}

test("binary assets round-trip through the embed as exact bytes", () => {
  const { assets, root } = runGenerator((kit) => {
    mkdirSync(join(kit, "skills", "demo", "assets"), { recursive: true });
    writeFileSync(join(kit, "skills", "demo", "assets", "logo.png"), PNG_BYTES);
    writeFileSync(join(kit, "skills", "demo", "SKILL.md"), "# Demo\n");
  });
  try {
    const asset = assets["kit/skills/demo/assets/logo.png"];
    assert.equal(asset.text, undefined, "a PNG must not be embedded as text");
    assert.deepEqual(Buffer.from(asset.b64, "base64"), PNG_BYTES);
    assert.equal(assets["kit/skills/demo/SKILL.md"].text, "# Demo\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("symlinks are never followed into the embed", () => {
  const outside = mkdtempSync(join(tmpdir(), "ariadnev-outside-"));
  writeFileSync(join(outside, "secret.md"), "not ours\n");
  const { assets, root } = runGenerator((kit) => {
    mkdirSync(join(kit, "skills", "demo"), { recursive: true });
    writeFileSync(join(kit, "skills", "demo", "SKILL.md"), "# Demo\n");
    symlinkSync(join(outside, "secret.md"), join(kit, "skills", "demo", "linked.md"));
  });
  try {
    assert.deepEqual(
      Object.keys(assets).filter((k) => k.includes("linked")),
      [],
      "a symlink must not pull a file from outside the kit into the binary",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("ignored trees and credential material stay out", () => {
  const { assets, root } = runGenerator((kit) => {
    mkdirSync(join(kit, "skills", "demo", "node_modules"), { recursive: true });
    mkdirSync(join(kit, "skills", "demo", "__tests__"), { recursive: true });
    writeFileSync(join(kit, "skills", "demo", "SKILL.md"), "# Demo\n");
    writeFileSync(join(kit, "skills", "demo", "node_modules", "junk.js"), "junk\n");
    writeFileSync(join(kit, "skills", "demo", "__tests__", "spec.js"), "junk\n");
    writeFileSync(join(kit, "skills", "demo", ".env"), "TOKEN=real\n");
    writeFileSync(join(kit, "skills", "demo", ".env.example"), "TOKEN=\n");
    writeFileSync(join(kit, "skills", "demo", "server.pem"), "KEY\n");
    writeFileSync(join(kit, "skills", "demo", "id_rsa"), "KEY\n");
  });
  try {
    const keys = Object.keys(assets);
    assert.deepEqual(keys.filter((k) => /node_modules|__tests__|\.env$|\.pem$|id_rsa/.test(k)), []);
    assert.ok(keys.includes("kit/skills/demo/.env.example"), "the env template still ships");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the executable bit is recorded, and only as 0755", () => {
  const { assets, root } = runGenerator((kit) => {
    mkdirSync(join(kit, "skills", "demo", "scripts"), { recursive: true });
    writeFileSync(join(kit, "skills", "demo", "SKILL.md"), "# Demo\n");
    const script = join(kit, "skills", "demo", "scripts", "run.sh");
    writeFileSync(script, "#!/bin/sh\necho hi\n");
    chmodSync(script, 0o700);
    const plain = join(kit, "skills", "demo", "scripts", "data.txt");
    writeFileSync(plain, "data\n");
    chmodSync(plain, 0o600);
  });
  try {
    assert.equal(assets["kit/skills/demo/scripts/run.sh"].mode, 0o755, "0700 source ships as 0755");
    assert.equal(assets["kit/skills/demo/scripts/data.txt"].mode, undefined, "non-executables carry no mode");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the digest tracks content, not the version", () => {
  const build = (content) => (kit) => {
    mkdirSync(join(kit, "skills", "demo"), { recursive: true });
    writeFileSync(join(kit, "skills", "demo", "SKILL.md"), content);
  };
  const first = runGenerator(build("# One\n"));
  const same = runGenerator(build("# One\n"));
  const other = runGenerator(build("# Two\n"));
  try {
    assert.equal(first.digest, same.digest, "identical content must produce an identical digest");
    assert.notEqual(first.digest, other.digest, "a kit edit must change the digest");
  } finally {
    for (const r of [first.root, same.root, other.root]) rmSync(r, { recursive: true, force: true });
  }
});
