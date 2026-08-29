// `av api`, `av gui`, and the `config` aliases that operate the same daemon.
//
// ONE DAEMON, NOT TWO. Upstream runs two servers — `ak api` on 8765 and the
// `ak config` dashboard on 8766 — because they do different jobs there: one
// proxies model traffic, the other serves a UI. ariadnev ships no proxy, so the
// two would be the same read-only server twice, on two ports, with two pidfiles
// to leave behind.
//
// `av config` is untouched and still means "inspect ariadnev's own
// configuration". Upstream's bare `ak config` opens a dashboard; taking that
// spelling would overwrite a meaning this CLI already has, which the parity
// manifest explicitly protects. `av gui` is the command that opens something,
// and `register-config-commands.ts` records why the `config` verbs stay absent.

import type { Command } from "commander";
import { realLifecycleDeps } from "../api/daemon-lifecycle.js";
import { DEFAULT_BIND, DEFAULT_PORT } from "../api/server.js";
import { runApiStart, runApiStatus, runApiStop, type ApiOpts, type ApiResult } from "./api-command.js";
import type { GlobalOpts } from "./command-registration-context.js";
import { emit } from "./emit.js";
import { UsageError } from "./exit-codes.js";
import { realBrowserLauncher, runGui } from "./gui-command.js";
import { packageVersion } from "../version.js";

interface DaemonFlags {
  json?: boolean;
  bind?: string;
  port?: string;
  authToken?: string;
  foreground?: boolean;
  /** Commander spells a `--no-open` flag as `open: false`, not `noOpen`. */
  open?: boolean;
}

/** `--port` arrives as a string; a bad one must not become `NaN` and bind 0. */
function parsePort(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new UsageError(`invalid --port ${JSON.stringify(raw)}: expected an integer between 0 and 65535`);
  }
  return port;
}

function optsFrom(program: Command, flags: DaemonFlags): ApiOpts {
  const global = program.opts<GlobalOpts>();
  const port = parsePort(flags.port);
  return {
    home: global.home,
    cwd: global.cwd,
    version: packageVersion(),
    env: process.env,
    execPath: process.execPath,
    argv: process.argv,
    ...(flags.bind ? { bind: flags.bind } : {}),
    ...(port === undefined ? {} : { port }),
    ...(flags.authToken ? { authToken: flags.authToken } : {}),
    ...(flags.json ? { json: true } : {}),
    ...(flags.foreground ? { foreground: true } : {}),
  };
}

function report(result: ApiResult): void {
  if (result.output) emit(result.output);
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}

/** Flags shared by every verb, so no two of them disagree about `--json`. */
function common(command: Command): Command {
  return command.option("--json", "emit the machine envelope instead of the text report", false);
}

/** Bind, port and token, on the two verbs that can start a listener. */
function serverFlags(command: Command): Command {
  return common(command)
    .option("--bind <address>", `bind address (non-loopback requires --auth-token)`, DEFAULT_BIND)
    .option("--port <n>", `port to listen on (0 lets the OS choose)`, String(DEFAULT_PORT))
    .option(
      "--auth-token <value>",
      "bearer token required on every request; @/path reads a file. Prefer ARIADNEV_API_TOKEN — an argument is visible in process listings",
    );
}

function attachVerbs(group: Command, program: Command, noun: string): void {
  serverFlags(group.command("start").description(`Start the local ${noun} daemon`))
    .option("--foreground", "run in this process instead of detaching", false)
    .action(async (flags: DaemonFlags) => report(await runApiStart(optsFrom(program, flags), realLifecycleDeps())));

  common(group.command("status").description(`Show the running state of the ${noun} daemon`))
    .option("--auth-token <value>", "bearer token, when the daemon requires one")
    .action(async (flags: DaemonFlags) => report(await runApiStatus(optsFrom(program, flags), realLifecycleDeps())));

  common(group.command("stop").description(`Stop the running ${noun} daemon`))
    .option("--auth-token <value>", "bearer token, when the daemon requires one")
    .action(async (flags: DaemonFlags) => report(await runApiStop(optsFrom(program, flags), realLifecycleDeps())));
}

export function registerApiCommands(program: Command): void {
  const api = program
    .command("api")
    .description("Run a local read-only API over the operational data plane (no LLM proxy)");
  attachVerbs(api, program, "api");

  serverFlags(
    program.command("gui").description("Start the local API and open its dashboard in a browser"),
  )
    .option("--no-open", "start the daemon and print the URL without launching a browser")
    .action(async (flags: DaemonFlags) =>
      report(
        await runGui(
          { ...optsFrom(program, flags), ...(flags.open === false ? { noOpen: true } : {}) },
          realLifecycleDeps(),
          realBrowserLauncher(process.platform),
        ),
      ),
    );
}
