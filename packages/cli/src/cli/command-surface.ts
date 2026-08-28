// The real command tree, read off the Commander registrations rather than
// written down. A hand-kept table of subcommand names is the thing the
// av-invocation lint exists to catch, one level up: it would drift the first
// time someone adds a subcommand and forgets the table, and the lint would then
// certify prose against a stale surface.

import { Command, type Option } from "commander";
import type { CommandNode, CommandSurface } from "../kit/av-invocation-lint.js";
import type { CommandRegistrationContext } from "./command-registration-context.js";
import { registerArtifactCommands } from "./register-artifact-commands.js";
import { registerCatalogCommands } from "./register-catalog-commands.js";
import { registerConfigCommands } from "./register-config-commands.js";
import { registerHarnessCommands } from "./register-harness-commands.js";
import { registerInstallCommands } from "./register-install-commands.js";
import { registerProjectCommands } from "./register-project-commands.js";
import { registerMaintenanceCommands } from "./register-maintenance-commands.js";
import { registerQualityCommands } from "./register-quality-commands.js";
import { registerTier1Commands } from "./register-tier1-commands.js";

/** Commander attaches these itself and they work on every command, but they are
 *  not in `command.options`, so the walk has to put them back. */
const UNIVERSAL_FLAGS = ["--help", "-h"];

function optionNames(option: Option): string[] {
  return [option.short, option.long].filter((name): name is string => typeof name === "string");
}

/** One Commander command and everything under it, as the shape the lint reads. */
export function surfaceOf(command: Command): CommandNode {
  const flags = new Set<string>(UNIVERSAL_FLAGS);
  const valueFlags = new Set<string>();
  for (const option of command.options) {
    for (const name of optionNames(option)) {
      flags.add(name);
      // `--plan <name>` swallows the next token; without this the lint reads
      // that token as a subcommand and reports whatever the example used.
      if (option.required || option.optional) valueFlags.add(name);
    }
  }

  const subcommands = new Map<string, CommandNode>();
  for (const sub of command.commands) {
    const child = surfaceOf(sub);
    subcommands.set(sub.name(), child);
    for (const alias of sub.aliases()) subcommands.set(alias, child);
  }
  // `av help <command>` is Commander's, on every command that has children.
  if (subcommands.size > 0) {
    subcommands.set("help", {
      flags: new Set(UNIVERSAL_FLAGS),
      valueFlags: new Set(),
      subcommands: new Map(),
      acceptsPositional: true,
    });
  }

  // `av run [workflow]` declares both children and a positional, so a word after
  // it is a workflow ID. Read off Commander rather than listed here, so a command
  // that gains an argument stops being misreported without anyone remembering
  // this file.
  return { flags, valueFlags, subcommands, acceptsPositional: command.registeredArguments.length > 0 };
}

/**
 * A throwaway program carrying the same registrations as the real one.
 *
 * Deliberately not `buildProgram()`: `index.ts` reaches this module through
 * `register-quality-commands` → `validate-command`, and importing it back would
 * close a cycle for the sake of a tree that the `register*` functions define
 * anyway. `command-surface.test.ts` compares this tree against the real
 * program's, so the two cannot drift apart in silence.
 *
 * Only names matter here, so the version and the context are placeholders.
 * Registration is pure wiring — options and action callbacks Commander does not
 * run until `parseAsync` — and the same test holds that property.
 */
function surfaceProgram(): Command {
  const program = new Command();
  program
    .name("ariadnev")
    .version("0.0.0")
    .option("--home <dir>", "override home root")
    .option("--cwd <dir>", "override project root")
    .option("--dry-run", "plan only, write nothing", false)
    .option("--yes", "skip interactive prompts", false);

  const context: CommandRegistrationContext = {
    version: "0.0.0",
    outColor: () => false,
    record: () => undefined,
  };
  registerInstallCommands(program, context);
  registerProjectCommands(program, context);
  registerMaintenanceCommands(program, context);
  registerQualityCommands(program, context);
  registerCatalogCommands(program, context);
  registerArtifactCommands(program);
  registerConfigCommands(program, context);
  registerTier1Commands(program, context);
  registerHarnessCommands(program);
  return program;
}

/** Build the surface the av-invocation lint checks kit content against. */
export function commandSurface(): CommandSurface {
  return surfaceOf(surfaceProgram());
}
