// Cheap filesystem-only project detection (no child processes — this runs on
// every session start). Returns safe defaults instead of throwing.
const fs = require("node:fs");
const path = require("node:path");

const FRAMEWORKS = ["next", "nuxt", "astro", "svelte", "vue", "react", "express", "fastify", "nestjs", "hono"];

function has(cwd, file) {
  try {
    return fs.existsSync(path.join(cwd, file));
  } catch {
    return false;
  }
}

function detectPackageManager(cwd) {
  if (has(cwd, "pnpm-lock.yaml")) return "pnpm";
  if (has(cwd, "yarn.lock")) return "yarn";
  if (has(cwd, "bun.lockb") || has(cwd, "bun.lock")) return "bun";
  if (has(cwd, "package.json")) return "npm";
  return null;
}

function detectFramework(cwd) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return FRAMEWORKS.find((f) => deps && deps[f]) ?? null;
  } catch {
    return null;
  }
}

function detectBranch(cwd) {
  try {
    const head = fs.readFileSync(path.join(cwd, ".git", "HEAD"), "utf8").trim();
    const ref = head.match(/^ref: refs\/heads\/(.+)$/);
    return ref ? ref[1] : head.slice(0, 12); // detached HEAD: short sha
  } catch {
    return null;
  }
}

function detectType(cwd) {
  if (has(cwd, "package.json")) return "node";
  if (has(cwd, "go.mod")) return "go";
  if (has(cwd, "Cargo.toml")) return "rust";
  if (has(cwd, "pyproject.toml") || has(cwd, "requirements.txt")) return "python";
  return "unknown";
}

function detectProject(cwd) {
  return {
    type: detectType(cwd),
    packageManager: detectPackageManager(cwd),
    framework: detectFramework(cwd),
    branch: detectBranch(cwd),
  };
}

module.exports = { detectProject };
