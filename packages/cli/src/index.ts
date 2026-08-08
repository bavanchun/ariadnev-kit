import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import { Command } from "commander";
import { emit, emitError, setEmitTransform } from "./cli/emit.js";
import type { CommandRegistrationContext } from "./cli/command-registration-context.js";
import { registerCatalogCommands } from "./cli/register-catalog-commands.js";
import { registerInstallCommands } from "./cli/register-install-commands.js";
import { registerHarnessCommands } from "./cli/register-harness-commands.js";
import { registerMaintenanceCommands } from "./cli/register-maintenance-commands.js";
import { registerQualityCommands } from "./cli/register-quality-commands.js";
import { maybeNudge, realNudgeDeps } from "./cli/update-check.js";
import { scopeProcessEnv } from "./env-scope.js";
import { toEvent, type EventInput, type HistoryKind } from "./history/record.js";
import { recordSafe } from "./history/store.js";
import { sanitize } from "./security/credential-sanitizer.js";
import { coral, faint, shouldColor, wordmark } from "./ui/style.js";
import { packageVersion } from "./version.js";

function outColor(): boolean {
  return shouldColor(process.env, process.stdout);
}

/** Best-effort history record — never throws or blocks a command. */
function record(kind: HistoryKind, fields: EventInput): void {
  recordSafe(homedir(), toEvent(kind, { version: packageVersion(), ...fields }));
}

function banner(): string {
  const style = { color: outColor() };
  return [
    `${wordmark(style)}  ${faint("— curated workflows, quality-gated across coding agents", style)}`,
    "",
    `  ${coral("vc", style)} <command>   ·   try  ${coral("vc install", style)}  ·  ${coral("vc doctor", style)}  ·  ${coral("vc list", style)}`,
  ].join("\n");
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("vcskill")
    .description("Install a curated, quality-gated workflow kit across coding-agent targets.")
    .version(packageVersion())
    .option("--home <dir>", "override home root", homedir())
    .option("--cwd <dir>", "override project root", process.cwd())
    .option("--dry-run", "plan only, write nothing", false)
    .option("--yes", "skip interactive prompts", false);

  const context: CommandRegistrationContext = {
    version: packageVersion(),
    outColor,
    record,
  };
  registerInstallCommands(program, context);
  registerMaintenanceCommands(program, context);
  registerQualityCommands(program, context);
  registerCatalogCommands(program, context);
  registerHarnessCommands(program);

  program.addHelpText("beforeAll", () => `${banner()}\n`);
  program.action(() => emit(banner()));
  return program;
}

// Resolve argv[1] through bin symlinks; Bun binaries use import.meta.main.
function isEntry(): boolean {
  if (process.env.VCSKILL_RUN === "1") return true;
  if ((import.meta as { main?: boolean }).main === true) return true;
  if (import.meta.url.includes("/$bunfs/") || import.meta.url.startsWith("bun:")) return true;
  if (!process.argv[1]) return false;
  try {
    return pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;
  } catch {
    return false;
  }
}

/** Best-effort newer-version hint for interactive binary use. */
async function nudgeAfterCommand(): Promise<void> {
  const isBinary = !/^(node|bun)/i.test(basename(process.execPath));
  const command = process.argv[2];
  if (!isBinary || !process.stderr.isTTY || process.env.CI || command === "update") return;
  try {
    const hint = await maybeNudge(realNudgeDeps(packageVersion()));
    if (hint) emitError(hint);
  } catch {
    // Update nudges never block the requested command.
  }
}

if (isEntry()) {
  scopeProcessEnv();
  setEmitTransform(sanitize);
  buildProgram()
    .parseAsync(process.argv)
    .then(nudgeAfterCommand)
    .catch((error) => {
      console.error(sanitize(String(error instanceof Error ? error.message : error)));
      process.exit(1);
    });
}
