const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const hookPath = path.join(__dirname, "..", "hook.cjs");
const { buildStateMarkdown, cwdHash, pruneStateDir } = require(hookPath);

function runHook(input, env = {}) {
  return spawnSync(process.execPath, [hookPath], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

test("buildStateMarkdown includes session metadata", () => {
  const md = buildStateMarkdown(
    { session_id: "s1", cwd: "/proj", hook_event_name: "Stop" },
    { type: "node", packageManager: "pnpm", framework: null, branch: "main" },
    new Date("2026-07-20T00:00:00Z"),
  );
  assert.match(md, /s1/);
  assert.match(md, /\/proj/);
  assert.match(md, /main/);
  assert.match(md, /2026-07-20/);
});

test("cwdHash is stable and filesystem-safe", () => {
  assert.equal(cwdHash("/a/b"), cwdHash("/a/b"));
  assert.notEqual(cwdHash("/a/b"), cwdHash("/a/c"));
  assert.match(cwdHash("/a/b"), /^[a-f0-9]{16}$/);
});

test("hook persists latest.md and archives the previous state", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vc-ss-"));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), "vc-ss-proj-"));
  const env = { HOME: home, USERPROFILE: home };
  const input = { session_id: "sess-a", cwd: proj, hook_event_name: "Stop" };

  assert.equal(runHook(input, env).status, 0);
  const stateDir = path.join(home, ".claude", "session-states", cwdHash(proj));
  assert.ok(fs.existsSync(path.join(stateDir, "latest.md")));

  assert.equal(runHook({ ...input, session_id: "sess-b" }, env).status, 0);
  const files = fs.readdirSync(stateDir);
  assert.ok(files.includes("latest.md"));
  assert.equal(files.filter((f) => f.startsWith("archive-")).length, 1);
  assert.match(fs.readFileSync(path.join(stateDir, "latest.md"), "utf8"), /sess-b/);

  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(proj, { recursive: true, force: true });
});

test("pruneStateDir keeps at most 5 archives and drops expired files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-ss-prune-"));
  const now = Date.now();
  for (let i = 0; i < 8; i++) {
    const f = path.join(dir, `archive-2026071${i}-000000.md`);
    fs.writeFileSync(f, `state ${i}`);
  }
  // one archive far past the 7-day TTL
  const old = path.join(dir, "archive-20250101-000000.md");
  fs.writeFileSync(old, "ancient");
  const oldTime = new Date(now - 30 * 24 * 3600 * 1000);
  fs.utimesSync(old, oldTime, oldTime);

  pruneStateDir(dir, now);
  const left = fs.readdirSync(dir).filter((f) => f.startsWith("archive-"));
  assert.ok(left.length <= 5, `expected <=5 archives, got ${left.length}`);
  assert.ok(!left.includes("archive-20250101-000000.md"));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("fail-open: malformed stdin exits 0", () => {
  assert.equal(runHook("%%%").status, 0);
});
