// DELETE THIS FILE IN 1.4.0, along with the `run` registration in
// `register-harness-commands.ts` that calls it. It has no other callers, which
// is the point: a deprecation shim tangled into a conditional never gets
// removed, and one that is a whole file gets removed by deleting the file.
//
// WHY THE NAME IS MOVING. `av run` means the workflow harness. Everywhere else
// in this ecosystem `run <kit>/<skill>` means dispatching a single skill, and
// every piece of skill prose this project ports will use that meaning. Two
// incompatible senses of one verb is not a naming preference; it is a command
// that does something different depending on which document the user read. So
// the harness becomes `av workflow` and `run` is reserved for dispatch.
//
// THE DISCRIMINATOR is a slash. Dispatch grammar requires `<kit>/<skill>`;
// workflow IDs are single tokens and never contain one. That makes the two
// senses separable with no flag, no heuristic, and no ambiguous case in the
// middle — which is what lets the old spelling keep working for a release
// instead of being cut off on the day of the rename.
//
// THE WARNING GOES TO STDERR. `av run <id> --json` emits an envelope on stdout
// that scripts parse; a deprecation notice printed there would make the notice
// itself the breaking change it was written to avoid.

import { emitError } from "./emit.js";
import { UsageError } from "./exit-codes.js";

/** The release that removes this file. Named in the warning, not just here. */
export const RUN_SHIM_REMOVED_IN = "1.4.0";

/** Which of the two senses of `run` an invocation is asking for. */
export type RunSense = "dispatch" | "legacy-workflow";

/**
 * Decide which `run` an invocation means, and warn if it is the old one.
 *
 * A slashed positional is dispatch — the grammar this name was reserved for,
 * and now implemented. Anything else is the deprecated harness spelling: it
 * still works and still warns, through {@link RUN_SHIM_REMOVED_IN}.
 *
 * There is deliberately no third outcome. Silently reinterpreting an invocation
 * a user already has in a script is the failure this whole shim exists to
 * prevent, and it is the reason the discriminator is a slash rather than a
 * heuristic about what the token looks like.
 */
export function classifyRun(positional: string | undefined): RunSense {
  if (positional?.includes("/")) return "dispatch";
  const suffix = positional ? ` ${positional}` : "";
  emitError(
    `warning: av run${suffix} is deprecated and stops working in ${RUN_SHIM_REMOVED_IN}. ` +
      `Use av workflow run${suffix}`,
  );
  return "legacy-workflow";
}

/**
 * Refuse `av run resume|status|cancel` and name the new spelling.
 *
 * These moved outright rather than being shimmed, because dispatch grammar has
 * no subcommands for them to collide with — so there is nothing to disambiguate
 * and no reason to keep a second spelling alive. Left unregistered instead,
 * Commander would read `status` as a workflow ID and report that a workflow by
 * that name does not exist, which is a confusing answer to a correct command.
 */
export function refuseLegacyRunSubcommand(subcommand: string): never {
  throw new UsageError(`av run ${subcommand} has moved: use av workflow ${subcommand}`);
}
