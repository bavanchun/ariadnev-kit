#!/usr/bin/env node
// Verify the packed tarball contains only expected files and that the
// entrypoint is executable. Runs `pnpm pack`, extracts to a temp directory,
// and asserts structural correctness. Designed to be called in CI or locally
// before publishing.

import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const pkgDir = resolve(fileURLToPath(import.meta.url), "../..");

// Step 1: Run prepack (build + bundle kit assets) and pack
console.log("→ Running prepack + pnpm pack...");
execSync("pnpm run prepack", { cwd: pkgDir, stdio: "inherit" });
execSync("pnpm pack", { cwd: pkgDir, stdio: "inherit" });

// Find the tarball
const tgzFiles = readdirSync(pkgDir).filter((f) => f.endsWith(".tgz"));
if (tgzFiles.length === 0) {
  console.error("✗ No .tgz file found after pnpm pack");
  process.exit(1);
}
const tgzPath = join(pkgDir, tgzFiles[tgzFiles.length - 1]);
console.log(`→ Tarball: ${tgzPath}`);

// Step 2: Extract to isolated temp directory
const tmpDir = mkdtempSync(join(tmpdir(), "vcskill-verify-"));
console.log(`→ Extracting to: ${tmpDir}`);
execSync(`tar xzf "${tgzPath}" -C "${tmpDir}"`, { stdio: "inherit" });

// npm/pnpm pack extracts into a `package/` subdirectory
const extractedDir = join(tmpDir, "package");

const errors = [];

// Assertion 1: dist/index.js exists and starts with shebang
const entrypoint = join(extractedDir, "dist", "index.js");
if (!existsSync(entrypoint)) {
  errors.push("dist/index.js not found in tarball");
} else {
  const content = readFileSync(entrypoint, "utf8");
  if (!content.startsWith("#!/usr/bin/env node")) {
    errors.push("dist/index.js does not start with #!/usr/bin/env node shebang");
  } else {
    console.log("✓ dist/index.js exists with correct shebang");
  }
}

// Assertion 2: No src/ or test/ TypeScript files in the archive
function findTsFiles(dir, relativeTo) {
  const results = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      results.push(...findTsFiles(full, relativeTo));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      results.push(full.replace(relativeTo + "/", ""));
    }
  }
  return results;
}

const tsFiles = findTsFiles(extractedDir, extractedDir);
const leakedSrcFiles = tsFiles.filter((f) => f.startsWith("src/") || f.startsWith("test/"));
if (leakedSrcFiles.length > 0) {
  errors.push(`Source/test .ts files leaked into tarball: ${leakedSrcFiles.join(", ")}`);
} else {
  console.log("✓ No src/ or test/ TypeScript files in tarball");
}

// Assertion 3: kit/ directory is bundled with expected templates
const kitDir = join(extractedDir, "kit");
if (!existsSync(kitDir)) {
  errors.push("kit/ directory not found in tarball");
} else {
  const kitSkillsDir = join(kitDir, "skills");
  if (!existsSync(kitSkillsDir)) {
    errors.push("kit/skills/ directory not found in tarball");
  } else {
    const skills = readdirSync(kitSkillsDir);
    const expectedSkills = ["hello-world", "echo-tool"];
    for (const expected of expectedSkills) {
      if (!skills.includes(expected)) {
        errors.push(`Expected kit skill "${expected}" not found in tarball`);
      }
    }
    if (errors.length === 0) {
      console.log(`✓ kit/skills/ contains expected templates: ${skills.join(", ")}`);
    }
  }
}

// Assertion 4: kit.config.json and portable-manifest.json present
for (const configFile of ["kit.config.json", "portable-manifest.json"]) {
  if (!existsSync(join(extractedDir, configFile))) {
    errors.push(`${configFile} not found in tarball`);
  } else {
    console.log(`✓ ${configFile} present`);
  }
}

// Assertion 5: package.json has correct bin mapping
const pkgJson = JSON.parse(readFileSync(join(extractedDir, "package.json"), "utf8"));
if (pkgJson.bin?.vcskill !== "dist/index.js") {
  errors.push(`bin.vcskill is "${pkgJson.bin?.vcskill}", expected "dist/index.js"`);
} else {
  console.log("✓ package.json bin mapping correct");
}

// Cleanup
rmSync(tmpDir, { recursive: true, force: true });

// Report
if (errors.length > 0) {
  console.error("\n✗ Verification FAILED:");
  for (const err of errors) console.error(`  - ${err}`);
  process.exit(1);
}
console.log("\n✓ All tarball verification checks passed");
