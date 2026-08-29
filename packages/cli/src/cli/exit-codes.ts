// Exit codes for commands added from this point on.
//
// There is already a contract in the tree and it is not this one: `doctor` maps
// healthy/degraded/unhealthy to 0/1/2, and CI jobs gate on it. Under the table
// below, 2 means "the command was called wrong" — so retrofitting it onto
// doctor would turn "this install is broken" into "you passed a bad flag" in
// every one of those jobs, silently, on the exit code alone.
//
// So the table applies to new commands only. The difference is deliberate,
// documented in the README, and pinned by a regression test that fails if
// doctor's mapping ever changes.

export const EXIT = {
  /** The command did what was asked. */
  ok: 0,
  /** The command ran and the answer is negative: drift found, verify failed. */
  failed: 1,
  /** The command could not run as invoked: unknown subcommand, bad flag. */
  usage: 2,
  /** The command could not run because the environment is not ready. */
  unavailable: 3,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

/**
 * Commands predating this table, whose exit codes are their own contract.
 *
 * `workflow` was spelled `run` until the harness was renamed. The carve-out
 * belongs to the harness, not to the word: `run` now fronts skill dispatch,
 * which is new surface and takes the table above like anything else new.
 */
export const LEGACY_EXIT_COMMANDS = ["doctor", "audit", "validate", "eval", "skill", "workflow"] as const;

export class UsageError extends Error {
  readonly exitCode = EXIT.usage;
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export class UnavailableError extends Error {
  readonly exitCode = EXIT.unavailable;
  constructor(message: string) {
    super(message);
    this.name = "UnavailableError";
  }
}
