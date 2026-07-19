const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const libDir = path.join(__dirname, "..");

test("failOpen: a throwing hook body exits 0 and logs to JSONL", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vc-fo-"));
  const script = `
    const { failOpen } = require(${JSON.stringify(path.join(libDir, "fail-open.cjs"))});
    failOpen("test-hook", () => { throw new Error("internal boom"); });
    console.log("UNREACHABLE-ONLY-IF-NO-EXIT");
  `;
  const res = spawnSync(process.execPath, ["-e", script], {
    env: { ...process.env, HOME: home, USERPROFILE: home },
    encoding: "utf8",
  });
  assert.equal(res.status, 0);
  const log = path.join(home, ".claude", "logs", "vc-hooks.jsonl");
  assert.ok(fs.existsSync(log), "expected JSONL log file");
  assert.match(fs.readFileSync(log, "utf8"), /internal boom/);
  fs.rmSync(home, { recursive: true, force: true });
});

test("failOpen: a healthy body runs to completion without exiting", () => {
  const res = spawnSync(
    process.execPath,
    [
      "-e",
      `const { failOpen } = require(${JSON.stringify(path.join(libDir, "fail-open.cjs"))});
       failOpen("ok-hook", () => {});
       console.log("done");`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(res.status, 0);
  assert.match(res.stdout, /done/);
});

test("readStdinJson returns null on malformed input", () => {
  const res = spawnSync(
    process.execPath,
    [
      "-e",
      `const { readStdinJson } = require(${JSON.stringify(path.join(libDir, "fail-open.cjs"))});
       console.log(JSON.stringify(readStdinJson()));`,
    ],
    { input: "{not json", encoding: "utf8" },
  );
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), "null");
});
