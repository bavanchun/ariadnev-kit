const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { atomicWrite } = require("../atomic-write.cjs");

test("atomicWrite creates parent dirs and writes content", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vc-aw-"));
  const dest = path.join(root, "a", "b", "state.md");
  atomicWrite(dest, "hello");
  assert.equal(fs.readFileSync(dest, "utf8"), "hello");
  fs.rmSync(root, { recursive: true, force: true });
});

test("atomicWrite replaces an existing file and leaves no temp behind", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vc-aw-"));
  const dest = path.join(root, "state.md");
  atomicWrite(dest, "one");
  atomicWrite(dest, "two");
  assert.equal(fs.readFileSync(dest, "utf8"), "two");
  assert.deepEqual(fs.readdirSync(root), ["state.md"]);
  fs.rmSync(root, { recursive: true, force: true });
});
