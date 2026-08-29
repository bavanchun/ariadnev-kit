// `av init`, `av new`, `av projects …`, `av setup` — the project lifecycle.
//
// Registered together because they are one system: `init` sets a directory up
// and records it, `new` scaffolds then calls `init`, `projects` reads and edits
// what those recorded, and `setup` writes the config they all resolve against.

import type { Command } from "commander";
import { recordActivity } from "../activity/emit.js";
import { lifecycleRoots, withLifecycleLock } from "../install/lifecycle-lock.js";
import { emit } from "./emit.js";
import { runInit } from "./init-command.js";
import { runNew } from "./new-command.js";
import {
  runProjectsAdd,
  runProjectsList,
  runProjectsPrune,
  runProjectsRemove,
  runProjectsShow,
} from "./projects-command.js";
import { runSetup, SETUP_STEP_NAMES } from "./setup-command.js";
import { nowStamp } from "./timestamp.js";
import type { CommandRegistrationContext, GlobalOpts } from "./command-registration-context.js";
import type { LeafValue } from "../config/config-schema.js";

function splitList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

interface InitOpts {
  provider?: string[];
  force?: boolean;
  projectId?: string;
  json?: boolean;
}

export function registerProjectCommands(program: Command, context: CommandRegistrationContext): void {
  program
    .command("init")
    .description("Set up a project directory and register it")
    .argument("[dir]", "directory to initialize (default: the current one)")
    .option("--provider <list>", "comma-separated provider ids", splitList)
    .option("--project-id <name>", "register the project under this name instead of the directory name")
    .option("--force", "overwrite files edited since a previous run", false)
    .option("--json", "emit the machine envelope instead of the text report", false)
    .action(async (dir: string | undefined, opts: InitOpts) => {
      const global = program.opts<GlobalOpts>();
      const { summary, dir: target } = await withLifecycleLock(
        global.dryRun ? [] : lifecycleRoots(global),
        "init",
        () =>
          runInit({
            ...(dir ? { dir } : {}),
            ...(opts.provider ? { providers: opts.provider } : {}),
            ...(opts.projectId ? { projectId: opts.projectId } : {}),
            home: global.home,
            cwd: global.cwd,
            timestamp: nowStamp(),
            now: new Date().toISOString(),
            dryRun: !!global.dryRun,
            force: !!opts.force,
            ariadnevVersion: context.version,
            json: !!opts.json,
          }),
      );
      emit(summary);
      if (!global.dryRun) recordActivity(global.home, "project.initialized", { status: "ok" });
      void target;
    });

  program
    .command("new")
    .description("Create a project directory and initialize it")
    .argument("<name>", "directory to create")
    .option("--provider <list>", "comma-separated provider ids", splitList)
    .option("--json", "emit the machine envelope instead of the text report", false)
    .action(async (name: string, opts: InitOpts) => {
      const global = program.opts<GlobalOpts>();
      const { summary } = await withLifecycleLock(
        global.dryRun ? [] : lifecycleRoots(global),
        "new",
        () =>
          runNew({
            name,
            ...(opts.provider ? { providers: opts.provider } : {}),
            home: global.home,
            cwd: global.cwd,
            timestamp: nowStamp(),
            now: new Date().toISOString(),
            dryRun: !!global.dryRun,
            ariadnevVersion: context.version,
            json: !!opts.json,
          }),
      );
      emit(summary);
      if (!global.dryRun) recordActivity(global.home, "project.initialized", { status: "ok" });
    });

  registerProjectsGroup(program);
  registerSetup(program);
}

function registerProjectsGroup(program: Command): void {
  const projects = program
    .command("projects")
    .description("Index of the directories ariadnev has initialized");

  projects
    .command("list")
    .description("List registered projects")
    .option("--json", "emit a stable versioned JSON envelope", false)
    .action((opts: { json?: boolean }) => {
      const global = program.opts<GlobalOpts>();
      emit(runProjectsList({ home: global.home, json: !!opts.json }));
    });

  projects
    .command("add")
    .description("Register an existing directory without installing into it")
    .argument("<dir>", "directory to register")
    .option("--name <name>", "register under this name instead of the directory name")
    .option("--json", "emit a stable versioned JSON envelope", false)
    .action(async (dir: string, opts: { name?: string; json?: boolean }) => {
      const global = program.opts<GlobalOpts>();
      const summary = await withLifecycleLock(lifecycleRoots(global), "projects add", () =>
        runProjectsAdd({
          home: global.home,
          dir,
          ...(opts.name ? { name: opts.name } : {}),
          now: new Date().toISOString(),
          json: !!opts.json,
        }));
      emit(summary);
      recordActivity(global.home, "project.registered", { status: "ok" });
    });

  projects
    .command("remove")
    .description("Deregister a project. Deletes nothing on disk")
    .argument("<nameOrPath>", "project name or directory")
    .option("--json", "emit a stable versioned JSON envelope", false)
    .action(async (nameOrPath: string, opts: { json?: boolean }) => {
      const global = program.opts<GlobalOpts>();
      const summary = await withLifecycleLock(lifecycleRoots(global), "projects remove", () =>
        runProjectsRemove({ home: global.home, nameOrPath, json: !!opts.json }));
      emit(summary);
      recordActivity(global.home, "project.deregistered", { status: "ok" });
    });

  projects
    .command("show")
    .description("Show one registered project")
    .argument("<nameOrPath>", "project name or directory")
    .option("--json", "emit a stable versioned JSON envelope", false)
    .action((nameOrPath: string, opts: { json?: boolean }) => {
      const global = program.opts<GlobalOpts>();
      emit(runProjectsShow({ home: global.home, nameOrPath, json: !!opts.json }));
    });

  projects
    .command("prune")
    .description("Drop registry entries whose directory is gone. Deletes nothing on disk")
    .option("--all", "drop every entry, not only the ones whose directory is gone", false)
    .option("--force", "required safety gate when using --all", false)
    .option("--json", "emit a stable versioned JSON envelope", false)
    .action(async (opts: { all?: boolean; force?: boolean; json?: boolean }) => {
      const global = program.opts<GlobalOpts>();
      const summary = await withLifecycleLock(lifecycleRoots(global), "projects prune", () =>
        runProjectsPrune({
          home: global.home,
          all: !!opts.all,
          force: !!opts.force,
          // `--yes` is the global confirmation flag this CLI already has; the
          // captured surface spells it on the subcommand. One meaning, one flag.
          yes: !!global.yes,
          json: !!opts.json,
        }));
      emit(summary);
    });
}

function registerSetup(program: Command): void {
  program
    .command("setup")
    .description("Configure ariadnev. Writes no credentials")
    .option("--step <list>", `limit to these steps (${SETUP_STEP_NAMES.join(", ")})`, splitList)
    .option("--config <file>", "JSON file of \"config.path\": value pairs")
    .option("--no-interactive", "apply --config without prompting")
    .option("--json", "emit a stable versioned JSON envelope", false)
    .action(async (opts: { step?: string[]; config?: string; interactive?: boolean; json?: boolean }) => {
      const global = program.opts<GlobalOpts>();
      // Non-interactive whenever there is no TTY to prompt on, not only when
      // asked. A wizard that blocks on a prompt nobody can answer is how a CI
      // run hangs until it is killed.
      const interactive = opts.interactive !== false && process.stdout.isTTY === true;
      let values: Record<string, LeafValue> | undefined;
      if (interactive) {
        const { promptSetup } = await import("./prompt-setup.js");
        values = await promptSetup(opts.step);
      }
      const summary = await withLifecycleLock(lifecycleRoots(global), "setup", () =>
        runSetup({
          home: global.home,
          cwd: global.cwd,
          ...(opts.step ? { steps: opts.step } : {}),
          ...(values ? { values } : {}),
          ...(opts.config ? { configFile: opts.config } : {}),
          interactive,
          json: !!opts.json,
        }).summary);
      emit(summary);
    });
}
