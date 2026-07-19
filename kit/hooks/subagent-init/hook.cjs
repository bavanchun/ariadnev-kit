#!/usr/bin/env node
// vc subagent-init — SubagentStart hook. Injects ~200 tokens of context into
// a freshly spawned subagent: agent type, paths, naming pattern, git branch.
// Fail-open: any error exits 0.
const path = require("node:path");
const fs = require("node:fs");

const LIB = [path.join(__dirname, "_lib"), path.join(__dirname, "..", "_lib")].find((d) =>
  fs.existsSync(d),
);
const { failOpen, readStdinJson } = require(path.join(LIB, "fail-open.cjs"));
const { detectProject } = require(path.join(LIB, "project-detect.cjs"));

function buildSubagentContext({ cwd, agentType, branch }) {
  const lines = [
    "## vc subagent context",
    `agent: ${agentType || "unknown"}`,
    `cwd: ${cwd}`,
    branch ? `branch: ${branch}` : null,
    "plans: plans/<yymmdd-hhmm>-<slug>/plan.md",
    "reports: plans/reports/<type>-<yymmdd-hhmm>-<slug>-report.md",
    "rules: .claude/rules/development-rules.md, delegation-protocol.md, intake-and-context.md",
  ].filter(Boolean);
  return `${lines.join("\n")}\n`;
}

function main() {
  const input = readStdinJson();
  const cwd = (input && input.cwd) || process.cwd();
  const agentType = (input && input.agent_type) || "unknown";
  const { branch } = detectProject(cwd);
  process.stdout.write(buildSubagentContext({ cwd, agentType, branch }));
}

if (require.main === module) failOpen("subagent-init", main);
module.exports = { buildSubagentContext };
