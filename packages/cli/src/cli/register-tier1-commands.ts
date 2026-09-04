// Registration for the commands added in the Tier-1 group: `plan`, `kit`, and
// `mcp`. Kept in one file because each group is a handful of lines of wiring —
// the behavior lives in the command modules, which are testable without
// Commander.

import { execFileSync } from "node:child_process";
import { lifecycleRoots, withLifecycleLock } from "../install/lifecycle-lock.js";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Command } from "commander";
import type { CommandRegistrationContext, GlobalOpts } from "./command-registration-context.js";
import { loadConfig, realLoadDeps } from "../config/load-config.js";
import { emit } from "./emit.js";
import { EXIT, UsageError } from "./exit-codes.js";
import { runKitInstallPath, runKitRefresh } from "./kit-command.js";
import { planStamp } from "../plan/plan-scaffold.js";
import { realVerifyDeps, runMcpAdd, runMcpLink, runMcpList, runMcpRemove, runMcpShow, runMcpVerify } from "./mcp-command.js";
import {
  runPlanArchive,
  runPlanCheck,
  runPlanCleanup,
  runPlanList,
  runPlanPhase,
  runPlanReindex,
  runPlanResolve,
  runPlanSearch,
  runPlanShow,
  runPlanStatus,
  runPlanUpdate,
  runPlanUse,
  runPlanAddPhase,
  runPlanCreate,
  runPlanKanban,
  runPlanMigrate,
  runPlanParse,
  runPlanValidate,
  type PlanDeps,
} from "./plan-command.js";
import { runJournalCreate, runJournalList, runJournalShow, runJournalValidate, type JournalDeps } from "./journal-command.js";
import { assertStatus } from "../plan/plan-mutations.js";
import { runAdaptersRegenerate } from "./adapters-command.js";

function realPlanDeps(cwd: string): PlanDeps {
  return {
    listDir: (path) => {
      try {
        return readdirSync(path);
      } catch {
        return null;
      }
    },
    readFile: (path) => {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return null;
      }
    },
    writeFile: (path, content) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    },
    moveDir: (from, to) => {
      mkdirSync(dirname(to), { recursive: true });
      renameSync(from, to);
    },
    branch: () => {
      try {
        const out = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        const name = out.trim();
        // A detached HEAD reports "HEAD", which is not a branch and would file
        // every detached checkout under one shared pointer.
        return name && name !== "HEAD" ? name : null;
      } catch {
        return null;
      }
    },
  };
}


/** For counts and limits, where zero asks for nothing and is a mistake. */
export function positiveInt(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new UsageError(`${label} must be a positive integer (got ${value})`);
  return parsed;
}

/**
 * For a phase number, which is an index and may legitimately be zero.
 *
 * Plans are free to start their phases at 0 — a groundwork phase that comes
 * before the numbered work reads naturally as phase 0, and the board prints it.
 * Sharing the count parser here made that first phase unaddressable by every
 * command that mutates or prints one.
 */
export function phaseNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (value.trim() === "" || !Number.isInteger(parsed) || parsed < 0) {
    throw new UsageError(`${label} must be a whole phase number (got ${value})`);
  }
  return parsed;
}

function realJournalDeps(): JournalDeps {
  return {
    listDir: (path) => {
      try {
        return readdirSync(path);
      } catch {
        return null;
      }
    },
    readFile: (path) => {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return null;
      }
    },
    writeFile: (path, content) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    },
    fileExists: (path) => existsSync(path),
  };
}

export function registerTier1Commands(program: Command, context: CommandRegistrationContext): void {
  const plan = program.command("plan").description("The plan this branch is working from");

  plan
    .command("use")
    .description("Point this branch at a plan directory under the plans dir")
    .argument("<name>", "plan directory name")
    .option("--json", "emit the machine envelope", false)
    .action((name: string, opts: { json?: boolean }) => {
      const global = program.opts<GlobalOpts>();
      const { config } = loadConfig({ home: global.home, cwd: global.cwd }, realLoadDeps());
      const { output, exitCode } = runPlanUse(
        name,
        { cwd: global.cwd, plansDir: config.paths.plans, json: !!opts.json },
        realPlanDeps(global.cwd),
      );
      emit(output);
      if (exitCode !== EXIT.ok) process.exitCode = exitCode;
    });

  plan
    .command("show")
    .description("Show the plan this branch points at, with its phases")
    .option("--json", "emit the machine envelope", false)
    .action((opts: { json?: boolean }) => {
      const global = program.opts<GlobalOpts>();
      const { config } = loadConfig({ home: global.home, cwd: global.cwd }, realLoadDeps());
      const { output, exitCode } = runPlanShow(
        { cwd: global.cwd, plansDir: config.paths.plans, json: !!opts.json },
        realPlanDeps(global.cwd),
      );
      emit(output);
      if (exitCode !== EXIT.ok) process.exitCode = exitCode;
    });

  const planOpts = (json?: boolean) => {
    const global = program.opts<GlobalOpts>();
    const { config } = loadConfig({ home: global.home, cwd: global.cwd }, realLoadDeps());
    return {
      opts: { cwd: global.cwd, plansDir: config.paths.plans, json: !!json, dryRun: !!global.dryRun },
      deps: realPlanDeps(global.cwd),
    };
  };
  const finish = ({ output, exitCode }: { output: string; exitCode: number }): void => {
    if (output) emit(output);
    if (exitCode !== EXIT.ok) process.exitCode = exitCode;
  };

  plan
    .command("create")
    .description("Bootstrap a new plan directory from the template")
    .argument("<title>", "what the plan is called")
    .option("--description <text>", "one-line summary for the frontmatter")
    .option("--priority <p>", "P1 | P2 | P3")
    .option("--use", "also point this branch at the new plan", false)
    .option("--json", "emit the machine envelope", false)
    .action((title: string, o: { description?: string; priority?: string; use?: boolean; json?: boolean }) => {
      const { opts, deps } = planOpts(o.json);
      finish(runPlanCreate(title, opts, deps, {
        stamp: planStamp(new Date()),
        ...(o.description ? { description: o.description } : {}),
        ...(o.priority ? { priority: o.priority } : {}),
        ...(o.use ? { use: true } : {}),
      }));
    });

  plan
    .command("add-phase")
    .description("Append a new phase-NN-<slug>.md to a plan, and a row in its table")
    .argument("<title>", "what the phase is called")
    .option("--plan <name>", "act on this plan instead of the branch's")
    .option("--depends <list>", "comma-separated phase numbers this one waits on")
    .option("--json", "emit the machine envelope", false)
    .action((title: string, o: { plan?: string; depends?: string; json?: boolean }) => {
      const { opts, deps } = planOpts(o.json);
      const dependencies = o.depends
        ? o.depends.split(",").map((part) => phaseNumber(part.trim(), "--depends"))
        : undefined;
      finish(runPlanAddPhase(o.plan, title, opts, deps, dependencies ? { dependencies } : {}));
    });

  plan
    .command("kanban")
    .description("Show plan phases as a board, grouped by status")
    .argument("[name]", "one plan instead of all of them")
    .option("--json", "emit the machine envelope", false)
    .action((name: string | undefined, o: { json?: boolean }) => {
      const { opts, deps } = planOpts(o.json);
      finish(runPlanKanban(name, opts, deps));
    });

  plan
    .command("parse")
    .description("Print a plan as structured data, with checkbox progress per phase")
    .option("--plan <name>", "act on this plan instead of the branch's")
    .option("--json", "emit the machine envelope", false)
    .action((o: { plan?: string; json?: boolean }) => {
      const { opts, deps } = planOpts(o.json);
      finish(runPlanParse(o.plan, opts, deps));
    });

  plan
    .command("validate")
    .description("Check one plan's directory format; exits 1 when it is invalid")
    .option("--plan <name>", "act on this plan instead of the branch's")
    .option("--json", "emit the machine envelope", false)
    .action((o: { plan?: string; json?: boolean }) => {
      const { opts, deps } = planOpts(o.json);
      finish(runPlanValidate(o.plan, opts, deps));
    });

  plan
    .command("migrate")
    .description("Move plan directories from elsewhere in the repo into the plans root")
    .argument("<from>", "a plan directory, or a directory holding several")
    .option("--json", "emit the machine envelope", false)
    .action((from: string, o: { json?: boolean }) => {
      const { opts, deps } = planOpts(o.json);
      finish(runPlanMigrate(from, opts, deps));
    });

  plan
    .command("list")
    .description("List plan directories with their status and phase progress")
    .option("--json", "emit the machine envelope", false)
    .action((o: { json?: boolean }) => {
      const { opts, deps } = planOpts(o.json);
      finish(runPlanList(opts, deps));
    });

  plan
    .command("resolve")
    .description("Print the directory of the plan this branch points at")
    .option("--json", "emit the machine envelope", false)
    .action((o: { json?: boolean }) => {
      const { opts, deps } = planOpts(o.json);
      finish(runPlanResolve(opts, deps));
    });

  plan
    .command("update")
    .description("Set a phase's status, in the phase file and the index table")
    .argument("<phase>", "phase number")
    .argument("<status>", "pending | in-progress | completed | cancelled")
    .option("--plan <name>", "act on this plan instead of the branch's")
    .option("--json", "emit the machine envelope", false)
    .action((phase: string, status: string, o: { plan?: string; json?: boolean }) => {
      const { opts, deps } = planOpts(o.json);
      finish(runPlanUpdate(o.plan, { phase: phaseNumber(phase, "phase"), status: assertStatus(status) }, opts, deps));
    });

  plan
    .command("check")
    .description("Mark a phase completed")
    .argument("<phase>", "phase number")
    .option("--plan <name>", "act on this plan instead of the branch's")
    .option("--json", "emit the machine envelope", false)
    .action((phase: string, o: { plan?: string; json?: boolean }) => {
      const { opts, deps } = planOpts(o.json);
      finish(runPlanCheck(o.plan, phaseNumber(phase, "phase"), true, opts, deps));
    });

  plan
    .command("uncheck")
    .description("Put a phase back to pending")
    .argument("<phase>", "phase number")
    .option("--plan <name>", "act on this plan instead of the branch's")
    .option("--json", "emit the machine envelope", false)
    .action((phase: string, o: { plan?: string; json?: boolean }) => {
      const { opts, deps } = planOpts(o.json);
      finish(runPlanCheck(o.plan, phaseNumber(phase, "phase"), false, opts, deps));
    });

  plan
    .command("status")
    .description("Show or set the plan's own status")
    .argument("[status]", "pending | in-progress | completed | cancelled; omit to read it")
    .option("--plan <name>", "act on this plan instead of the branch's")
    .option("--json", "emit the machine envelope", false)
    .action((status: string | undefined, o: { plan?: string; json?: boolean }) => {
      const { opts, deps } = planOpts(o.json);
      finish(runPlanStatus(o.plan, status ? assertStatus(status) : null, opts, deps));
    });

  plan
    .command("close")
    .description("Mark the plan completed")
    .option("--plan <name>", "act on this plan instead of the branch's")
    .option("--json", "emit the machine envelope", false)
    .action((o: { plan?: string; json?: boolean }) => {
      const { opts, deps } = planOpts(o.json);
      finish(runPlanStatus(o.plan, "completed", opts, deps));
    });

  plan
    .command("phase")
    .description("Print one phase file in full")
    .argument("<phase>", "phase number")
    .option("--plan <name>", "act on this plan instead of the branch's")
    .option("--json", "emit the machine envelope", false)
    .action((phase: string, o: { plan?: string; json?: boolean }) => {
      const { opts, deps } = planOpts(o.json);
      finish(runPlanPhase(o.plan, phaseNumber(phase, "phase"), opts, deps));
    });

  plan
    .command("search")
    .description("Search every plan's files")
    .argument("<query>")
    .option("--json", "emit the machine envelope", false)
    .action((query: string, o: { json?: boolean }) => {
      const { opts, deps } = planOpts(o.json);
      finish(runPlanSearch(query, opts, deps));
    });

  plan
    .command("reindex")
    .description("Re-read every plan and report what is malformed (there is no index to rebuild)")
    .option("--json", "emit the machine envelope", false)
    .action((o: { json?: boolean }) => {
      const { opts, deps } = planOpts(o.json);
      finish(runPlanReindex(opts, deps));
    });

  plan
    .command("archive")
    .description("Move a finished plan under the archive dir")
    .option("--plan <name>", "act on this plan instead of the branch's")
    .option("--force", "archive it even though it is not finished", false)
    .option("--json", "emit the machine envelope", false)
    .action((o: { plan?: string; force?: boolean; json?: boolean }) => {
      const { opts, deps } = planOpts(o.json);
      finish(runPlanArchive(o.plan, opts, deps, !!o.force));
    });

  plan
    .command("cleanup")
    .description("List finished plans still in the plans root; --archive moves them")
    .option("--archive", "move them instead of just listing", false)
    .option("--json", "emit the machine envelope", false)
    .action((o: { archive?: boolean; json?: boolean }) => {
      const { opts, deps } = planOpts(o.json);
      finish(runPlanCleanup(opts, deps, !!o.archive));
    });

  const journal = program.command("journal").description("The technical journal: one dated entry per notable event");
  const journalOpts = (json?: boolean) => {
    const global = program.opts<GlobalOpts>();
    const { config } = loadConfig({ home: global.home, cwd: global.cwd }, realLoadDeps());
    return { cwd: global.cwd, docsDir: config.paths.docs, json: !!json, dryRun: !!global.dryRun };
  };

  journal
    .command("create")
    .description("Write a dated entry")
    .argument("<title>")
    .option("--component <name>", "what it is about", "")
    .option("--status <status>", "Resolved | Ongoing | Blocked | Abandoned", "Resolved")
    .option("--body <text>", "the entry body")
    .option("--json", "emit the machine envelope", false)
    .action((title: string, o: { component: string; status: string; body?: string; json?: boolean }) => {
      finish(
        runJournalCreate(
          { title, component: o.component, status: o.status, body: o.body, at: new Date().toISOString() },
          journalOpts(o.json),
          realJournalDeps(),
        ),
      );
    });

  journal
    .command("list")
    .description("List entries, newest first")
    .option("--limit <count>", "how many to show", "20")
    .option("--json", "emit the machine envelope", false)
    .action((o: { limit: string; json?: boolean }) => {
      finish(runJournalList(journalOpts(o.json), realJournalDeps(), positiveInt(o.limit, "--limit")));
    });

  journal
    .command("show")
    .description("Print one entry, by file name or a fragment of it")
    .argument("<term>")
    .option("--json", "emit the machine envelope", false)
    .action((term: string, o: { json?: boolean }) => {
      finish(runJournalShow(term, journalOpts(o.json), realJournalDeps()));
    });

  journal
    .command("validate")
    .description("Check every entry has a title, a date, a status, and a body")
    .option("--json", "emit the machine envelope", false)
    .action((o: { json?: boolean }) => {
      finish(runJournalValidate(journalOpts(o.json), realJournalDeps()));
    });

  const kit = program.command("kit").description("Where the kit installs from and to");

  kit
    .command("install-path")
    .description("Show where each artifact kind would be written for a provider")
    .argument("<provider>", "provider id")
    .option("--global", "resolve against the ~/ scope", false)
    .option("--json", "emit the machine envelope", false)
    .action((provider: string, opts: { global?: boolean; json?: boolean }) => {
      const global = program.opts<GlobalOpts>();
      const { output, exitCode } = runKitInstallPath({
        provider,
        home: global.home,
        cwd: global.cwd,
        scope: opts.global ? "global" : "project",
        json: !!opts.json,
      });
      emit(output);
      if (exitCode !== EXIT.ok) process.exitCode = exitCode;
    });

  kit
    .command("refresh")
    .description("Discard the extracted kit cache and extract it again")
    .option("--json", "emit the machine envelope", false)
    .action((opts: { json?: boolean }) => {
      const global = program.opts<GlobalOpts>();
      const { output } = runKitRefresh({ json: !!opts.json, dryRun: !!global.dryRun });
      emit(output);
    });

  const mcp = program.command("mcp").description("MCP servers this project and this user have configured");

  mcp
    .command("list")
    .description("List configured servers across both scopes")
    .option("--json", "emit the machine envelope", false)
    .action((opts: { json?: boolean }) => {
      const global = program.opts<GlobalOpts>();
      emit(runMcpList({ home: global.home, cwd: global.cwd, json: !!opts.json }).output);
    });

  mcp
    .command("show")
    .description("Show one server's definition (env variable names only, never values)")
    .argument("<name>")
    .option("--json", "emit the machine envelope", false)
    .action((name: string, opts: { json?: boolean }) => {
      const global = program.opts<GlobalOpts>();
      const { output, exitCode } = runMcpShow(name, { home: global.home, cwd: global.cwd, json: !!opts.json });
      emit(output);
      if (exitCode !== EXIT.ok) process.exitCode = exitCode;
    });

  mcp
    .command("add")
    .description("Add a stdio server to this project (or to your own config with --global)")
    .argument("<name>")
    .argument("<command>", "executable to run")
    .argument("[args...]", "arguments passed to it")
    .option("--global", "write to your own config instead of the project's", false)
    .option("--json", "emit the machine envelope", false)
    .action((name: string, command: string, args: string[], opts: { global?: boolean; json?: boolean }) => {
      const global = program.opts<GlobalOpts>();
      const { output } = runMcpAdd(
        name,
        { command, ...(args.length > 0 ? { args } : {}) },
        { home: global.home, cwd: global.cwd, global: !!opts.global, json: !!opts.json, dryRun: !!global.dryRun },
      );
      emit(output);
    });

  mcp
    .command("remove")
    .description("Remove a server from this project (or from your own config with --global)")
    .argument("<name>")
    .option("--global", "remove from your own config instead of the project's", false)
    .option("--json", "emit the machine envelope", false)
    .action((name: string, opts: { global?: boolean; json?: boolean }) => {
      const global = program.opts<GlobalOpts>();
      const { output, exitCode } = runMcpRemove(name, {
        home: global.home,
        cwd: global.cwd,
        global: !!opts.global,
        json: !!opts.json,
        dryRun: !!global.dryRun,
      });
      emit(output);
      if (exitCode !== EXIT.ok) process.exitCode = exitCode;
    });

  mcp
    .command("link")
    .description("Mirror a server between the project and user scopes (a copy, never a move)")
    .argument("<name>")
    .option("--to-project", "mirror into .mcp.json instead of your own config", false)
    .option("--allow-secrets", "permit env values to be written into the repository config", false)
    .option("--json", "emit the machine envelope", false)
    .action((name: string, o: { toProject?: boolean; allowSecrets?: boolean; json?: boolean }) => {
      const global = program.opts<GlobalOpts>();
      finish(runMcpLink(name, {
        home: global.home,
        cwd: global.cwd,
        json: !!o.json,
        dryRun: !!global.dryRun,
        ...(o.toProject ? { toProject: true } : {}),
        ...(o.allowSecrets ? { allowSecrets: true } : {}),
      }));
    });

  mcp
    .command("verify")
    .description("Start each server and check it completes the MCP initialize handshake")
    .argument("[name]", "verify one server instead of all of them")
    .option("--json", "emit the machine envelope", false)
    .action(async (name: string | undefined, opts: { json?: boolean }) => {
      const global = program.opts<GlobalOpts>();
      const { output, exitCode } = await runMcpVerify(
        name,
        { home: global.home, cwd: global.cwd, json: !!opts.json, version: context.version },
        realVerifyDeps,
      );
      emit(output);
      if (exitCode !== EXIT.ok) process.exitCode = exitCode;
    });

  const adapters = program
    .command("adapters")
    .description("Adapter artifacts projected from the install receipt, for tools that read that format");

  adapters
    .command("regenerate")
    .description("Rebuild the artifacts from the receipt (deterministic — a repair, not a reconcile)")
    .option("--global", "use the ~/ scope", false)
    .option("--json", "emit the machine envelope", false)
    .action(async (opts: { global?: boolean; json?: boolean }) => {
      const global = program.opts<GlobalOpts>();
      const { output, exitCode } = await withLifecycleLock(
        global.dryRun ? [] : lifecycleRoots(global),
        "adapters regenerate",
        () => runAdaptersRegenerate({
          home: global.home,
          cwd: global.cwd,
          scope: opts.global ? "global" : "project",
          kitVersion: context.version,
          json: !!opts.json,
          dryRun: !!global.dryRun,
        }),
      );
      emit(output);
      if (exitCode !== EXIT.ok) process.exitCode = exitCode;
    });
}

/** Exported for the registration guard test. */
export const TIER1_COMMANDS = ["plan", "journal", "kit", "mcp", "adapters"] as const;
