import { homedir } from "node:os";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Command } from "commander";
import { runInstall } from "./cli/install-command.js";
import { runList } from "./cli/list-command.js";
import { nowStamp } from "./cli/timestamp.js";
import { PROVIDER_IDS } from "./providers/index.js";
import { registerAddSkill } from "./cli/add-skill-command.js";
import { registerMigrate } from "./cli/migrate-command.js";

interface GlobalOpts {
  home: string;
  cwd: string;
  dryRun?: boolean;
  yes?: boolean;
}

function splitProviders(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("vcskill")
    .description("Author agent skills once, install to any AI provider.")
    .version("0.1.0")
    .option("--home <dir>", "override home root", homedir())
    .option("--cwd <dir>", "override project root", process.cwd())
    .option("--dry-run", "plan only, write nothing", false)
    .option("--yes", "skip interactive prompts", false);

  program
    .command("install")
    .description("Install the kit to one or more providers")
    .option("--provider <list>", "comma-separated provider ids", splitProviders)
    .option("--global", "install to ~/ instead of ./", false)
    .action(async (opts: { provider?: string[]; global?: boolean }) => {
      const g = program.opts<GlobalOpts>();
      const scope = opts.global ? "global" : "project";
      let providers = opts.provider ?? [];
      if (providers.length === 0 && !g.yes && process.stdout.isTTY) {
        const { promptProviders } = await import("./cli/prompt-providers.js");
        const picked = await promptProviders();
        providers = picked.providers;
      }
      if (providers.length === 0) providers = [...PROVIDER_IDS].slice(0, 1); // default claude-code
      const { summary } = runInstall({
        providers,
        scope,
        dryRun: !!g.dryRun,
        home: g.home,
        cwd: g.cwd,
        timestamp: nowStamp(),
      });
      console.log(summary);
    });

  program
    .command("list")
    .description("Show kit contents and per-provider install state")
    .option("--global", "check ~/ scope", false)
    .action((opts: { global?: boolean }) => {
      const g = program.opts<GlobalOpts>();
      console.log(runList({ scope: opts.global ? "global" : "project", home: g.home, cwd: g.cwd }));
    });

  registerAddSkill(program);
  registerMigrate(program);
  return program;
}

// Resolve argv[1] through any bin symlink so `node_modules/.bin/vcskill`
// (a symlink to dist/index.js) is still recognized as the entry point.
function isEntry(): boolean {
  if (process.env.VCSKILL_RUN === "1") return true;
  if (!process.argv[1]) return false;
  try {
    return pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;
  } catch {
    return false;
  }
}
if (isEntry()) {
  buildProgram().parseAsync(process.argv).catch((err) => {
    console.error(String(err instanceof Error ? err.message : err));
    process.exit(1);
  });
}
