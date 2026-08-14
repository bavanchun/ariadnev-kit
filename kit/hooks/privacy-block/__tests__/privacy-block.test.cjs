const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const hookPath = path.join(__dirname, "..", "hook.cjs");
const { evaluatePrivacy } = require(hookPath);

function runHook(input, env = {}) {
  return spawnSync(process.execPath, [hookPath], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

function readEval(filePath) {
  return evaluatePrivacy("Read", { file_path: filePath });
}

test("blocks .env family, allows example/sample/template", () => {
  assert.equal(readEval(".env").decision, "deny");
  assert.equal(readEval("/proj/.env.local").decision, "deny");
  assert.equal(readEval(".env.production").decision, "deny");
  assert.equal(readEval(".env.example").decision, "allow");
  assert.equal(readEval("config/.env.sample").decision, "allow");
  assert.equal(readEval(".env.template").decision, "allow");
});

test("blocks key material and credentials files", () => {
  for (const f of ["server.pem", "private.key", "id_rsa", "id_ed25519.pub", "credentials.json", "secrets.yaml", "cert.p12"]) {
    assert.equal(readEval(f).decision, "deny", `expected deny for ${f}`);
  }
  assert.equal(readEval("src/index.ts").decision, "allow");
  assert.equal(readEval("keyboard.ts").decision, "allow");
});

test("path tricks: traversal and quoting do not bypass", () => {
  assert.equal(readEval("../.env").decision, "deny");
  assert.equal(readEval("foo/../.env").decision, "deny");
  assert.equal(readEval('".env"').decision, "deny");
  assert.equal(readEval("'.env'").decision, "deny");
});

test("symlink to a sensitive file is denied", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "av-pb-"));
  fs.writeFileSync(path.join(root, ".env"), "SECRET=1");
  const link = path.join(root, "innocent.txt");
  fs.symlinkSync(path.join(root, ".env"), link);
  assert.equal(readEval(link).decision, "deny");
  fs.rmSync(root, { recursive: true, force: true });
});

test("bash commands referencing sensitive files are denied unless approved", () => {
  const evalBash = (command) => evaluatePrivacy("Bash", { command });
  assert.equal(evalBash("cat .env").decision, "deny");
  assert.equal(evalBash("cat '.env'").decision, "deny");
  assert.equal(evalBash("grep KEY ../.env.local").decision, "deny");
  assert.equal(evalBash("cat id_rsa | base64").decision, "deny");
  assert.equal(evalBash("VC_APPROVED=1 cat .env").decision, "allow");
  assert.equal(evalBash("pnpm test").decision, "allow");
  assert.equal(evalBash("cp .env.example .env").decision, "deny"); // writes real .env
});

test("deny path: exit 2 with @@VC_PRIVACY@@ marker on stderr", () => {
  const res = runHook({
    session_id: "s",
    tool_name: "Read",
    tool_input: { file_path: "/proj/.env" },
  });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /@@VC_PRIVACY_START@@/);
  assert.match(res.stderr, /@@VC_PRIVACY_END@@/);
  const marker = res.stderr.match(/@@VC_PRIVACY_START@@([\s\S]*?)@@VC_PRIVACY_END@@/);
  const payload = JSON.parse(marker[1]);
  assert.match(payload.file, /\.env$/);
  assert.match(payload.approve_hint, /VC_APPROVED=1/);
});

test("allow path: exit 0, silent", () => {
  const res = runHook({ tool_name: "Read", tool_input: { file_path: "src/app.ts" } });
  assert.equal(res.status, 0);
  assert.equal(res.stderr.trim(), "");
});

test("fail-open: malformed stdin exits 0 (never blocks by accident)", () => {
  const res = runHook("garbage{{");
  assert.equal(res.status, 0);
});
