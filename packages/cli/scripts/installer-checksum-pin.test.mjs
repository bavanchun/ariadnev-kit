// The installer's sha256 check only authenticates the binary if checksums.txt
// comes from somewhere the caller cannot redirect. Before this guard, setting
// ARIADNEV_BASE_URL pointed BOTH fetches at the same host, so an attacker who
// could set one env var served the payload and the hash that "verified" it.
//
// These tests stand up two local origins — a canonical one and a hostile one —
// and drive the real install.sh against them. The canonical domain is a literal
// in the script (deliberately: it must not be overridable), so each case runs a
// copy with that one literal rewritten to the test's canonical origin. Only the
// literal changes; every branch under test is the shipped code.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const installSh = join(repoRoot, "install.sh");
const installPs1 = join(repoRoot, "install.ps1");

const GOOD = '#!/bin/sh\necho "ariadnev 9.9.9-good"\n';
const TROJAN = '#!/bin/sh\necho "ariadnev 9.9.9-TROJAN"\n';

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

function assetName() {
  const os = execFileSync("uname", ["-s"]).toString().trim();
  const arch = execFileSync("uname", ["-m"]).toString().trim();
  const o = os === "Darwin" ? "darwin" : "linux";
  const a = arch === "arm64" || arch === "aarch64" ? "arm64" : "x64";
  return `ariadnev-${o}-${a}`;
}

/**
 * Serve /download/<asset> and /download/checksums.txt for one origin.
 *
 * `listAsset` names the asset the checksums.txt line is *for*; pointing it at
 * something else models the two origins disagreeing about which assets exist,
 * which is only possible now that they can be different hosts.
 */
function startOrigin(asset, binary, { listAsset = asset } = {}) {
  const server = createServer((req, res) => {
    if (req.url === `/download/${asset}`) {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end(binary);
    } else if (req.url === "/download/checksums.txt") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(`${sha256(binary)}  ${listAsset}\n`);
    } else {
      res.writeHead(404);
      res.end("nope");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

/**
 * Run install.sh with its hardcoded canonical domain rewritten to `canonical`.
 *
 * Async on purpose: the origins above live in this process, so a synchronous
 * child (execFileSync) would block the event loop and curl would hang forever
 * waiting for a server that cannot answer.
 */
function runInstaller({ canonical, env, installDir, asset }) {
  const script = readFileSync(installSh, "utf8").replace(
    'DEFAULT_BASE="https://ariadnev.com"',
    `DEFAULT_BASE="${canonical}"`,
  );
  assert.ok(script.includes(`DEFAULT_BASE="${canonical}"`), "canonical rewrite failed — did the literal change?");
  const scriptPath = join(installDir, "install-under-test.sh");
  writeFileSync(scriptPath, script, { mode: 0o755 });

  // Strip inherited ARIADNEV_* so a maintainer who exports one for staging work
  // does not silently change what these cases are testing.
  const baseEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("ARIADNEV_")),
  );

  return new Promise((resolve) => {
    const child = spawn("bash", [scriptPath], {
      env: { ...baseEnv, ARIADNEV_INSTALL_DIR: join(installDir, "bin"), ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ ok: code === 0, stdout, stderr }));
  });
}

const pwsh = (() => {
  try {
    execFileSync("pwsh", ["-NoProfile", "-Command", "exit 0"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

/**
 * Run install.ps1 the way `irm … | iex` runs it: inside a session whose
 * preferences the script did not choose. $WarningPreference is set to
 * SilentlyContinue deliberately — the warning must survive a hostile session,
 * because it is the only signal left on the opt-out path.
 */
function runInstallerPs1({ canonical, env }) {
  const script = readFileSync(installPs1, "utf8").replace(
    '$defaultBase = "https://ariadnev.com"',
    `$defaultBase = "${canonical}"`,
  );
  assert.ok(script.includes(`$defaultBase = "${canonical}"`), "canonical rewrite failed — did the literal change?");
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-ps1-"));
  const scriptPath = join(dir, "install-under-test.ps1");
  writeFileSync(scriptPath, script);

  const baseEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("ARIADNEV_")),
  );

  // %TEMP% and %LOCALAPPDATA% are both read before the first download — the
  // install dir is computed at the top of the script, not in the install
  // section — so a Linux run dies on a null Join-Path argument without them.
  const prelude = [
    "$WarningPreference='SilentlyContinue'",
    // Plain text, or pwsh wraps every message in ANSI and the assertions below
    // match against escape sequences instead of the text.
    "if ($PSStyle) { $PSStyle.OutputRendering='PlainText' }",
    "$ErrorView='NormalView'",
  ].join("; ");

  return new Promise((resolve) => {
    const child = spawn("pwsh", ["-NoProfile", "-Command", `${prelude}; & '${scriptPath}'`], {
      env: { ...baseEnv, TEMP: dir, LOCALAPPDATA: join(dir, "local"), NO_COLOR: "1", ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      rmSync(dir, { recursive: true, force: true });
      resolve({ ok: code === 0, stdout, stderr });
    });
  });
}

// The ps1 pin is the same security property on the other platform, and reading
// alone missed two defects in it. Only the abort paths are exercised: they
// terminate before %LOCALAPPDATA% and the user-PATH write, which have no
// meaning off Windows. A completed Windows install stays a manual check.
test("installer checksum pin (install.ps1)", { skip: pwsh ? false : "pwsh not installed" }, async (t) => {
  const asset = "ariadnev-windows-x64.exe";
  const canonical = await startOrigin(asset, GOOD);
  const hostile = await startOrigin(asset, TROJAN);
  const noEntry = await startOrigin(asset, GOOD, { listAsset: "ariadnev-some-other-target.exe" });
  t.after(() => {
    for (const o of [canonical, hostile, noEntry]) o.server.close();
  });

  await t.test("a hostile base URL cannot authenticate its own binary", async () => {
    const r = await runInstallerPs1({
      canonical: canonical.url,
      env: { ARIADNEV_BASE_URL: hostile.url },
    });
    assert.equal(r.ok, false, "install should have aborted");
    assert.match(r.stderr, /checksum mismatch/);
  });

  await t.test("only the literal 1 opts out — 0 still pins", async () => {
    const r = await runInstallerPs1({
      canonical: canonical.url,
      env: { ARIADNEV_BASE_URL: hostile.url, ARIADNEV_ALLOW_UNVERIFIED_BASE: "0" },
    });
    assert.equal(r.ok, false, "'0' must not be read as opting out");
    assert.match(r.stderr, /checksum mismatch/);
  });

  await t.test("an asset missing from checksums.txt says so", async () => {
    const r = await runInstallerPs1({ canonical: noEntry.url, env: {} });
    assert.equal(r.ok, false, "install should have aborted");
    assert.match(r.stderr, /exactly one checksum line/);
  });

  await t.test("the opt-out warning survives a silenced session", async () => {
    // Runs past the checksum and then fails on Windows-only APIs, so only the
    // warning is asserted — that is the whole point of the case.
    const r = await runInstallerPs1({
      canonical: canonical.url,
      env: { ARIADNEV_BASE_URL: hostile.url, ARIADNEV_ALLOW_UNVERIFIED_BASE: "1" },
    });
    assert.match(r.stderr, /cannot authenticate/, "warning must not be suppressible by the caller");
  });
});

test("installer checksum pin", async (t) => {
  const asset = assetName();
  const canonical = await startOrigin(asset, GOOD);
  const hostile = await startOrigin(asset, TROJAN);
  // A real second host, not the same one under another name: relying on
  // `localhost` resolving past ::1 to reach a 127.0.0.1 listener is a flake.
  const mirror = await startOrigin(asset, GOOD);
  // Canonical serving a checksums.txt that does not list our asset.
  const noEntry = await startOrigin(asset, GOOD, { listAsset: "ariadnev-some-other-target" });
  const work = mkdtempSync(join(tmpdir(), "ariadnev-installer-"));
  t.after(() => {
    for (const o of [canonical, hostile, mirror, noEntry]) o.server.close();
    rmSync(work, { recursive: true, force: true });
  });

  const freshDir = (name) => {
    const d = join(work, name);
    mkdirSync(join(d, "bin"), { recursive: true });
    return d;
  };

  await t.test("a hostile base URL cannot authenticate its own binary", async () => {
    const dir = freshDir("hostile");
    const r = await runInstaller({
      canonical: canonical.url,
      env: { ARIADNEV_BASE_URL: hostile.url },
      installDir: dir,
      asset,
    });
    // The hostile origin serves a matching checksums.txt for its trojan. The
    // install must still fail, because checksums came from the canonical origin.
    assert.equal(r.ok, false, "install should have aborted");
    assert.match(r.stderr, /checksum mismatch/, "should abort on checksum mismatch");
    assert.equal(existsSync(join(dir, "bin", "ariadnev")), false, "no binary should be installed");
  });

  await t.test("no override behaves exactly as before", async () => {
    const dir = freshDir("default");
    const r = await runInstaller({ canonical: canonical.url, env: {}, installDir: dir, asset });
    assert.equal(r.ok, true, `install should succeed: ${r.stderr}`);
    assert.match(readFileSync(join(dir, "bin", "ariadnev"), "utf8"), /good/);
    assert.doesNotMatch(r.stderr, /WARNING/, "no warning when nothing is overridden");
  });

  await t.test("a mirror serves the binary, canonical still serves the hash", async () => {
    const dir = freshDir("mirror");
    // Same good bytes from a different host: legitimate mirror, must succeed.
    const r = await runInstaller({
      canonical: canonical.url,
      env: { ARIADNEV_BASE_URL: mirror.url },
      installDir: dir,
      asset,
    });
    assert.equal(r.ok, true, `mirror install should succeed: ${r.stderr}`);
    assert.match(r.stderr, /checksums\.txt from/, "should say where checksums came from");
  });

  // The pin's whole safety rests on this predicate matching only "1". Loosening
  // it to -n or != "" re-opens the hole, and without this case the suite stays
  // green while it does.
  await t.test("only the literal 1 opts out — 0 still pins", async () => {
    const dir = freshDir("optout-zero");
    const r = await runInstaller({
      canonical: canonical.url,
      env: { ARIADNEV_BASE_URL: hostile.url, ARIADNEV_ALLOW_UNVERIFIED_BASE: "0" },
      installDir: dir,
      asset,
    });
    assert.equal(r.ok, false, "'0' must not be read as opting out");
    assert.match(r.stderr, /checksum mismatch/);
    assert.equal(existsSync(join(dir, "bin", "ariadnev")), false, "no binary should be installed");
  });

  // Two origins can now disagree about which assets exist. Under `set -e` a
  // bare grep miss killed the script with no output at all.
  await t.test("an asset missing from checksums.txt says so", async () => {
    const dir = freshDir("no-entry");
    const r = await runInstaller({ canonical: noEntry.url, env: {}, installDir: dir, asset });
    assert.equal(r.ok, false, "install should have aborted");
    assert.match(r.stderr, /no checksum for/, "must name the problem, not exit silently");
    assert.equal(existsSync(join(dir, "bin", "ariadnev")), false, "no binary should be installed");
  });

  await t.test("the explicit opt-in restores full-override behaviour", async () => {
    const dir = freshDir("optin");
    const r = await runInstaller({
      canonical: canonical.url,
      env: { ARIADNEV_BASE_URL: hostile.url, ARIADNEV_ALLOW_UNVERIFIED_BASE: "1" },
      installDir: dir,
      asset,
    });
    assert.equal(r.ok, true, `opt-in install should succeed: ${r.stderr}`);
    assert.match(readFileSync(join(dir, "bin", "ariadnev"), "utf8"), /TROJAN/, "opt-in takes the overridden binary");
    assert.match(r.stderr, /cannot authenticate/, "opt-in must warn loudly");
  });
});
