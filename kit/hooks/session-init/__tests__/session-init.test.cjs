const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const hookPath = path.join(__dirname, "..", "hook.cjs");
const { buildContext } = require(hookPath);

function runHook(input, env = {}) {
  return spawnSync(process.execPath, [hookPath], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

test("buildContext renders VC_* lines and omits unknown fields", () => {
  const out = buildContext({ type: "node", packageManager: "pnpm", framework: "next", branch: "main" });
  assert.match(out, /VC_PROJECT_TYPE=node/);
  assert.match(out, /VC_PACKAGE_MANAGER=pnpm/);
  assert.match(out, /VC_FRAMEWORK=next/);
  assert.match(out, /VC_GIT_BRANCH=main/);
  const sparse = buildContext({ type: "unknown", packageManager: null, framework: null, branch: null });
  assert.doesNotMatch(sparse, /VC_PACKAGE_MANAGER/);
});

test("hook detects a node project from stdin cwd and prints context", () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), "vc-si-"));
  fs.writeFileSync(path.join(proj, "package.json"), "{}");
  fs.writeFileSync(path.join(proj, "pnpm-lock.yaml"), "");
  const res = runHook({ session_id: "s1", cwd: proj, hook_event_name: "SessionStart" });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /VC_PROJECT_TYPE=node/);
  assert.match(res.stdout, /VC_PACKAGE_MANAGER=pnpm/);
  fs.rmSync(proj, { recursive: true, force: true });
});

test("fail-open: malformed stdin still exits 0", () => {
  const res = runHook("{definitely not json");
  assert.equal(res.status, 0);
});
