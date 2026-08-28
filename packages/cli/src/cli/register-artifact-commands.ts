// `av skills`, `av agents`, `av commands` — the same five verbs, three times.
//
// Registration is a loop over the three kinds rather than three blocks, for the
// same reason the command body is shared: three hand-written registrations
// drift, and the drift shows up as one command quietly missing a flag the other
// two have.

import type { Command } from "commander";
import { COMMAND_FOR_KIND, CATALOG_KINDS, type CatalogKind } from "../catalog/catalog-entries.js";
import { getKitRoot } from "../kit/embedded-kit.js";
import { loadKit } from "../kit/load-kit.js";
import { runCatalog, type CatalogOpts, type CatalogVerb } from "./catalog-artifact-command.js";
import type { GlobalOpts } from "./command-registration-context.js";
import { emit } from "./emit.js";

interface VerbFlags {
  json?: boolean;
  global?: boolean;
  provider?: string;
  installed?: boolean;
}

function dispatchVerb(program: Command, kind: CatalogKind, verb: CatalogVerb) {
  return (name: string | undefined, flags: VerbFlags): void => {
    const global = program.opts<GlobalOpts>();
    const opts: CatalogOpts = {
      kind,
      verb,
      scope: flags.global ? "global" : "project",
      home: global.home,
      cwd: global.cwd,
      ...(name ? { name } : {}),
      ...(flags.json ? { json: true } : {}),
      ...(flags.provider ? { provider: flags.provider } : {}),
      ...(flags.installed ? { installedOnly: true } : {}),
      ...(global.dryRun ? { dryRun: true } : {}),
    };
    const result = runCatalog(loadKit(getKitRoot(global.cwd)), opts);
    emit(result.output);
    if (result.exitCode !== 0) process.exitCode = result.exitCode;
  };
}

/** Flags every verb accepts, so no two of them disagree about `--json`. */
function common(command: Command): Command {
  return command
    .option("--json", "emit the machine envelope instead of the text report", false)
    .option("--global", "operate on the ~/ scope", false);
}

export function registerArtifactCommands(program: Command): void {
  for (const kind of CATALOG_KINDS) {
    const noun = COMMAND_FOR_KIND[kind];
    const group = program
      .command(noun)
      .description(
        kind === "skill"
          ? "Browse and install kit skills (for a single skill's runtime env, see av skill)"
          : `Per-${kind} management commands`,
      );

    common(group.command("list").description(`List ${noun} in the kit and where they are installed`))
      .option("--installed", "only what the install receipt accounts for", false)
      .action((flags: VerbFlags) => dispatchVerb(program, kind, "list")(undefined, flags));

    common(group.command("show").description(`Show one ${kind}'s details`).argument("<name>", `${kind} name`))
      .action(dispatchVerb(program, kind, "show"));

    common(group.command("search").description(`Search ${noun} by name, description, category or keyword`)
      .argument("<query>", "text to match"))
      .action(dispatchVerb(program, kind, "search"));

    common(group.command("install").description(`Install one ${kind} for one provider`)
      .argument("<name>", `${kind} name`))
      .option("--provider <id>", "provider to install for", "claude-code")
      .action(dispatchVerb(program, kind, "install"));

    common(group.command("remove").description(`Remove one installed ${kind} for one provider`)
      .argument("<name>", `${kind} name`))
      .option("--provider <id>", "provider to remove from", "claude-code")
      .action(dispatchVerb(program, kind, "remove"));

    // Skills alone declare workflow relationships, so skills alone get a graph.
    // Registering it on all three and refusing two would advertise a command
    // that can only ever fail.
    if (kind === "skill") {
      common(group.command("graph").description("Show skill workflow graph relationships")
        .argument("[name]", "limit to one skill"))
        .action(dispatchVerb(program, kind, "graph"));
    }
  }
}
