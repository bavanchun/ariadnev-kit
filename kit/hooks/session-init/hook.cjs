#!/usr/bin/env node
// vc session-init — SessionStart hook. Cheap filesystem-only project detection
// injected as session context (VC_* lines). Fail-open: any error exits 0.
const path = require("node:path");
const fs = require("node:fs");

// _lib sits beside this file after install, one level up in the kit source.
const LIB = [path.join(__dirname, "_lib"), path.join(__dirname, "..", "_lib")].find((d) =>
  fs.existsSync(d),
);
const { failOpen, readStdinJson } = require(path.join(LIB, "fail-open.cjs"));
const { detectProject } = require(path.join(LIB, "project-detect.cjs"));

function buildContext(project) {
  const lines = [
    `VC_PROJECT_TYPE=${project.type}`,
    project.packageManager ? `VC_PACKAGE_MANAGER=${project.packageManager}` : null,
    project.framework ? `VC_FRAMEWORK=${project.framework}` : null,
    project.branch ? `VC_GIT_BRANCH=${project.branch}` : null,
  ].filter(Boolean);
  return `## vc session\n${lines.join("\n")}\n`;
}

function main() {
  const input = readStdinJson();
  const cwd = (input && input.cwd) || process.cwd();
  process.stdout.write(buildContext(detectProject(cwd)));
}

if (require.main === module) failOpen("session-init", main);
module.exports = { buildContext };
