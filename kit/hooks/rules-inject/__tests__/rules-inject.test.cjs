const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const hookPath = path.join(__dirname, "..", "hook.cjs");
const { buildRulesContext, computeScopeKey, shouldInject } = require(hookPath);

function runHook(input, env = {}) {
  return spawnSync(process.execPath, [hookPath], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

test("buildRulesContext concatenates rules and caps total size", () => {
  const out = buildRulesContext([
    { name: "a", content: "Rule A body" },
    { name: "b", content: "Rule B body" },
  ]);
  assert.match(out, /Rule A body/);
  assert.match(out, /Rule B body/);
  const huge = buildRulesContext([{ name: "big", content: "x".repeat(20000) }]);
  assert.ok(huge.length <= 8200, `context too large: ${huge.length}`);
});

test("computeScopeKey changes when rules change, stable otherwise", () => {
  const k1 = computeScopeKey("/proj", ["ruleA"]);
  const k2 = computeScopeKey("/proj", ["ruleA"]);
  const k3 = computeScopeKey("/proj", ["ruleA CHANGED"]);
  assert.equal(k1, k2);
  assert.notEqual(k1, k3);
});

test("shouldInject throttles repeats of the same session+key", () => {
  const now = 1_000_000;
  assert.equal(shouldInject({}, "s1", "k1", now), true);
  const state = { s1: { key: "k1", ts: now } };
  assert.equal(shouldInject(state, "s1", "k1", now + 1000), false);
  // key change (rules edited) re-injects
  assert.equal(shouldInject(state, "s1", "k2", now + 1000), true);
  // other session injects independently
  assert.equal(shouldInject(state, "s2", "k1", now + 1000), true);
});

test("hook injects project rules once per session, then stays silent", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "av-ri-home-"));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), "av-ri-proj-"));
  fs.mkdirSync(path.join(proj, ".claude", "rules"), { recursive: true });
  fs.writeFileSync(path.join(proj, ".claude", "rules", "dev.md"), "Always run tests first.");
  const env = { HOME: home, USERPROFILE: home };
  const input = { session_id: "sess-1", cwd: proj, prompt: "hello" };

  const first = runHook(input, env);
  assert.equal(first.status, 0);
  assert.match(first.stdout, /Always run tests first\./);

  const second = runHook(input, env);
  assert.equal(second.status, 0);
  assert.equal(second.stdout.trim(), "");

  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(proj, { recursive: true, force: true });
});

test("no rules dir: silent success", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "av-ri-home2-"));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), "av-ri-proj2-"));
  const res = runHook({ session_id: "s", cwd: proj, prompt: "x" }, { HOME: home, USERPROFILE: home });
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), "");
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(proj, { recursive: true, force: true });
});

test("fail-open: malformed stdin exits 0", () => {
  const res = runHook("nope{");
  assert.equal(res.status, 0);
});
