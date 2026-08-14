import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSmokeOutput } from "./smoke-binary.mjs";
import { hostAssetName } from "./binary-targets.mjs";

const goodValidate = "vcskill validate — 21 skills, 13 agents, 6 hooks\n  all checks passed";
const goodRunHelp = "run [options] [workflow]\nresume status cancel --runtime <provider> --validate --json";
const goodGraphValidate = JSON.stringify({
  schemaVersion: 1,
  action: "validate",
  ok: true,
  status: "valid",
  workflow: "read-only-delivery",
  graph: { id: "read-only-delivery", nodes: 7, edges: 12 },
});

function smoke(overrides = {}) {
  return checkSmokeOutput({
    versionOut: "0.6.0\n",
    validateOut: goodValidate,
    runHelpOut: goodRunHelp,
    graphValidateOut: goodGraphValidate,
    expectedVersion: "0.6.0",
    ...overrides,
  });
}

test("passes on a healthy binary's output", () => {
  const r = smoke();
  assert.equal(r.ok, true);
  assert.deepEqual(r.failures, []);
});

test("fails when --version does not match the built version", () => {
  const r = smoke({ versionOut: "\n" });
  assert.equal(r.ok, false);
  assert.match(r.failures.join(" "), /version/i);
});

test("fails when the embedded kit reports zero counts", () => {
  const bad = "vcskill validate — 0 skills, 0 agents, 0 hooks\n  all checks passed";
  const r = smoke({ validateOut: bad });
  assert.equal(r.ok, false);
  assert.match(r.failures.join(" "), /count/i);
});

test("fails when validate is not clean", () => {
  const bad = "vcskill validate — 21 skills, 13 agents, 6 hooks\n  [dangling] x: broken";
  const r = smoke({ validateOut: bad });
  assert.equal(r.ok, false);
  assert.match(r.failures.join(" "), /clean|passed/i);
});

test("passes on a warn-only validate (0 errors) — matches the gate contract", () => {
  const warnOnly = "vcskill validate — 21 skills, 13 agents, 6 hooks\n  [warn:collision] a ~ b: 45% similar\n  0 error(s), 1 warning(s)";
  const r = smoke({ validateOut: warnOnly });
  assert.equal(r.ok, true);
});

test("fails when output leaks an absolute dev path", () => {
  const leak = goodValidate + "\n  loaded from /Users/dev/vcskill/kit";
  const r = smoke({ validateOut: leak });
  assert.equal(r.ok, false);
  assert.match(r.failures.join(" "), /leak|path/i);
});

test("fails when the packaged run lifecycle or canonical graph is absent", () => {
  const noLifecycle = smoke({ runHelpOut: "run [workflow]" });
  assert.equal(noLifecycle.ok, false);
  assert.match(noLifecycle.failures.join(" "), /run --help/i);

  const noGraph = smoke({ graphValidateOut: JSON.stringify({ schemaVersion: 1, status: "valid", graph: { nodes: 0, edges: 0 } }) });
  assert.equal(noGraph.ok, false);
  assert.match(noGraph.failures.join(" "), /graph|envelope/i);
});

test("hostAssetName maps known platforms and rejects unknown", () => {
  assert.equal(hostAssetName("darwin", "arm64"), "vcskill-darwin-arm64");
  assert.equal(hostAssetName("linux", "x64"), "vcskill-linux-x64");
  assert.equal(hostAssetName("win32", "x64"), "vcskill-windows-x64.exe");
  assert.equal(hostAssetName("sunos", "sparc"), null);
});
