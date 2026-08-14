#!/usr/bin/env node
// av rules-inject — UserPromptSubmit hook. Injects project rules from
// .claude/rules/*.md once per session (re-injects when rules change),
// throttled via a scope-key state file. Fail-open throughout.
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const crypto = require("node:crypto");

const LIB = [path.join(__dirname, "_lib"), path.join(__dirname, "..", "_lib")].find((d) =>
  fs.existsSync(d),
);
const { failOpen, readStdinJson } = require(path.join(LIB, "fail-open.cjs"));
const { atomicWrite } = require(path.join(LIB, "atomic-write.cjs"));

const MAX_CONTEXT_CHARS = 8000;
const STATE_TTL_MS = 24 * 60 * 60 * 1000; // prune session entries after a day

function buildRulesContext(rules) {
  const body = rules.map((r) => `### ${r.name}\n${r.content.trim()}`).join("\n\n");
  const block = `## Project rules (av)\n${body}\n`;
  return block.length > MAX_CONTEXT_CHARS
    ? `${block.slice(0, MAX_CONTEXT_CHARS - 15)}\n[truncated]\n`
    : block;
}

function computeScopeKey(cwd, ruleContents) {
  return crypto.createHash("sha256").update(cwd).update("\0").update(ruleContents.join("\0")).digest("hex");
}

/** Inject when this session has not yet seen this exact rules snapshot. */
function shouldInject(state, sessionId, key, nowMs) {
  const prev = state[sessionId];
  if (!prev) return true;
  if (prev.key !== key) return true;
  return nowMs - prev.ts > STATE_TTL_MS;
}

function statePath() {
  return path.join(os.homedir(), ".claude", "av-state", "rules-inject.json");
}

function loadState(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function pruneState(state, nowMs) {
  const out = {};
  for (const [sid, entry] of Object.entries(state)) {
    if (entry && nowMs - entry.ts <= STATE_TTL_MS) out[sid] = entry;
  }
  return out;
}

function readRules(cwd) {
  const dir = path.join(cwd, ".claude", "rules");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => ({ name: f.replace(/\.md$/, ""), content: fs.readFileSync(path.join(dir, f), "utf8") }));
}

function main() {
  const input = readStdinJson();
  if (!input) return;
  const cwd = input.cwd || process.cwd();
  const sessionId = input.session_id || "unknown-session";
  const rules = readRules(cwd);
  if (rules.length === 0) return;
  const key = computeScopeKey(cwd, rules.map((r) => r.content));
  const now = Date.now();
  const file = statePath();
  const state = pruneState(loadState(file), now);
  if (!shouldInject(state, sessionId, key, now)) return;
  process.stdout.write(buildRulesContext(rules));
  state[sessionId] = { key, ts: now };
  atomicWrite(file, JSON.stringify(state));
}

if (require.main === module) failOpen("rules-inject", main);
module.exports = { buildRulesContext, computeScopeKey, shouldInject };
