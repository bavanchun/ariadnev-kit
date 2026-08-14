const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const hookPath = path.join(__dirname, "..", "hook.cjs");
const { buildMatcher, evaluateScout } = require(hookPath);

const ig = buildMatcher("");

function runHook(input, env = {}) {
  return spawnSync(process.execPath, [hookPath], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

test("bash: search/read of generated dirs denied, build commands allowed", () => {
  assert.equal(evaluateScout("Bash", { command: "grep -r foo node_modules" }, ig).decision, "deny");
  assert.equal(evaluateScout("Bash", { command: "cat build/output.txt" }, ig).decision, "deny");
  assert.equal(evaluateScout("Bash", { command: "ls dist" }, ig).decision, "deny");
  assert.equal(evaluateScout("Bash", { command: "pnpm install" }, ig).decision, "allow");
  assert.equal(evaluateScout("Bash", { command: "npm run build" }, ig).decision, "allow");
  assert.equal(evaluateScout("Bash", { command: "cargo build" }, ig).decision, "allow");
  assert.equal(evaluateScout("Bash", { command: "grep -r foo src" }, ig).decision, "allow");
});

test("read/glob/grep targets inside ignored dirs are denied", () => {
  assert.equal(evaluateScout("Read", { file_path: "node_modules/pkg/index.js" }, ig).decision, "deny");
  assert.equal(evaluateScout("Read", { file_path: "/abs/proj/node_modules/pkg/i.js" }, ig).decision, "deny");
  assert.equal(evaluateScout("Read", { file_path: "src/index.ts" }, ig).decision, "allow");
  assert.equal(evaluateScout("Glob", { pattern: "dist/**" }, ig).decision, "deny");
  assert.equal(evaluateScout("Glob", { pattern: "src/**/*.ts" }, ig).decision, "allow");
  assert.equal(evaluateScout("Grep", { pattern: "foo", path: "coverage" }, ig).decision, "deny");
});

test(".vcignore negation re-allows a default-blocked dir", () => {
  const custom = buildMatcher("!dist/\nsecret-cache/\n");
  assert.equal(evaluateScout("Read", { file_path: "dist/bundle.js" }, custom).decision, "allow");
  assert.equal(evaluateScout("Read", { file_path: "secret-cache/x" }, custom).decision, "deny");
  assert.equal(evaluateScout("Read", { file_path: "node_modules/x" }, custom).decision, "deny");
});

test("deny exits 2 with a .vcignore hint; allow exits 0", () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), "av-sb-"));
  const deny = runHook({
    cwd: proj,
    tool_name: "Read",
    tool_input: { file_path: "node_modules/pkg/index.js" },
  });
  assert.equal(deny.status, 2);
  assert.match(deny.stderr, /\.vcignore/);
  const allow = runHook({ cwd: proj, tool_name: "Read", tool_input: { file_path: "src/a.ts" } });
  assert.equal(allow.status, 0);
  fs.rmSync(proj, { recursive: true, force: true });
});

test("project .vcignore is honored by the hook process", () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), "av-sb2-"));
  fs.writeFileSync(path.join(proj, ".vcignore"), "!dist/\n");
  const res = runHook({ cwd: proj, tool_name: "Read", tool_input: { file_path: "dist/bundle.js" } });
  assert.equal(res.status, 0);
  fs.rmSync(proj, { recursive: true, force: true });
});

test("fail-open: malformed stdin exits 0", () => {
  assert.equal(runHook("]]]").status, 0);
});
