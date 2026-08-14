const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { detectProject } = require("../project-detect.cjs");

function tmpProject(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "av-proj-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
}

test("detects pnpm node project with framework and git branch", () => {
  const root = tmpProject({
    "package.json": JSON.stringify({ dependencies: { next: "15.0.0" } }),
    "pnpm-lock.yaml": "",
    ".git/HEAD": "ref: refs/heads/feat/hooks\n",
  });
  const p = detectProject(root);
  assert.equal(p.type, "node");
  assert.equal(p.packageManager, "pnpm");
  assert.equal(p.framework, "next");
  assert.equal(p.branch, "feat/hooks");
  fs.rmSync(root, { recursive: true, force: true });
});

test("detects go and rust projects", () => {
  const go = tmpProject({ "go.mod": "module x" });
  assert.equal(detectProject(go).type, "go");
  const rust = tmpProject({ "Cargo.toml": "[package]" });
  assert.equal(detectProject(rust).type, "rust");
  fs.rmSync(go, { recursive: true, force: true });
  fs.rmSync(rust, { recursive: true, force: true });
});

test("unknown project returns safe defaults, never throws", () => {
  const root = tmpProject({});
  const p = detectProject(root);
  assert.equal(p.type, "unknown");
  assert.equal(p.branch, null);
  assert.doesNotThrow(() => detectProject("/nonexistent/dir"));
  fs.rmSync(root, { recursive: true, force: true });
});
