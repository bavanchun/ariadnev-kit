// `av watch` and `av orchestrate` — the two commands that act without a person
// watching, registered together because that is the property they share.
//
// `watch` is the sharpest surface in this CLI: it reads text a stranger wrote
// and hands it to a coding agent with shell access. Its defaults are set here
// accordingly — `dry-run` first in the help, and `start` previewing unless
// `--yes` is passed. ADR 0018 is the reasoning.

import type { Command } from "commander";
import type { GlobalOpts } from "./command-registration-context.js";
import { emit } from "./emit.js";
import {
  runOrchestrateResume,
  runOrchestrateStart,
  runOrchestrateStatus,
  runOrchestrateStop,
  type OrchestrateOpts,
  type OrchestrateResult,
} from "./orchestrate-command.js";
import {
  realWatchDeps,
  runWatchDryRun,
  runWatchStart,
  runWatchStatus,
  runWatchStop,
  type WatchOpts,
  type WatchResult,
} from "./watch-command.js";

interface WatchFlags {
  json?: boolean;
  daemon?: boolean;
  foreground?: boolean;
  label?: string;
  maxPerHour?: string;
  skill?: string;
  target?: string;
  limit?: string;
}

function report(result: WatchResult | OrchestrateResult): void {
  if (result.output) emit(result.output);
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}

function watchOpts(program: Command, repo: string | undefined, flags: WatchFlags): WatchOpts {
  const global = program.opts<GlobalOpts>();
  return {
    home: global.home,
    cwd: global.cwd,
    ...(repo ? { repo } : {}),
    ...(flags.label ? { label: flags.label } : {}),
    ...(flags.maxPerHour ? { maxPerHour: flags.maxPerHour } : {}),
    ...(flags.skill ? { skill: flags.skill } : {}),
    ...(flags.target ? { target: flags.target } : {}),
    ...(flags.limit ? { limit: Number(flags.limit) } : {}),
    ...(flags.json ? { json: true } : {}),
    ...(flags.daemon ? { daemon: true } : {}),
    ...(flags.foreground ? { foreground: true } : {}),
    // `--yes` is the global flag, and for `watch start` it is the difference
    // between previewing and posting to a public repository.
    ...(global.yes ? { yes: true } : {}),
  };
}

function orchestrateOpts(program: Command, runId: string | undefined, graphPath: string | undefined, json: boolean | undefined): OrchestrateOpts {
  const global = program.opts<GlobalOpts>();
  return {
    home: global.home,
    cwd: global.cwd,
    env: process.env,
    ...(runId ? { runId } : {}),
    ...(graphPath ? { graphPath } : {}),
    ...(json ? { json: true } : {}),
  };
}

function sweepFlags(command: Command): Command {
  return command
    .option("--json", "emit the machine envelope instead of the text report", false)
    .option("--label <name>", "only consider issues carrying this label")
    .option("--max-per-hour <n>", "cap on responses per hour, enforced locally before any agent runs")
    .option("--skill <kit/skill>", "the skill an issue is handed to")
    .option("--target <provider>", "the coding agent to dispatch through")
    .option("--limit <n>", "how many open issues to fetch");
}

export function registerAutonomyCommands(program: Command): void {
  const watch = program
    .command("watch")
    .description("Watch a GitHub repository and draft replies to new issues (previews by default)");

  // Registered first so it heads the help. It is the default posture, and the
  // one a reader should see before `start`.
  sweepFlags(watch.command("dry-run").description("Preview what `av watch start` would post, posting nothing").argument("<repo>", "owner/repo"))
    .action(async (repo: string, flags: WatchFlags) => report(await runWatchDryRun(watchOpts(program, repo, flags), realWatchDeps())));

  sweepFlags(
    watch
      .command("start")
      .description("Draft replies to new issues; posts only with --yes, which also allowlists the repository")
      .argument("<repo>", "owner/repo"),
  )
    .option("--daemon", "keep watching in the background instead of sweeping once", false)
    .option("--foreground", "run the polling loop in this process (what --daemon spawns)", false)
    .action(async (repo: string, flags: WatchFlags) => report(await runWatchStart(watchOpts(program, repo, flags), realWatchDeps())));

  watch
    .command("status")
    .description("Show which repositories are allowlisted and what has been answered")
    .argument("[repo]", "owner/repo")
    .option("--json", "emit the machine envelope instead of the text report", false)
    .action((repo: string | undefined, flags: WatchFlags) => report(runWatchStatus(watchOpts(program, repo, flags))));

  watch
    .command("stop")
    .description("Stop a running watcher for the given repository")
    .argument("<repo>", "owner/repo")
    .option("--json", "emit the machine envelope instead of the text report", false)
    .action((repo: string, flags: WatchFlags) => report(runWatchStop(watchOpts(program, repo, flags))));

  const orchestrate = program
    .command("orchestrate")
    .description("Run and supervise a graph of external CLI jobs");

  orchestrate
    .command("start")
    .description("Launch a new orchestrated run from a job graph file")
    .argument("<graph>", "path to a job graph JSON file")
    .option("--json", "emit the machine envelope instead of the text report", false)
    .action(async (graph: string, flags: { json?: boolean }) =>
      report(await runOrchestrateStart(orchestrateOpts(program, undefined, graph, flags.json))),
    );

  orchestrate
    .command("status")
    .description("Report a run's current lifecycle state, or list every run")
    .argument("[run-id]", "the run to report on")
    .option("--json", "emit the machine envelope instead of the text report", false)
    .action((runId: string | undefined, flags: { json?: boolean }) =>
      report(runOrchestrateStatus(orchestrateOpts(program, runId, undefined, flags.json))),
    );

  orchestrate
    .command("resume")
    .description("Reconnect to an existing run after a client or supervisor crash")
    .argument("<run-id>", "the run to resume")
    .argument("[graph]", "job graph file (defaults to the one the run started from)")
    .option("--json", "emit the machine envelope instead of the text report", false)
    .action(async (runId: string, graph: string | undefined, flags: { json?: boolean }) =>
      report(await runOrchestrateResume(orchestrateOpts(program, runId, graph, flags.json))),
    );

  orchestrate
    .command("stop")
    .description("Terminate a run's live jobs (TERM, grace period, then KILL)")
    .argument("<run-id>", "the run to stop")
    .option("--json", "emit the machine envelope instead of the text report", false)
    .action(async (runId: string, flags: { json?: boolean }) =>
      report(await runOrchestrateStop(orchestrateOpts(program, runId, undefined, flags.json))),
    );
}
