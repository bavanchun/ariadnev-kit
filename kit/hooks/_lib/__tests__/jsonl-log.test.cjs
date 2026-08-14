const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { logJsonl } = require("../jsonl-log.cjs");

test("logJsonl appends parseable JSON lines with a timestamp", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "av-log-"));
  const file = path.join(root, "logs", "av-hooks.jsonl");
  logJsonl({ hook: "session-init", level: "error", message: "boom" }, file);
  logJsonl({ hook: "session-init", level: "error", message: "again" }, file);
  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  assert.equal(lines.length, 2);
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.hook, "session-init");
  assert.ok(entry.ts);
  fs.rmSync(root, { recursive: true, force: true });
});

test("logJsonl never throws even when the target is unwritable", () => {
  assert.doesNotThrow(() => logJsonl({ hook: "x" }, "/dev/null/impossible/file.jsonl"));
});
