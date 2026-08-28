#!/usr/bin/env node
// capture-upstream-surface.mjs — read the upstream CLI's command surface off its
// own `--help` and write it out as data.
//
// A MAINTAINER TOOL. The upstream binary is not on CI and never will be, so
// nothing in a build may depend on this script. It is run by hand when a new
// upstream version appears, and its output is committed; CI reads the committed
// output, never the binary.
//
// Usage:
//   ARIADNEV_UPSTREAM_BIN=<binary-name> node packages/cli/scripts/capture-upstream-surface.mjs \
//     [--out <manifest.json>] [--raw-dir <dir>]
//
// THE BINARY NAME HAS NO DEFAULT, ON PURPOSE. check-brand-drift.mjs fails CI on
// any surviving upstream identifier anywhere outside its historical-record
// allowlist, and `packages/` is deliberately not on that list. A hardcoded
// default would put the identifier in the tree; a `brand-drift-allow:` opt-out
// would put it there with a note attached. Taking it from the environment keeps
// the tree clean without weakening the gate, which is the whole point of having
// one.
//
// FOR THE SAME REASON THE RAW HELP TEXT IS NEVER COMMITTED. Upstream help is
// saturated with the upstream product name — every summary line carries it. The
// raw capture goes to --raw-dir (default: a temp directory, printed at the end)
// so a mis-parse stays diffable by hand, and only the identifier-free
// classification reaches the repository. Committing the raw text would fail the
// gate on the first line.
//
// The manifest this writes carries names and structure only. Summaries are
// dropped for the same reason, and the classification prose is ours, written
// against what each command does rather than copied from what it says.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`missing value for ${name}`);
  return value;
}

function requireBinary() {
  const bin = process.env.ARIADNEV_UPSTREAM_BIN;
  if (bin) return bin;
  console.error("capture-upstream-surface: set ARIADNEV_UPSTREAM_BIN to the upstream CLI's binary name.");
  console.error("It has no default so that no upstream identifier lands in this repository — see the header.");
  process.exit(2);
}

/**
 * Command lines in the top-level help sit under a group heading, indented two
 * spaces, as `<name><run of spaces><summary>`. The summary is read only to know
 * where the name ends; it is deliberately not carried forward.
 */
export function parseTopLevel(text) {
  const commands = [];
  let group = "";
  for (const line of text.split("\n")) {
    const heading = /^([A-Z][^:]*):\s*$/.exec(line);
    if (heading) {
      group = heading[1];
      continue;
    }
    if (!group || group === "Options" || group === "Usage" || group === "Examples") continue;
    const entry = /^ {2}([a-z][a-z0-9-]*) {2,}\S/.exec(line);
    if (entry) commands.push({ name: entry[1], group });
  }
  return commands;
}

/** Subcommand names of one command, from its own help. Names only. */
export function parseSubcommands(text) {
  const names = [];
  let inCommands = false;
  for (const line of text.split("\n")) {
    if (/^(Available |)Commands:\s*$/.test(line)) {
      inCommands = true;
      continue;
    }
    if (/^\S/.test(line) && line.trim() !== "") inCommands = false;
    if (!inCommands) continue;
    const entry = /^ {2}([a-z][a-z0-9-]*) {2,}\S/.exec(line);
    if (entry) names.push(entry[1]);
  }
  return names;
}

// Only run the binary when invoked directly, so the parsers stay unit-testable.
// Everything that reads the environment or touches the filesystem lives inside
// this block for the same reason: `capture-upstream-surface.test.mjs` imports
// this module, and a top-level `process.exit` would take the test run with it.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const bin = requireBinary();
  const outPath = arg("--out", join(REPO, "parity-manifest.json"));
  const rawDir = arg("--raw-dir", mkdtempSync(join(tmpdir(), "upstream-surface-")));
  mkdirSync(rawDir, { recursive: true });
  const help = (args) => execFileSync(bin, [...args, "--help"], { encoding: "utf8", timeout: 30000 });

  const version = execFileSync(bin, ["--version"], { encoding: "utf8" }).trim().split(/\s+/).pop();
  const topText = help([]);
  writeFileSync(join(rawDir, "_top.txt"), topText);

  const captured = [];
  for (const { name, group } of parseTopLevel(topText)) {
    let subcommands = [];
    try {
      const text = help([name]);
      writeFileSync(join(rawDir, `${name}.txt`), text);
      subcommands = parseSubcommands(text);
    } catch {
      // A command that refuses --help (interactive, or gated behind a login) is
      // still part of the surface. Record the name and say the depth is unknown.
      subcommands = [];
    }
    captured.push({ name, group, subcommands });
  }

  // Preserve the hand-written classification across recaptures: this script
  // discovers names, it does not decide what to do about them.
  let previous = { commands: [] };
  try {
    previous = JSON.parse(readFileSync(outPath, "utf8"));
  } catch {
    /* first capture */
  }
  const decided = new Map(previous.commands.map((entry) => [entry.name, entry]));

  const manifest = {
    schemaVersion: 1,
    upstreamVersion: version,
    capturedAt: new Date().toISOString().slice(0, 10),
    ciBaselineSeconds: previous.ciBaselineSeconds ?? null,
    commands: captured.map(({ name, group, subcommands }) => ({
      name,
      group,
      subcommands,
      ...(decided.get(name) ? { status: decided.get(name).status, note: decided.get(name).note, target: decided.get(name).target } : { status: "unclassified", note: "", target: null }),
    })),
  };

  writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const unclassified = manifest.commands.filter((entry) => entry.status === "unclassified");
  console.log(`captured ${manifest.commands.length} commands from upstream ${version} -> ${outPath}`);
  console.log(`raw help retained in ${rawDir} (never commit it — it carries upstream identifiers)`);
  if (unclassified.length > 0) {
    console.log(`\n${unclassified.length} unclassified: ${unclassified.map((entry) => entry.name).join(", ")}`);
  }
}
