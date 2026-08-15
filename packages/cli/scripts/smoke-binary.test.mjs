import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSmokeOutput, checkAssetHeader } from "./smoke-binary.mjs";
import { hostAssetName, TARGETS, expectedHeader } from "./binary-targets.mjs";

const goodValidate = "ariadnev validate — 21 skills, 13 agents, 6 hooks\n  all checks passed";
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
  const bad = "ariadnev validate — 0 skills, 0 agents, 0 hooks\n  all checks passed";
  const r = smoke({ validateOut: bad });
  assert.equal(r.ok, false);
  assert.match(r.failures.join(" "), /count/i);
});

test("fails when validate is not clean", () => {
  const bad = "ariadnev validate — 21 skills, 13 agents, 6 hooks\n  [dangling] x: broken";
  const r = smoke({ validateOut: bad });
  assert.equal(r.ok, false);
  assert.match(r.failures.join(" "), /clean|passed/i);
});

test("passes on a warn-only validate (0 errors) — matches the gate contract", () => {
  const warnOnly = "ariadnev validate — 21 skills, 13 agents, 6 hooks\n  [warn:collision] a ~ b: 45% similar\n  0 error(s), 1 warning(s)";
  const r = smoke({ validateOut: warnOnly });
  assert.equal(r.ok, true);
});

test("fails when output leaks an absolute dev path", () => {
  const leak = goodValidate + "\n  loaded from /Users/dev/ariadnev/kit";
  const r = smoke({ validateOut: leak });
  assert.equal(r.ok, false);
  assert.match(r.failures.join(" "), /leak|path/i);
});

test("catches a leaked build root that is not under /Users — the CI case", () => {
  // The only runner this check runs on automatically is Linux, where a baked
  // path looks like /home/runner/work/..., so matching /Users/ alone means the
  // check can never fire where it is actually needed.
  const leak = goodValidate + "\n  loaded from /home/runner/work/ariadnev-kit/kit";
  assert.equal(smoke({ validateOut: leak }).ok, true, "no build root supplied — nothing to match");
  const caught = smoke({ validateOut: leak, buildRoot: "/home/runner/work/ariadnev-kit" });
  assert.equal(caught.ok, false);
  assert.match(caught.failures.join(" "), /leak|path/i);
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
  assert.equal(hostAssetName("darwin", "arm64"), "ariadnev-darwin-arm64");
  assert.equal(hostAssetName("linux", "x64"), "ariadnev-linux-x64");
  assert.equal(hostAssetName("win32", "x64"), "ariadnev-windows-x64.exe");
  assert.equal(hostAssetName("sunos", "sparc"), null);
});

// Header bytes for the four assets a runner cannot execute. Format alone is not
// enough: both darwin assets are Mach-O and both linux assets are ELF, so a
// swapped pair — the most plausible packaging mistake — would pass. The arch
// field is what separates them.
// Built from magic + filler + arch, NOT from one recorded prefix: the bytes
// between them are real header fields (ELF class, endianness, ABI, e_type) and
// a fixture that zeroed them once agreed with an expectation that no real
// binary satisfied. The filler here is deliberately non-zero for that reason.
function fakeBinary(asset, { arch = true, size = 12 * 1024 * 1024 } = {}) {
  const { magic, archOffset, archBytes } = expectedHeader(asset);
  const source = arch
    ? archBytes
    : expectedHeader(asset.includes("arm64") ? asset.replace("arm64", "x64") : asset.replace("x64", "arm64")).archBytes;
  const head = Buffer.alloc(Math.max(magic.length, archOffset + archBytes.length), 0x5a);
  head.set(Buffer.from(magic), 0);
  if (archBytes.length > 0) head.set(Buffer.from(source), archOffset);
  return { head, size };
}

test("accepts each target's own header bytes", () => {
  for (const { asset } of TARGETS) {
    const { head, size } = fakeBinary(asset);
    assert.deepEqual(checkAssetHeader(asset, head, size).failures, [], asset);
  }
});

test("rejects a binary built for the wrong architecture", () => {
  for (const asset of ["ariadnev-darwin-arm64", "ariadnev-linux-x64"]) {
    const { head, size } = fakeBinary(asset, { arch: false });
    const r = checkAssetHeader(asset, head, size);
    assert.equal(r.failures.length > 0, true, asset);
    assert.match(r.failures.join(" "), /architecture|header/i);
  }
});

test("rejects a truncated or empty asset", () => {
  const asset = "ariadnev-linux-x64";
  const { head } = fakeBinary(asset);
  assert.match(checkAssetHeader(asset, head, 1024).failures.join(" "), /too small/i);
  assert.equal(checkAssetHeader(asset, Buffer.alloc(0), 0).failures.length > 0, true);
});

test("rejects a completely wrong format", () => {
  const r = checkAssetHeader("ariadnev-windows-x64.exe", Buffer.from("#!/bin/sh\necho hi\n"), 12 * 1024 * 1024);
  assert.match(r.failures.join(" "), /header/i);
});
