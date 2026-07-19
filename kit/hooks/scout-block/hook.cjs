#!/usr/bin/env node
// vc scout-block — PreToolUse hook for Bash|Glob|Grep|Read. Stops the agent
// from wasting context searching generated trees (node_modules, dist, .git…).
// Project-level .vcignore (gitignore spec, negation supported) extends or
// re-allows the defaults. Build commands pass through. Fail-open throughout.
const path = require("node:path");
const fs = require("node:fs");

const LIB = [path.join(__dirname, "_lib"), path.join(__dirname, "..", "_lib")].find((d) =>
  fs.existsSync(d),
);
const { failOpen, readStdinJson } = require(path.join(LIB, "fail-open.cjs"));
const ignore = require(path.join(LIB, "vendor-ignore.cjs"));

const DEFAULT_IGNORES = [
  "node_modules/", ".git/", "dist/", "build/", "out/", "coverage/",
  ".next/", ".nuxt/", ".turbo/", ".cache/", ".venv/", "__pycache__/",
  ".pytest_cache/", ".mypy_cache/", "target/", "vendor/",
];

// First-token commands that legitimately touch generated trees.
const ALLOWED_COMMANDS = new Set([
  "npm", "pnpm", "yarn", "bun", "node", "npx", "tsc", "vite", "next",
  "go", "cargo", "rustc", "make", "cmake", "git", "gh",
  "pip", "pip3", "python", "python3", "pytest", "uv", "poetry",
]);

function buildMatcher(vcignoreContent) {
  return ignore().add(DEFAULT_IGNORES).add(vcignoreContent || "");
}

/** True when a path-ish candidate falls inside an ignored tree. */
function deniedPath(candidate, ig) {
  const cleaned = String(candidate)
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/^\.\//, "")
    .replace(/^\/+/, ""); // absolute → treat as relative; dir patterns match at any depth
  if (!cleaned || cleaned === "." || cleaned.startsWith("..")) return false;
  try {
    return ig.ignores(cleaned) || ig.ignores(`${cleaned.replace(/\/+$/, "")}/`);
  } catch {
    return false;
  }
}

function globLiteralPrefix(pattern) {
  const cut = String(pattern).search(/[*?[{]/);
  return cut === -1 ? String(pattern) : String(pattern).slice(0, cut);
}

function bashDeniedToken(command, ig) {
  const tokens = String(command).split(/\s+/).filter(Boolean);
  let first = true;
  for (const raw of tokens) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(raw)) continue; // env assignment prefix
    if (first) {
      first = false;
      if (ALLOWED_COMMANDS.has(path.basename(raw.replace(/^['"]+|['"]+$/g, "")))) return null;
      continue;
    }
    if (raw.startsWith("-")) continue; // flags
    const cleaned = raw.replace(/[;|&<>()]+$/g, "");
    if (deniedPath(cleaned, ig)) return cleaned;
  }
  return null;
}

/** Returns {decision:"allow"} or {decision:"deny", target}. */
function evaluateScout(toolName, toolInput, ig) {
  const input = toolInput || {};
  if (toolName === "Bash") {
    const hit = bashDeniedToken(String(input.command || ""), ig);
    return hit ? { decision: "deny", target: hit } : { decision: "allow" };
  }
  const candidates = [];
  if (toolName === "Glob") candidates.push(globLiteralPrefix(input.pattern || ""), input.path);
  if (toolName === "Grep") candidates.push(input.path);
  if (toolName === "Read") candidates.push(input.file_path);
  for (const c of candidates) {
    if (c && deniedPath(c, ig)) return { decision: "deny", target: String(c) };
  }
  return { decision: "allow" };
}

function main() {
  const input = readStdinJson();
  if (!input) return;
  let vcignore = "";
  try {
    vcignore = fs.readFileSync(path.join(input.cwd || process.cwd(), ".vcignore"), "utf8");
  } catch {
    // no project overrides
  }
  const result = evaluateScout(input.tool_name, input.tool_input, buildMatcher(vcignore));
  if (result.decision === "deny") {
    process.stderr.write(
      `vc scout-block: "${result.target}" is inside a generated/vendored tree — searching it wastes context.\n` +
        `If you really need it, add a negation line (e.g. "!${result.target}") to .vcignore in the project root.\n`,
    );
    process.exit(2);
  }
}

if (require.main === module) failOpen("scout-block", main);
module.exports = { buildMatcher, evaluateScout };
