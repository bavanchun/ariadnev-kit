import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolvePreviousStable } from "./resolve-previous-stable.mjs";

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ariadnev-previous-stable-"));
  git(root, "init", "-b", "main");
  git(root, "config", "user.email", "fixture@example.com");
  git(root, "config", "user.name", "Fixture");
  return root;
}

function commitVersion(root, version, tag) {
  const directory = join(root, "packages", "cli");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "package.json"), `${JSON.stringify({ name: "ariadnev", version })}\n`);
  git(root, "add", ".");
  git(root, "commit", "-m", `release ${version}`);
  if (tag) git(root, "tag", tag);
  return git(root, "rev-parse", "HEAD");
}

test("resolves the greatest stable tag below the candidate version", () => {
  const root = fixture();
  try {
    commitVersion(root, "0.9.0", "ariadnev@0.9.0");
    const expectedSha = commitVersion(root, "0.10.0", "ariadnev@0.10.0");
    commitVersion(root, "0.11.0");
    assert.deepEqual(resolvePreviousStable({ repositoryRoot: root, currentVersion: "0.11.0" }), {
      schemaVersion: 1,
      releaseTag: "ariadnev@0.10.0",
      productSha: expectedSha,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolves across the rename — a pre-rename tag is still a predecessor", () => {
  // The first ariadnev release has no ariadnev@ predecessor, but the repo's
  // release history did not restart at the rename. Ignoring the old prefix
  // would make the first release look like it had no predecessor at all.
  const root = fixture();
  try {
    const expectedSha = commitVersion(root, "0.12.0", "vcskill@0.12.0"); // brand-drift-allow: pre-rename tag grammar
    commitVersion(root, "1.0.0");
    assert.deepEqual(resolvePreviousStable({ repositoryRoot: root, currentVersion: "1.0.0" }), {
      schemaVersion: 1,
      releaseTag: "vcskill@0.12.0", // brand-drift-allow: pre-rename tag grammar
      productSha: expectedSha,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("prefers the current tag grammar when both spellings exist at the same version", () => {
  const root = fixture();
  try {
    commitVersion(root, "1.0.0", "vcskill@1.0.0"); // brand-drift-allow: pre-rename tag grammar
    git(root, "tag", "ariadnev@1.0.0");
    commitVersion(root, "1.1.0");
    const resolved = resolvePreviousStable({ repositoryRoot: root, currentVersion: "1.1.0" });
    assert.equal(resolved.releaseTag, "ariadnev@1.0.0");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("fails closed when predecessor metadata is missing or mismatched", () => {
  const missing = fixture();
  const mismatched = fixture();
  try {
    commitVersion(missing, "0.9.0", "ariadnev@0.9.0");
    assert.throws(() => resolvePreviousStable({ repositoryRoot: missing, currentVersion: "0.9.0" }), /no previous stable/i);
    commitVersion(mismatched, "0.9.0", "ariadnev@0.10.0");
    assert.throws(() => resolvePreviousStable({ repositoryRoot: mismatched, currentVersion: "0.11.0" }), /tag\/version drift/i);
  } finally {
    rmSync(missing, { recursive: true, force: true });
    rmSync(mismatched, { recursive: true, force: true });
  }
});
