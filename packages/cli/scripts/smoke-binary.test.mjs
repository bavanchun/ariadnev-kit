import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSmokeOutput } from "./smoke-binary.mjs";
import { hostAssetName } from "./binary-targets.mjs";

const goodValidate = "vcskill validate — 21 skills, 13 agents, 6 hooks\n  all checks passed";

test("passes on a healthy binary's output", () => {
  const r = checkSmokeOutput({ versionOut: "0.6.0\n", validateOut: goodValidate, expectedVersion: "0.6.0" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.failures, []);
});

test("fails when --version does not match the built version", () => {
  const r = checkSmokeOutput({ versionOut: "\n", validateOut: goodValidate, expectedVersion: "0.6.0" });
  assert.equal(r.ok, false);
  assert.match(r.failures.join(" "), /version/i);
});

test("fails when the embedded kit reports zero counts", () => {
  const bad = "vcskill validate — 0 skills, 0 agents, 0 hooks\n  all checks passed";
  const r = checkSmokeOutput({ versionOut: "0.6.0", validateOut: bad, expectedVersion: "0.6.0" });
  assert.equal(r.ok, false);
  assert.match(r.failures.join(" "), /count/i);
});

test("fails when validate is not clean", () => {
  const bad = "vcskill validate — 21 skills, 13 agents, 6 hooks\n  [dangling] x: broken";
  const r = checkSmokeOutput({ versionOut: "0.6.0", validateOut: bad, expectedVersion: "0.6.0" });
  assert.equal(r.ok, false);
  assert.match(r.failures.join(" "), /clean|passed/i);
});

test("fails when output leaks an absolute dev path", () => {
  const leak = goodValidate + "\n  loaded from /Users/dev/vcskill/kit";
  const r = checkSmokeOutput({ versionOut: "0.6.0", validateOut: leak, expectedVersion: "0.6.0" });
  assert.equal(r.ok, false);
  assert.match(r.failures.join(" "), /leak|path/i);
});

test("hostAssetName maps known platforms and rejects unknown", () => {
  assert.equal(hostAssetName("darwin", "arm64"), "vcskill-darwin-arm64");
  assert.equal(hostAssetName("linux", "x64"), "vcskill-linux-x64");
  assert.equal(hostAssetName("win32", "x64"), "vcskill-windows-x64.exe");
  assert.equal(hostAssetName("sunos", "sparc"), null);
});
