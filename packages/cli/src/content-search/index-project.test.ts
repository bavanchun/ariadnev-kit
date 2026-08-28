import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectCandidates, indexProject, looksBinary, MAX_FILE_BYTES } from "./index-project.js";
import { closeShard, openShard } from "./shard.js";
import { gitignoreMatcher, isAlwaysDenied, parseGitignore } from "./ignore-rules.js";

const dirs: string[] = [];
const mk = () => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-index-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const NOW = "2026-08-28T00:00:00.000Z";

function write(root: string, relative: string, body: string): void {
  const path = join(root, relative);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, body);
}

/** Every path the walk would index, project-relative. */
function indexed(root: string): string[] {
  return collectCandidates(root).candidates.map((candidate) => candidate.relative).sort();
}

describe("the shard never indexes a secret", () => {
  // The shard is plaintext at rest. A missing search result is recoverable by
  // re-indexing; an indexed private key is not.

  it("refuses dotenv files whatever the project's own hygiene", () => {
    // Deriving this from `.gitignore` would protect the repos that need it
    // least: a project that forgot to ignore its `.env` is the exact case.
    const root = mk();
    write(root, "src/app.ts", "const x = 1;\n");
    write(root, ".env", "AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI\n");
    write(root, ".env.production", "DATABASE_URL=postgres://u:p@h/db\n");

    expect(indexed(root)).toEqual(["src/app.ts"]);
  });

  it("refuses key material by extension and by name", () => {
    const root = mk();
    write(root, "keep.md", "readme\n");
    for (const secret of ["server.pem", "tls.key", "bundle.p12", "id_rsa", "id_ed25519.pub", "credentials"]) {
      write(root, secret, "-----BEGIN PRIVATE KEY-----\n");
    }

    expect(indexed(root)).toEqual(["keep.md"]);
  });

  it("refuses them case-insensitively", () => {
    // `.ENV` on a case-insensitive filesystem is the same file and the same risk.
    const root = mk();
    write(root, ".ENV", "TOKEN=1\n");
    write(root, "Server.PEM", "key\n");
    expect(indexed(root)).toEqual([]);
  });

  it("never descends into .git or .ssh", () => {
    const root = mk();
    write(root, ".git/config", "[core]\n");
    write(root, ".ssh/known_hosts", "host key\n");
    write(root, "main.ts", "code\n");
    expect(indexed(root)).toEqual(["main.ts"]);
  });

  it("keeps the denied content out of the shard itself, not only out of the walk", () => {
    // Asserted against the stored rows rather than the plan, because the shard
    // is what an attacker would read.
    const home = mk();
    const root = mk();
    write(root, "app.ts", "const marker = 'INDEXED_MARKER';\n");
    write(root, ".env", "SECRET=SHOULD_NEVER_BE_INDEXED\n");

    const shard = openShard(home, root);
    try {
      const report = indexProject(shard, root, NOW);
      expect(report.skipped.denied, "the denylist actually ran").toBe(1);
      const bodies = JSON.stringify(shard.database.prepare("SELECT path, body FROM docs").all());
      expect(bodies).toContain("INDEXED_MARKER");
      expect(bodies).not.toContain("SHOULD_NEVER_BE_INDEXED");
    } finally {
      closeShard(shard);
    }
  });
});

describe("the project's own ignore rules", () => {
  it("honours .gitignore", () => {
    const root = mk();
    write(root, ".gitignore", "*.log\nsecrets/\n//root-only.txt\n");
    write(root, "app.ts", "code\n");
    write(root, "debug.log", "noise\n");
    write(root, "deep/nested/trace.log", "noise\n");
    write(root, "secrets/token.txt", "sensitive\n");

    expect(indexed(root)).toEqual([".gitignore", "app.ts"]);
  });

  it("lets a negation bring a file back", () => {
    const root = mk();
    write(root, ".gitignore", "*.log\n!keep.log\n");
    write(root, "drop.log", "noise\n");
    write(root, "keep.log", "wanted\n");

    expect(indexed(root)).toEqual([".gitignore", "keep.log"]);
  });

  it("cannot un-ignore a secret", () => {
    // The denylist is checked first and is not overridable, so a `.gitignore`
    // that negates it changes nothing.
    const root = mk();
    write(root, ".gitignore", "!.env\n");
    write(root, ".env", "TOKEN=1\n");
    expect(indexed(root)).toEqual([".gitignore"]);
  });

  it("parses comments and blanks away", () => {
    expect(parseGitignore("# a comment\n\n  \n*.log\n")).toHaveLength(1);
  });

  it("matches an unanchored pattern at any depth", () => {
    const matcher = gitignoreMatcher(parseGitignore("build\n"));
    expect(matcher.ignores("build", true)).toBe(true);
    expect(matcher.ignores("packages/cli/build", true)).toBe(true);
    expect(matcher.ignores("packages/cli/src", true)).toBe(false);
  });
});

describe("bounds", () => {
  it("skips a file past the size cap", () => {
    const root = mk();
    write(root, "small.txt", "x");
    write(root, "huge.txt", "x".repeat(MAX_FILE_BYTES + 1));

    const { candidates, skipped } = collectCandidates(root);

    expect(candidates.map((c) => c.relative)).toEqual(["small.txt"]);
    expect(skipped["too-large"]).toBe(1);
  });

  it("stores no binary content", () => {
    const home = mk();
    const root = mk();
    write(root, "text.txt", "readable\n");
    writeFileSync(join(root, "image.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]));

    const shard = openShard(home, root);
    try {
      const report = indexProject(shard, root, NOW);
      expect(report.documents).toBe(1);
      expect(report.skipped.binary).toBe(1);
    } finally {
      closeShard(shard);
    }
  });

  it("calls a NUL byte binary and plain text not", () => {
    // The NUL is a byte value here rather than a character in a string
    // literal: a raw control byte in the source makes the whole file read as
    // binary to every grep-shaped tool, a defect this repo already carries once.
    expect(looksBinary(Buffer.from([0x68, 0x69, 0x00, 0x21]))).toBe(true);
    expect(looksBinary(Buffer.from("plain text"))).toBe(false);
  });
});

describe("indexing replaces rather than accumulates", () => {
  it("drops a document whose file is gone", () => {
    // A full replacement every time is what keeps a stale path from answering a
    // search forever; there is no cheaper fingerprint than reading the file.
    const home = mk();
    const root = mk();
    write(root, "a.txt", "first\n");
    write(root, "b.txt", "second\n");

    const shard = openShard(home, root);
    try {
      expect(indexProject(shard, root, NOW).documents).toBe(2);
      rmSync(join(root, "b.txt"));
      expect(indexProject(shard, root, NOW).documents).toBe(1);
      expect(shard.database.prepare("SELECT path FROM docs").all()).toEqual([{ path: "a.txt" }]);
    } finally {
      closeShard(shard);
    }
  });
});

describe("the denylist itself", () => {
  it("names the shapes it refuses", () => {
    for (const name of [".env", ".env.local", "id_rsa", "x.pem", "y.key", ".npmrc", "secrets.json"]) {
      expect(isAlwaysDenied(name), name).toBe(true);
    }
    for (const name of ["app.ts", "README.md", "environment.ts", "keyboard.tsx"]) {
      expect(isAlwaysDenied(name), name).toBe(false);
    }
  });
});
