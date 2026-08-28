import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSmokeOutput, checkAssetHeader } from "./smoke-binary.mjs";
import { hostAssetName, TARGETS, expectedHeader } from "./binary-targets.mjs";

const goodValidate = "ariadnev validate — 21 skills, 13 agents, 6 hooks\n  all checks passed";
// The lifecycle moved under `workflow`, so the fixtures follow the two levels
// the real help now has: subcommand names on the group, runtime options on
// `workflow run`. `run` keeps a positional for one release and advertises what
// the name is being reserved for.
const goodWorkflowHelp = "workflow [options] [command]\n  run  resume  status  cancel";
const goodWorkflowRunHelp = "workflow run [options] [workflow]\n--runtime <provider> --validate --json";
const goodRunHelp = "run [options] [workflow]\nReserved for skill dispatch as run <kit>/<skill>";
const goodGraphValidate = JSON.stringify({
  schemaVersion: 1,
  action: "validate",
  ok: true,
  status: "valid",
  workflow: "read-only-delivery",
  graph: { id: "read-only-delivery", nodes: 7, edges: 12 },
});

const goodDoctor = [
  "ariadnev doctor — not-installed",
  "  ✓ ed25519: available (release signatures can be verified)",
  "  ✓ sqlite: available (bun, fts5, wal)",
].join("\n");

function smoke(overrides = {}) {
  return checkSmokeOutput({
    versionOut: "0.6.0\n",
    validateOut: goodValidate,
    workflowHelpOut: goodWorkflowHelp,
    workflowRunHelpOut: goodWorkflowRunHelp,
    runHelpOut: goodRunHelp,
    graphValidateOut: goodGraphValidate,
    doctorOut: goodDoctor,
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

test("fails when the packaged workflow lifecycle or canonical graph is absent", () => {
  const noLifecycle = smoke({ workflowHelpOut: "workflow [command]" });
  assert.equal(noLifecycle.ok, false);
  assert.match(noLifecycle.failures.join(" "), /workflow --help/i);

  // Split assertion, split failure: losing the runtime options is a different
  // break from losing the subcommands, and a gate that reported them as one
  // would send a maintainer to the wrong half of the surface.
  const noOptions = smoke({ workflowRunHelpOut: "workflow run [workflow]" });
  assert.equal(noOptions.ok, false);
  assert.match(noOptions.failures.join(" "), /workflow run --help/i);

  // A binary where the rename half-landed: the harness moved, but `run` no
  // longer says what it is reserved for. Indistinguishable from a broken build
  // to anyone reading the help, so the gate has to fail on it.
  const noReservation = smoke({ runHelpOut: "run [options] [workflow]" });
  assert.equal(noReservation.ok, false);
  assert.match(noReservation.failures.join(" "), /dispatch grammar/i);

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

// Whether node:crypto carries Ed25519 into all five cross-compiled targets is an
// assumption, and `av update` refusing everything looks the same whether the key
// is unset or the runtime cannot do the maths. The gate wants the capability
// asserted, so it has to fail on anything other than a clear yes.
test("fails when doctor does not report ed25519 as available", () => {
  const res = smoke({
    doctorOut: "ariadnev doctor — not-installed\n  ✗ ed25519: UNAVAILABLE — `ariadnev update` cannot verify a release on this platform",
  });
  assert.equal(res.ok, false);
  assert.ok(res.failures.some((f) => /ed25519/.test(f)));
});

test("fails when doctor said nothing about ed25519 at all", () => {
  const res = smoke({ doctorOut: "ariadnev doctor — healthy   health ▓▓▓ 100" });
  assert.equal(res.ok, false);
});

// A release gate with an opt-out is not a gate. The runner always captures
// doctor output, so an absent value means something went wrong upstream — which
// is a failure, not a reason to wave the check through.
test("fails when no doctor output was captured at all", () => {
  assert.equal(smoke({ doctorOut: undefined }).ok, false);
});

test("fails when the target's SQLite has no FTS5", () => {
  // The failure this is here for: Bun bundles its own SQLite off macOS, so a
  // Linux or Windows artifact can lose full-text search while every other
  // assertion in this file still passes.
  const r = smoke({ doctorOut: goodDoctor.replace("sqlite: available (bun, fts5, wal)", "sqlite: UNAVAILABLE — missing fts5") });
  assert.equal(r.ok, false);
  assert.match(r.failures.join(" "), /sqlite/i);
});

test("fails when the binary reports WAL but not FTS5", () => {
  const r = smoke({ doctorOut: goodDoctor.replace(", fts5, wal", ", wal") });
  assert.equal(r.ok, false);
  assert.match(r.failures.join(" "), /fts5 and wal/);
});

test("fails when doctor says nothing about sqlite at all", () => {
  // Silence is the failure mode a positive assertion exists to catch: an older
  // binary, or one whose storage line was dropped, must not smoke green.
  const r = smoke({ doctorOut: "ariadnev doctor — not-installed\n  ✓ ed25519: available (release signatures can be verified)" });
  assert.equal(r.ok, false);
  assert.match(r.failures.join(" "), /sqlite/i);
});
