const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const hookPath = path.join(__dirname, "..", "hook.cjs");
const { buildSubagentContext } = require(hookPath);

function runHook(input, env = {}) {
  return spawnSync(process.execPath, [hookPath], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

test("buildSubagentContext includes paths, naming pattern, and agent type", () => {
  const out = buildSubagentContext({ cwd: "/proj", agentType: "av-explore", branch: "main" });
  assert.match(out, /av-explore/);
  assert.match(out, /plans\/reports\//);
  assert.match(out, /main/);
});

test("buildSubagentContext omits branch line when unknown", () => {
  const out = buildSubagentContext({ cwd: "/proj", agentType: "av-planner", branch: null });
  assert.doesNotMatch(out, /branch: null/);
});

test("context stays within the ~200 token budget (char proxy)", () => {
  const out = buildSubagentContext({ cwd: "/proj", agentType: "av-reviewer", branch: "feat/x" });
  // ~4 chars/token heuristic used elsewhere in this repo's hooks.
  assert.ok(out.length <= 900, `context too large: ${out.length} chars`);
});

test("hook reads stdin payload (agent_type, cwd) and prints context", () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), "av-sub-"));
  fs.mkdirSync(path.join(proj, ".git"), { recursive: true });
  fs.writeFileSync(path.join(proj, ".git", "HEAD"), "ref: refs/heads/feat/hooks\n");
  const res = runHook({ session_id: "s1", cwd: proj, agent_type: "av-tester", agent_id: "a1" });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /av-tester/);
  assert.match(res.stdout, /feat\/hooks/);
  fs.rmSync(proj, { recursive: true, force: true });
});

test("missing agent_type falls back to 'unknown' without throwing", () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), "av-sub2-"));
  const res = runHook({ session_id: "s1", cwd: proj });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /unknown/);
  fs.rmSync(proj, { recursive: true, force: true });
});

test("fail-open: malformed stdin exits 0", () => {
  const res = runHook("{not json");
  assert.equal(res.status, 0);
});
