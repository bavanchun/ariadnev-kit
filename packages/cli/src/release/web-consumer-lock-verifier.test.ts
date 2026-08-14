import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { preflightWebConsumerLock, sha256File, verifyWebConsumerLock } from "../../scripts/verify-web-consumer-lock.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..", "..");
const canonicalSchemaPath = join(repoRoot, ".github", "release", "web-consumer-lock.schema.json");
const expectedRepository = "bavanchun/ariadnev-web";
const temps: string[] = [];

function tempDir(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  temps.push(path);
  return path;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function setup(origin = "https://github.com/bavanchun/ariadnev-web.git") {
  const root = tempDir("ariadnev-web-lock-");
  const webRepo = join(root, "web");
  const sourceTree = join(root, "core");
  mkdirSync(webRepo, { recursive: true });
  mkdirSync(sourceTree, { recursive: true });
  git(root, "init", webRepo);
  git(webRepo, "config", "user.email", "test@example.com");
  git(webRepo, "config", "user.name", "Test");
  git(webRepo, "remote", "add", "origin", origin);
  write(join(webRepo, "consumer", ".gitignore"), "dist/\n");
  write(join(webRepo, "consumer", "scripts", "consume.mjs"), [
    "import { mkdirSync, writeFileSync, symlinkSync } from 'node:fs';",
    "import { join } from 'node:path';",
    "const mode = process.argv[2] ?? 'pass';",
    "const out = join(process.cwd(), 'dist');",
    "mkdirSync(join(out, 'tree'), { recursive: true });",
    "writeFileSync(join(out, 'tree', 'b.txt'), 'B');",
    "writeFileSync(join(out, 'tree', 'a.txt'), 'A');",
    "if (mode === 'symlink') symlinkSync('../result.json', join(out, 'tree', 'link.json'));",
    "writeFileSync(join(out, 'result.json'), '{\"ok\":true}\\n');",
    "if (mode === 'oversized') writeFileSync(join(out, 'result.json'), Buffer.alloc(8 * 1024 * 1024 + 1));",
    "writeFileSync(join(out, 'report.json'), JSON.stringify({ status: mode === 'fail-report' ? 'fail' : 'pass' }) + '\\n');",
  ].join("\n"));
  write(join(sourceTree, "descriptors", "previous.json"), "{\"tag\":\"ariadnev@0.10.0\"}\n");
  git(webRepo, "add", ".");
  git(webRepo, "commit", "-m", "fixture");
  git(webRepo, "checkout", "--detach");
  const commitSha = git(webRepo, "rev-parse", "HEAD");
  const lockPath = join(sourceTree, ".github", "release", "web-consumer-lock.json");
  const schemaPath = join(sourceTree, ".github", "release", "web-consumer-lock.schema.json");
  write(schemaPath, readFileSync(canonicalSchemaPath, "utf8"));
  const lock = {
    schemaVersion: 1,
    repository: expectedRepository,
    commitSha,
    contractDigests: {
      "consumer/scripts/consume.mjs": sha256File(join(webRepo, "consumer", "scripts", "consume.mjs")),
    },
    invocation: {
      cwd: "consumer",
      argv: ["node", "scripts/consume.mjs", "pass"],
      reportPath: "consumer/dist/report.json",
      outputs: [
        { path: "consumer/dist/result.json", kind: "file" },
        { path: "consumer/dist/tree", kind: "tree" },
      ],
    },
    previousSource: {
      tag: "ariadnev@0.10.0",
      descriptorPath: "descriptors/previous.json",
      descriptorDigest: sha256File(join(sourceTree, "descriptors", "previous.json")),
    },
  };
  write(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  return { lock, lockPath, root, schemaPath, sourceTree, webRepo };
}

afterEach(() => {
  while (temps.length > 0) rmSync(temps.pop()!, { recursive: true, force: true });
});

describe("web consumer lock verifier", () => {
  it("rejects shell-like or unsafe contract grammar", () => {
    const { lock, lockPath, schemaPath, sourceTree, webRepo } = setup();
    lock.invocation.argv[1] = "scripts/consume.mjs&&echo";
    write(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    expect(() => verifyWebConsumerLock({ lockPath, schemaPath, repositoryRoot: webRepo, sourceTreeRoot: sourceTree, expectedRepository })).toThrow(/schema validation failed/i);
    lock.invocation.argv[1] = "scripts/consume.mjs";
    lock.invocation.reportPath = "../report.json";
    write(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    expect(() => verifyWebConsumerLock({ lockPath, schemaPath, repositoryRoot: webRepo, sourceTreeRoot: sourceTree, expectedRepository })).toThrow(/schema validation failed/i);
  });

  it("rejects origin spoofing, sha drift, dirty checkout, and digest drift", () => {
    const { lock, lockPath, schemaPath, sourceTree, webRepo } = setup("https://github.com/bavanchun/ariadnev-web.evil.git");
    expect(() => verifyWebConsumerLock({ lockPath, schemaPath, repositoryRoot: webRepo, sourceTreeRoot: sourceTree, expectedRepository })).toThrow(/remote drift/i);
    git(webRepo, "remote", "set-url", "origin", "git@github.com:bavanchun/ariadnev-web.git");
    lock.commitSha = "a".repeat(40);
    write(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    expect(() => verifyWebConsumerLock({ lockPath, schemaPath, repositoryRoot: webRepo, sourceTreeRoot: sourceTree, expectedRepository })).toThrow(/commit drift/i);
    lock.commitSha = git(webRepo, "rev-parse", "HEAD");
    write(join(webRepo, "README.md"), "dirty\n");
    write(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    expect(() => verifyWebConsumerLock({ lockPath, schemaPath, repositoryRoot: webRepo, sourceTreeRoot: sourceTree, expectedRepository })).toThrow(/uncommitted changes/i);
    rmSync(join(webRepo, "README.md"));
    lock.contractDigests["consumer/scripts/consume.mjs"] = `sha256:${"0".repeat(64)}`;
    write(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    expect(() => verifyWebConsumerLock({ lockPath, schemaPath, repositoryRoot: webRepo, sourceTreeRoot: sourceTree, expectedRepository })).toThrow(/contract digest drift/i);
  });

  it("rejects an attached branch even when it resolves to the locked commit", () => {
    const { lockPath, schemaPath, sourceTree, webRepo } = setup();
    git(webRepo, "switch", "-c", "attached");
    expect(() => verifyWebConsumerLock({ lockPath, schemaPath, repositoryRoot: webRepo, sourceTreeRoot: sourceTree, expectedRepository })).toThrow(/must be detached/i);
  });

  it("rejects failed reports, descriptor drift, and symlinked outputs", () => {
    const { lock, lockPath, schemaPath, sourceTree, webRepo } = setup();
    lock.invocation.argv[2] = "fail-report";
    write(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    expect(() => verifyWebConsumerLock({ lockPath, schemaPath, repositoryRoot: webRepo, sourceTreeRoot: sourceTree, expectedRepository })).toThrow(/status=pass/i);
    lock.invocation.argv[2] = "pass";
    write(join(sourceTree, "descriptors", "previous.json"), "{\"tag\":\"drifted\"}\n");
    expect(() => verifyWebConsumerLock({ lockPath, schemaPath, repositoryRoot: webRepo, sourceTreeRoot: sourceTree, expectedRepository })).toThrow(/descriptor digest drift/i);
    write(join(sourceTree, "descriptors", "previous.json"), "{\"tag\":\"ariadnev@0.10.0\"}\n");
    lock.previousSource.descriptorDigest = sha256File(join(sourceTree, "descriptors", "previous.json"));
    lock.invocation.argv[2] = "symlink";
    write(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    expect(() => verifyWebConsumerLock({ lockPath, schemaPath, repositoryRoot: webRepo, sourceTreeRoot: sourceTree, expectedRepository })).toThrow(/symbolic links/i);
  });

  it("executes the exact fixture consumer and emits deterministic result and output digests", () => {
    const { lockPath, schemaPath, sourceTree, webRepo } = setup();
    const first = verifyWebConsumerLock({ lockPath, schemaPath, repositoryRoot: webRepo, sourceTreeRoot: sourceTree, expectedRepository });
    const second = verifyWebConsumerLock({ lockPath, schemaPath, repositoryRoot: webRepo, sourceTreeRoot: sourceTree, expectedRepository });
    expect(first.status).toBe("pass");
    expect(first.reportDigest).toBe(second.reportDigest);
    expect(first.outputDigest).toBe(second.outputDigest);
    expect(first.resultDigest).toBe(second.resultDigest);
    expect(first.invocationDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.outputs).toEqual([
      { path: "consumer/dist/result.json", kind: "file", digest: sha256File(join(webRepo, "consumer", "dist", "result.json")) },
      expect.objectContaining({ path: "consumer/dist/tree", kind: "tree", digest: expect.stringMatching(/^sha256:/) }),
    ]);
  });

  it("preflights exact source and contract state without executing the consumer", () => {
    const { lockPath, schemaPath, sourceTree, webRepo } = setup();
    const metadata = preflightWebConsumerLock({ lockPath, schemaPath, repositoryRoot: webRepo, sourceTreeRoot: sourceTree, expectedRepository });
    expect(metadata.repository).toBe(expectedRepository);
    expect(metadata.commitSha).toBe(git(webRepo, "rev-parse", "HEAD"));
    expect(existsSync(join(webRepo, "consumer", "dist"))).toBe(false);
  });

  it("rejects consumer outputs above the bounded file limit", () => {
    const { lock, lockPath, schemaPath, sourceTree, webRepo } = setup();
    lock.invocation.argv[2] = "oversized";
    write(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    expect(() => verifyWebConsumerLock({ lockPath, schemaPath, repositoryRoot: webRepo, sourceTreeRoot: sourceTree, expectedRepository })).toThrow(/exceeds .* bytes/i);
  });
});
