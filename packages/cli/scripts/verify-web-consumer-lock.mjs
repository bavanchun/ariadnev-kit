import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import {
  listTree, readRegularFile, readSourceFile, safeReal, sha256Bytes,
} from "./web-consumer-lock-files.mjs";

const ALLOWED_COMMANDS = new Set(["bun", "node", "pnpm"]);
const EXECUTION_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_PROCESS_OUTPUT_BYTES = 8 * 1024 * 1024;
const EXPECTED_REPOSITORY = "bavanchun/vcskill-web";

function stable(value) {
  return `${JSON.stringify(value, (_key, current) => (
    Array.isArray(current) || !current || typeof current !== "object"
      ? current
      : Object.fromEntries(Object.entries(current).sort(([left], [right]) => left.localeCompare(right)))
  ), 2)}\n`;
}

export function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd, encoding: "utf8", shell: false, stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function loadJson(content, label) {
  try {
    return JSON.parse(content.toString("utf8"));
  } catch {
    throw new Error(`${label} must contain valid JSON`);
  }
}

function normalizeOrigin(origin) {
  const scp = /^git@github\.com:([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+?)(?:\.git)?$/;
  if (scp.test(origin)) return scp.exec(origin)?.[1] ?? "";
  if (!origin.startsWith("https://") && !origin.startsWith("ssh://")) return "";
  const url = new URL(origin);
  if (url.hostname !== "github.com" || url.port || url.search || url.hash || url.password) return "";
  if (url.protocol === "https:" && url.username) return "";
  if (url.protocol === "ssh:" && url.username !== "git") return "";
  return /^\/([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+?)(?:\.git)?$/.exec(url.pathname)?.[1] ?? "";
}

function assertInvocation(invocation) {
  if (!ALLOWED_COMMANDS.has(invocation.argv[0])) throw new Error("web-consumer command is not allowlisted");
  for (const token of invocation.argv) {
    if (token.includes("\\") || /(?:^|[=:])[\/~]/.test(token) || token.split("/").includes("..")) {
      throw new Error("web-consumer invocation contains an unsafe path token");
    }
  }
  const outputs = new Set(invocation.outputs.map((entry) => entry.path));
  if (outputs.size !== invocation.outputs.length) throw new Error("web-consumer invocation outputs must be unique");
}

function validateSchema(schema, lock) {
  const validate = new Ajv2020({ allErrors: true, strict: true, strictTuples: false }).compile(schema);
  if (!validate(lock)) {
    const errors = (validate.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`);
    throw new Error(`web-consumer lock schema validation failed: ${errors.join("; ")}`);
  }
  assertInvocation(lock.invocation);
}

function sourceMetadata({ lockPath, schemaPath, sourceTreeRoot, expectedRepository = EXPECTED_REPOSITORY }) {
  for (const [label, path] of [["lock", lockPath], ["schema", schemaPath], ["source tree", sourceTreeRoot]]) {
    if (!existsSync(path)) throw new Error(`web-consumer ${label} is missing`);
  }
  const sourceRoot = realpathSync(sourceTreeRoot);
  const lockBytes = readSourceFile(sourceRoot, lockPath, "web-consumer lock");
  const schemaBytes = readSourceFile(sourceRoot, schemaPath, "web-consumer lock schema");
  const lock = loadJson(lockBytes, "web-consumer lock");
  validateSchema(loadJson(schemaBytes, "web-consumer lock schema"), lock);
  if (lock.repository !== expectedRepository) throw new Error("web-consumer repository does not match the core-owned authority");
  const descriptor = readRegularFile(sourceRoot, lock.previousSource.descriptorPath, "previousSource descriptor");
  if (sha256Bytes(descriptor) !== lock.previousSource.descriptorDigest) throw new Error("previousSource descriptor digest drift");
  return { lock, lockDigest: sha256Bytes(lockBytes), sourceRoot };
}

function verifyGitState(repositoryRoot, lock) {
  if (git(repositoryRoot, ["rev-parse", "HEAD"]) !== lock.commitSha) throw new Error("web-consumer lock commit drift");
  if (git(repositoryRoot, ["status", "--porcelain"]) !== "") throw new Error("web-consumer repository has uncommitted changes");
  let attached = true;
  try { git(repositoryRoot, ["symbolic-ref", "-q", "HEAD"]); } catch { attached = false; }
  if (attached) throw new Error("web-consumer checkout must be detached at the exact lock commit");
}

function verifyRepository(repositoryRoot, lock) {
  verifyGitState(repositoryRoot, lock);
  if (normalizeOrigin(git(repositoryRoot, ["remote", "get-url", "origin"])) !== lock.repository) {
    throw new Error("web-consumer repository remote drift");
  }
  for (const [path, digest] of Object.entries(lock.contractDigests).sort(([left], [right]) => left.localeCompare(right))) {
    if (sha256Bytes(readRegularFile(repositoryRoot, path, `contract ${path}`)) !== digest) {
      throw new Error(`web-consumer contract digest drift: ${path}`);
    }
  }
}

function consumerEnvironment(sourceRoot) {
  const environment = {
    CI: "true",
    NO_COLOR: "1",
    VCSKILL_RELEASE_DIR: resolve(sourceRoot, "packages", "cli", "dist", "release"),
  };
  for (const name of ["PATH", "HOME", "USERPROFILE", "TMPDIR", "TEMP", "TMP", "SystemRoot", "COMSPEC", "PATHEXT"]) {
    if (process.env[name]) environment[name] = process.env[name];
  }
  return environment;
}

function executeConsumer(repositoryRoot, sourceRoot, lock) {
  const cwd = safeReal(repositoryRoot, lock.invocation.cwd, "invocation.cwd");
  const stats = lstatSync(cwd);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error("invocation.cwd must be a real directory");
  execFileSync(lock.invocation.argv[0], lock.invocation.argv.slice(1), {
    cwd, env: consumerEnvironment(sourceRoot), encoding: "utf8", shell: false,
    stdio: ["ignore", "pipe", "pipe"], timeout: EXECUTION_TIMEOUT_MS, maxBuffer: MAX_PROCESS_OUTPUT_BYTES,
  });
  const report = readRegularFile(repositoryRoot, lock.invocation.reportPath, "web-consumer report");
  if (loadJson(report, "web-consumer report")?.status !== "pass") throw new Error("web-consumer report must declare status=pass");
  verifyGitState(repositoryRoot, lock);
  return sha256Bytes(report);
}

function hashOutputs(repositoryRoot, outputs) {
  const hashed = outputs.map((entry) => entry.kind === "file"
    ? { ...entry, digest: sha256Bytes(readRegularFile(repositoryRoot, entry.path, `output ${entry.path}`)) }
    : { ...entry, digest: sha256Bytes(stable(listTree(repositoryRoot, entry.path, `output ${entry.path}`))) });
  return { outputs: hashed, outputDigest: sha256Bytes(stable(hashed)) };
}

export function preflightWebConsumerLock(options) {
  const metadata = sourceMetadata(options);
  const repositoryRoot = realpathSync(options.repositoryRoot);
  verifyRepository(repositoryRoot, metadata.lock);
  return { repository: metadata.lock.repository, commitSha: metadata.lock.commitSha, lockDigest: metadata.lockDigest };
}

export function verifyWebConsumerLock(options) {
  const metadata = sourceMetadata(options);
  const repositoryRoot = realpathSync(options.repositoryRoot);
  verifyRepository(repositoryRoot, metadata.lock);
  const reportDigest = executeConsumer(repositoryRoot, metadata.sourceRoot, metadata.lock);
  const { outputs, outputDigest } = hashOutputs(repositoryRoot, metadata.lock.invocation.outputs);
  const contractDigest = sha256Bytes(stable(metadata.lock.contractDigests));
  const invocationDigest = sha256Bytes(stable(metadata.lock.invocation));
  const result = { schemaVersion: 1, status: "pass", repository: metadata.lock.repository, commitSha: metadata.lock.commitSha, contractDigest, invocationDigest, reportDigest, outputDigest, outputs };
  return { ...result, resultDigest: sha256Bytes(stable(result)) };
}

function runCli(argv) {
  const mode = argv[0]?.startsWith("--") ? argv.shift() : "--execute";
  if (mode === "--metadata") {
    const [lockPath, schemaPath, sourceTreeRoot = process.cwd(), expectedRepository] = argv;
    const metadata = sourceMetadata({ lockPath, schemaPath, sourceTreeRoot, expectedRepository });
    return { repository: metadata.lock.repository, commitSha: metadata.lock.commitSha, lockDigest: metadata.lockDigest };
  }
  const [repositoryRoot = process.cwd(), lockPath = resolve(".github/release/web-consumer-lock.json"), schemaPath = resolve(".github/release/web-consumer-lock.schema.json"), sourceTreeRoot = process.cwd(), expectedRepository] = argv;
  const options = { repositoryRoot, lockPath, schemaPath, sourceTreeRoot, expectedRepository };
  if (mode === "--preflight") return preflightWebConsumerLock(options);
  if (mode !== "--execute") throw new Error(`unsupported verifier mode: ${mode}`);
  return verifyWebConsumerLock(options);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { process.stdout.write(stable(runCli(process.argv.slice(2)))); }
  catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}
