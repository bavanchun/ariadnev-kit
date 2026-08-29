// `av content`, `av feedback`, `av changelog` — the three commands whose
// upstream versions talk to a service ariadnev does not operate.
//
// Phase 1's ADR is what shapes all three: a remote-vendor half is excluded by
// dependency, and the *function* underneath it is mapped onto something
// ariadnev owns. Publishing goes to the user's own webhooks; feedback becomes a
// file or an issue on ariadnev's own repository; a changelog reads ariadnev's
// own signed releases. None of the three phones a vendor, because there is no
// vendor.
//
// (`self-update` is the fourth. It is an alias on `update`, registered in
// `register-maintenance-commands.ts` beside the signed path it names.)

import type { Command } from "commander";
import type { GlobalOpts } from "./command-registration-context.js";
import { runChangelog } from "./changelog-command.js";
import {
  runContentPublish,
  runContentQueue,
  runContentSchedule,
  type ContentOpts,
} from "./content-command.js";
import { emit } from "./emit.js";
import { runFeedback, type FeedbackOpts } from "./feedback-command.js";

interface ContentFlags {
  channel?: string;
  body?: string;
  at?: string;
  json?: boolean;
}

interface FeedbackFlags {
  type?: string;
  title?: string;
  body?: string;
  area?: string;
  expected?: string;
  actual?: string;
  export?: string;
  submit?: boolean;
  attachDiagnostics?: boolean;
  json?: boolean;
}

interface ChangelogFlags {
  from?: string;
  sinceCurrent?: boolean;
  full?: boolean;
  limit?: string;
  json?: boolean;
}

function report(result: { output: string; exitCode: number }): void {
  if (result.output) emit(result.output);
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}

function contentOpts(program: Command, flags: ContentFlags, id?: string): ContentOpts {
  const global = program.opts<GlobalOpts>();
  return {
    home: global.home,
    ...(flags.channel ? { channel: flags.channel } : {}),
    ...(flags.body ? { body: flags.body } : {}),
    ...(flags.at ? { at: flags.at } : {}),
    ...(id ? { id } : {}),
    ...(flags.json ? { json: true } : {}),
    // Sending to a webhook and posting an issue are outward-facing writes, so
    // both sit behind the same global flag every other write in this CLI uses.
    ...(global.yes ? { yes: true } : {}),
  };
}

export function registerVendorCommands(program: Command): void {
  const content = program
    .command("content")
    .description("Publish posts to your own configured webhooks, and schedule them");

  content
    .command("publish")
    .description("Publish a post to a channel (previews unless --yes)")
    .option("--channel <name>", "a channel from your channels.json")
    .option("--body <text>", "what to post")
    .option("--json", "emit the machine envelope instead of the text report", false)
    .action(async (flags: ContentFlags) => report(await runContentPublish(contentOpts(program, flags))));

  const queue = content.command("queue").description("Manage the scheduled post queue");
  for (const verb of ["list", "add", "remove"] as const) {
    const command = queue
      .command(verb)
      .description(
        verb === "list" ? "Show queued posts" : verb === "add" ? "Queue a post for later" : "Drop a queued post",
      )
      .option("--json", "emit the machine envelope instead of the text report", false);
    if (verb === "add") {
      command
        .option("--channel <name>", "a channel from your channels.json")
        .option("--body <text>", "what to post")
        .option("--at <when>", "an ISO timestamp or an offset like 2h (default: now)");
    }
    if (verb === "remove") command.argument("<id>", "the queued post's id");
    command.action((...args: unknown[]) => {
      const flags = args[verb === "remove" ? 1 : 0] as ContentFlags;
      const id = verb === "remove" ? (args[0] as string) : undefined;
      report(runContentQueue(verb, contentOpts(program, flags, id)));
    });
  }

  content
    .command("schedule")
    .description("Send every queued post that is due (previews unless --yes)")
    .option("--json", "emit the machine envelope instead of the text report", false)
    .action(async (flags: ContentFlags) => report(await runContentSchedule(contentOpts(program, flags))));

  program
    .command("feedback")
    .description("Write a redacted bug or feature report, or open it as an issue with --submit")
    .option("--type <kind>", "bug | feature | enhancement")
    .option("--title <text>", "one-line summary")
    .option("--body <text>", "details")
    .option("--area <name>", "the command, page or workflow this is about")
    .option("--expected <text>", "what you expected to happen")
    .option("--actual <text>", "what happened instead")
    .option("--export <path>", "write the markdown here instead of printing it")
    .option("--submit", "open it as an issue on ariadnev's repository (needs --yes)", false)
    .option("--attach-diagnostics", "inline a redacted doctor summary", false)
    .option("--json", "emit the machine envelope instead of the text report", false)
    .action((flags: FeedbackFlags) => {
      const global = program.opts<GlobalOpts>();
      const opts: FeedbackOpts = {
        home: global.home,
        cwd: global.cwd,
        ...(flags.type ? { type: flags.type } : {}),
        ...(flags.title ? { title: flags.title } : {}),
        ...(flags.body ? { body: flags.body } : {}),
        ...(flags.area ? { area: flags.area } : {}),
        ...(flags.expected ? { expected: flags.expected } : {}),
        ...(flags.actual ? { actual: flags.actual } : {}),
        ...(flags.export ? { export: flags.export } : {}),
        ...(flags.submit ? { submit: true } : {}),
        ...(flags.attachDiagnostics ? { attachDiagnostics: true } : {}),
        ...(flags.json ? { json: true } : {}),
        ...(global.yes ? { yes: true } : {}),
      };
      report(runFeedback(opts));
    });

  program
    .command("changelog")
    .description("What shipped in ariadnev's own releases")
    .option("--from <version>", "only releases newer than this version")
    .option("--since-current", "only releases newer than the running binary", false)
    .option("--full", "include each release's notes", false)
    .option("--limit <n>", "how many releases to read")
    .option("--json", "emit the machine envelope instead of the text report", false)
    .action((flags: ChangelogFlags) =>
      report(
        runChangelog({
          ...(flags.from ? { from: flags.from } : {}),
          ...(flags.sinceCurrent ? { sinceCurrent: true } : {}),
          ...(flags.full ? { full: true } : {}),
          ...(flags.limit ? { limit: Number(flags.limit) } : {}),
          ...(flags.json ? { json: true } : {}),
        }),
      ),
    );
}
