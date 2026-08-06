import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const workflow = readFileSync(join(repoRoot, ".github", "workflows", "release.yml"), "utf8");

test("release notes use the public edge installer", () => {
  assert.match(workflow, /https:\/\/vcskill\.vchun\.dev\/install/);
  assert.doesNotMatch(workflow, /raw\.githubusercontent\.com\/bavanchun\/vcskill/);
});

test("release detection stays pinned to the pushed source commit", () => {
  assert.match(workflow, /SHA: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /git show "\$1:packages\/cli\/package\.json"/);
  assert.match(workflow, /CUR=\$\(ver "\$SHA"\)/);
});
