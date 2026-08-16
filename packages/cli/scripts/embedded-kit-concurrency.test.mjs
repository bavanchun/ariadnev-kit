import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

// Two processes starting with a cold cache both extract the embedded kit.
// Whoever loses the rename must not damage the winner's tree — the failure this
// guards against is a half-written file that a later run happily reads.
//
// The race is driven through the built CLI so it exercises the real shipped
// path. CI builds before running tests; when dist is absent (a bare `pnpm test`
// in a fresh checkout) the test reports the skip rather than pretending to pass.

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cli = join(scriptDir, "..", "dist", "index.js");
const run = promisify(execFile);

/** Every file under `dir`, keyed by relative path, as bytes. */
function snapshot(dir, base = dir, acc = {}) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) snapshot(abs, base, acc);
    else acc[relative(base, abs)] = readFileSync(abs);
  }
  return acc;
}

function cacheEnv(cache) {
  return { ...process.env, ARIADNEV_CACHE_DIR: cache, ARIADNEV_EMBEDDED: "1", NO_COLOR: "1" };
}

/** The single stamped directory the CLI extracted into. */
function stampedRoot(cache) {
  const entries = readdirSync(cache).filter((e) => statSync(join(cache, e)).isDirectory());
  assert.equal(entries.length, 1, `expected exactly one cache dir, got ${entries.join(", ")}`);
  return join(cache, entries[0]);
}

test("concurrent cold-cache materialize leaves one intact tree", { skip: !existsSync(cli) && "dist not built" }, async () => {
  const cache = mkdtempSync(join(tmpdir(), "ariadnev-race-"));
  try {
    // Both launched before either finishes — this is the actual race.
    await Promise.all([
      run(process.execPath, [cli, "list"], { env: cacheEnv(cache) }),
      run(process.execPath, [cli, "list"], { env: cacheEnv(cache) }),
    ]);

    const root = stampedRoot(cache);
    const files = snapshot(root);
    assert.ok(Object.keys(files).length > 50, "the extracted tree looks truncated");
    assert.ok(existsSync(join(root, ".extracted")), "sentinel missing");

    // No staging directory may survive next to the published cache.
    assert.deepEqual(
      readdirSync(cache).filter((e) => e.includes("tmp")),
      [],
      "a staging dir was left behind",
    );

    // A third run must find the cache valid and change nothing.
    execFileSync(process.execPath, [cli, "list"], { env: cacheEnv(cache), stdio: "pipe" });
    assert.deepEqual(snapshot(root), files, "a later run rewrote the cache");
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});

test("a cache whose kit was removed under a live sentinel is rebuilt", { skip: !existsSync(cli) && "dist not built" }, () => {
  const cache = mkdtempSync(join(tmpdir(), "ariadnev-gut-"));
  try {
    execFileSync(process.execPath, [cli, "list"], { env: cacheEnv(cache), stdio: "pipe" });
    const root = stampedRoot(cache);
    const before = Object.keys(snapshot(root)).length;

    rmSync(join(root, "kit"), { recursive: true, force: true });
    // The sentinel still says "extracted"; without a real check the CLI would
    // hand back a kit root that is not there.
    execFileSync(process.execPath, [cli, "list"], { env: cacheEnv(cache), stdio: "pipe" });

    assert.ok(readdirSync(join(root, "kit")).includes("skills"), "skills/ was not restored");
    assert.equal(Object.keys(snapshot(root)).length, before);
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});

test("an embedded non-text asset reaches the provider tree byte-identical", { skip: !existsSync(cli) && "dist not built" }, async () => {
  // End-to-end over all four hops using the real binary path: generator →
  // embedded map → self-extract → install. `.env.example` is embedded as base64
  // (its extension is not in the text list), so it exercises the byte lane.
  const cache = mkdtempSync(join(tmpdir(), "ariadnev-e2e-"));
  const proj = mkdtempSync(join(tmpdir(), "ariadnev-proj-"));
  try {
    execFileSync(process.execPath, [cli, "install", "--provider", "claude-code", "--yes"], {
      cwd: proj,
      env: { ...cacheEnv(cache), HOME: join(proj, "home") },
      stdio: "pipe",
    });

    // Read the generated map as text: the file is TypeScript, and the Node
    // that CI runs cannot import `.ts` directly. Each asset is emitted on its
    // own line as `"<key>": {...}` so a line-anchored match is enough.
    const generated = readFileSync(
      join(dirname(cli), "..", "src", "kit", "kit-embedded.generated.ts"),
      "utf8",
    );
    const key = "kit/.env.example";
    const line = generated
      .split("\n")
      .map((l) => l.trimStart())
      .find((l) => l.startsWith(`${JSON.stringify(key)}: `));
    assert.ok(line, `${key} is not in the embedded map`);
    const embedded = JSON.parse(line.slice(line.indexOf(": ") + 2).replace(/,$/, ""));
    const expected = embedded.b64 !== undefined
      ? Buffer.from(embedded.b64, "base64")
      : Buffer.from(embedded.text, "utf8");

    assert.deepEqual(readFileSync(join(proj, ".claude", ".env.example")), expected);
  } finally {
    rmSync(cache, { recursive: true, force: true });
    rmSync(proj, { recursive: true, force: true });
  }
});
