#!/usr/bin/env node
// vc session-state — Stop/SubagentStop hook. Persists a small markdown state
// snapshot per project so the next session can pick up context. Previous state
// is archived (max 5), everything expires after 7 days. Atomic writes,
// fail-open throughout.
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const LIB = [path.join(__dirname, "_lib"), path.join(__dirname, "..", "_lib")].find((d) =>
  fs.existsSync(d),
);
const { failOpen, readStdinJson } = require(path.join(LIB, "fail-open.cjs"));
const { atomicWrite } = require(path.join(LIB, "atomic-write.cjs"));
const { detectProject } = require(path.join(LIB, "project-detect.cjs"));

const MAX_ARCHIVES = 5;
const TTL_MS = 7 * 24 * 3600 * 1000;

function cwdHash(cwd) {
  return crypto.createHash("sha256").update(cwd).digest("hex").slice(0, 16);
}

/** git status --short lines for cwd; [] outside a repo or on any failure. */
function gitFilesChanged(cwd) {
  try {
    const out = execFileSync("git", ["status", "--short"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return out.split("\n").filter((l) => l.trim().length > 0);
  } catch {
    return [];
  }
}

function buildStateMarkdown(input, project, now, filesChanged) {
  const outcome = filesChanged.length === 0 ? "clean" : `${filesChanged.length} files changed`;
  return [
    "# vc session state",
    "",
    `- updated: ${now.toISOString()}`,
    `- session: ${input.session_id || "unknown"}`,
    `- event: ${input.hook_event_name || "Stop"}`,
    `- cwd: ${input.cwd || ""}`,
    `- project: ${project.type}${project.packageManager ? ` (${project.packageManager})` : ""}`,
    `- branch: ${project.branch || "n/a"}`,
    `- outcome: ${outcome}`,
    "",
    "## Files changed",
    filesChanged.length === 0 ? "(none)" : filesChanged.map((l) => `- ${l.trim()}`).join("\n"),
    "",
  ].join("\n");
}

/** Cap archives at MAX_ARCHIVES (newest kept) and drop anything past TTL. */
function pruneStateDir(dir, nowMs) {
  const archives = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("archive-"))
    .sort()
    .reverse(); // name embeds timestamp: sort desc = newest first
  for (const [i, f] of archives.entries()) {
    const abs = path.join(dir, f);
    const expired = nowMs - fs.statSync(abs).mtimeMs > TTL_MS;
    if (i >= MAX_ARCHIVES || expired) fs.rmSync(abs, { force: true });
  }
}

function archiveStamp(now) {
  return now.toISOString().replace(/[-:T]/g, "").slice(0, 15).replace(/^(\d{8})/, "$1-");
}

function main() {
  const input = readStdinJson();
  if (!input) return;
  const cwd = input.cwd || process.cwd();
  const now = new Date();
  const dir = path.join(os.homedir(), ".claude", "session-states", cwdHash(cwd));
  fs.mkdirSync(dir, { recursive: true });
  const latest = path.join(dir, "latest.md");
  if (fs.existsSync(latest)) {
    fs.renameSync(latest, path.join(dir, `archive-${archiveStamp(now)}.md`));
  }
  atomicWrite(latest, buildStateMarkdown(input, detectProject(cwd), now, gitFilesChanged(cwd)));
  pruneStateDir(dir, now.getTime());
}

if (require.main === module) failOpen("session-state", main);
module.exports = { buildStateMarkdown, cwdHash, pruneStateDir, gitFilesChanged };
