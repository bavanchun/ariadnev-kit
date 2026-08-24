#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const cli = process.env["ARIADNEV" + "_CLI"] || "av";
const result = spawnSync(cli, ["plan", "list"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

if (result.error) {
  console.error("[plans-kanban] av not found; install ariadnev CLI or set the CLI override.");
  process.exit(1);
}

process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");
process.exit(result.status || 0);
