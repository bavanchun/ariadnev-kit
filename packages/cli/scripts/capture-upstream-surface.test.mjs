import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseSubcommands, parseTopLevel } from "./capture-upstream-surface.mjs";

// The fixtures below are shaped like the real help output and worded like
// nothing in particular. That is not squeamishness: check-brand-drift.mjs fails
// CI on any upstream identifier under packages/, and a fixture copied verbatim
// would carry one on every line. The parser reads structure — two-space indent,
// a name, a run of spaces, a summary — so structure is what has to be right.

const TOP = `Some CLI

A tool.

Usage:
  tool [command]

Examples:
  tool init

Project lifecycle:
  init                 Start a project
  self-update          Apply signed updates
  plan                 Manage plan directories

Inspect & diagnose:
  activity             Inspect the local feed
  content-search       Opt-in local search
  help                 Help about any command

Options:
  -h, --help      help for tool
  -v, --version   version for tool

Use "tool [command] --help" for more info.
`;

test("reads every command under every group heading", () => {
  assert.deepEqual(parseTopLevel(TOP).map((entry) => entry.name), [
    "init", "self-update", "plan", "activity", "content-search", "help",
  ]);
});

test("keeps the group each command was listed under", () => {
  const groups = Object.fromEntries(parseTopLevel(TOP).map((entry) => [entry.name, entry.group]));
  assert.equal(groups.init, "Project lifecycle");
  assert.equal(groups.activity, "Inspect & diagnose");
});

test("does not mistake the Options, Usage or Examples blocks for commands", () => {
  const names = parseTopLevel(TOP).map((entry) => entry.name);
  // `tool` appears twice indented under Usage and Examples, and the flag lines
  // under Options are indented the same way command lines are.
  assert.ok(!names.includes("tool"));
  assert.ok(!names.some((name) => name.startsWith("-")));
});

test("returns nothing for help with no command groups at all", () => {
  assert.deepEqual(parseTopLevel("Usage:\n  tool [flags]\n\nOptions:\n  -h, --help\n"), []);
});

const SUB = `Manage plan directories

Usage:
  tool plan [command]

Available Commands:
  list        List plans
  show        Show one plan
  use         Point at a plan

Flags:
  -h, --help   help for plan
`;

test("reads subcommand names and stops at the next block", () => {
  assert.deepEqual(parseSubcommands(SUB), ["list", "show", "use"]);
});

test("returns nothing for a leaf command", () => {
  assert.deepEqual(parseSubcommands("Do one thing\n\nUsage:\n  tool doctor [flags]\n\nFlags:\n  -h, --help\n"), []);
});
