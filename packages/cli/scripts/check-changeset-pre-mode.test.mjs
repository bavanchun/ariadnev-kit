import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "check-changeset-pre-mode.mjs");

/** Run the guard in a scratch cwd with a given pre.json and channel variable. */
function run({ pre, channel }) {
  const dir = mkdtempSync(join(tmpdir(), "av-premode-"));
  try {
    mkdirSync(join(dir, ".changeset"), { recursive: true });
    if (pre !== undefined) writeFileSync(join(dir, ".changeset", "pre.json"), pre);
    const env = { ...process.env };
    delete env.ARIADNEV_RELEASE_CHANNEL;
    if (channel !== undefined) env.ARIADNEV_RELEASE_CHANNEL = channel;
    try {
      const stdout = execFileSync(process.execPath, [script], { cwd: dir, env, encoding: "utf8" });
      return { status: 0, stdout, stderr: "" };
    } catch (err) {
      return { status: err.status, stdout: String(err.stdout ?? ""), stderr: String(err.stderr ?? "") };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a stable release with no pre mode passes", () => {
  const res = run({});
  assert.equal(res.status, 0);
  assert.match(res.stdout, /release channel: stable/);
});

// The failure this exists for: pre mode entered weeks ago, forgotten, and a
// release cut that looks routine and ships as -beta.N.
test("refuses a stable release while pre mode is active", () => {
  const res = run({ pre: JSON.stringify({ mode: "pre", tag: "beta" }) });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /pre mode is active/);
  assert.match(res.stderr, /changeset pre exit/);
});

test("allows a beta release when the opt-in is present", () => {
  const res = run({ pre: JSON.stringify({ mode: "pre", tag: "beta" }), channel: "beta" });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /release channel: beta/);
});

// The mirror image, and just as wrong: the variable says beta and the release
// would come out stable.
test("refuses a stable release while the channel variable says beta", () => {
  const res = run({ channel: "beta" });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /pre mode is not active/);
});

// `changeset pre exit` leaves the file behind with mode "exit". Treating that
// as pre mode would block every release after the first beta cycle.
test("treats an exited pre.json as not in pre mode", () => {
  const res = run({ pre: JSON.stringify({ mode: "exit", tag: "beta" }) });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /release channel: stable/);
});

test("fails loudly on an unparseable pre.json rather than assuming stable", () => {
  const res = run({ pre: "{ not json" });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /does not parse/);
});
