#!/usr/bin/env node
// vc privacy-block — PreToolUse hook for Read|Edit|Write|Bash. Denies access
// to secret-bearing files (.env family, key material, credentials) with an
// AskUserQuestion marker; user approval is expressed by re-running the command
// with a VC_APPROVED=1 prefix. Fail-open: internal errors never block.
const path = require("node:path");
const fs = require("node:fs");

const LIB = [path.join(__dirname, "_lib"), path.join(__dirname, "..", "_lib")].find((d) =>
  fs.existsSync(d),
);
const { failOpen, readStdinJson } = require(path.join(LIB, "fail-open.cjs"));

const ALLOWED_ENV = /^\.env\.(example|sample|template)$/;
const SENSITIVE_BASENAMES = [
  /^\.env(\..+)?$/,
  /\.(pem|key|p12|pfx)$/,
  /^id_(rsa|dsa|ecdsa|ed25519)(\..*)?$/,
  /credentials/,
  /^secrets\.(json|ya?ml|toml|env)$/,
];

function stripQuotes(s) {
  return s.replace(/^['"]+|['"]+$/g, "");
}

function isSensitiveBasename(base) {
  const b = base.toLowerCase();
  if (ALLOWED_ENV.test(b)) return false;
  return SENSITIVE_BASENAMES.some((re) => re.test(b));
}

function isSensitivePath(rawPath) {
  const cleaned = stripQuotes(String(rawPath).trim());
  if (!cleaned) return false;
  // normalize collapses traversal segments so "foo/../.env" -> ".env"
  if (isSensitiveBasename(path.basename(path.normalize(cleaned)))) return true;
  // symlink escape: check what the path actually resolves to
  try {
    const real = fs.realpathSync(cleaned);
    if (isSensitiveBasename(path.basename(real))) return true;
  } catch {
    // nonexistent path: the basename check above is all we can do
  }
  return false;
}

function findSensitiveInCommand(command) {
  if (/\bVC_APPROVED=1\b/.test(command)) return null;
  for (const token of command.split(/\s+/)) {
    const cleaned = stripQuotes(token.replace(/[;|&<>()]+$/g, ""));
    if (cleaned && isSensitivePath(cleaned)) return cleaned;
  }
  return null;
}

/** Pure-ish gate: returns {decision:"allow"} or {decision:"deny", file}. */
function evaluatePrivacy(toolName, toolInput) {
  const input = toolInput || {};
  if (toolName === "Bash") {
    const hit = findSensitiveInCommand(String(input.command || ""));
    return hit ? { decision: "deny", file: hit } : { decision: "allow" };
  }
  const filePath = input.file_path || input.path || input.notebook_path;
  if (filePath && isSensitivePath(filePath)) {
    return { decision: "deny", file: stripQuotes(String(filePath)) };
  }
  return { decision: "allow" };
}

function denyMarker(toolName, file) {
  const payload = {
    file,
    tool: toolName,
    reason: "This file may contain secrets (env vars, keys, or credentials).",
    question: `I need to access "${file}" which may contain sensitive data. Approve?`,
    options: [
      { label: "Yes, approve access", description: "Allow this access once" },
      { label: "No, skip this file", description: "Continue without it" },
    ],
    approve_hint:
      "If the user approves via AskUserQuestion, re-run the operation as a Bash command prefixed with VC_APPROVED=1 (e.g. `VC_APPROVED=1 cat \"<file>\"`).",
  };
  return `@@VC_PRIVACY_START@@${JSON.stringify(payload)}@@VC_PRIVACY_END@@`;
}

function main() {
  const input = readStdinJson();
  if (!input) return;
  const result = evaluatePrivacy(input.tool_name, input.tool_input);
  if (result.decision === "deny") {
    process.stderr.write(
      `vc privacy-block: access to "${result.file}" requires user approval.\n${denyMarker(input.tool_name, result.file)}\n`,
    );
    process.exit(2);
  }
}

if (require.main === module) failOpen("privacy-block", main);
module.exports = { evaluatePrivacy };
