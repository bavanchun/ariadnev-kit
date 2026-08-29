// The one machine-readable envelope, extracted from the five copies of it.
//
// `plan`, `journal`, `kit`, `mcp` and `adapters` each grew a private
// `envelope()` emitting byte-identical output. This is that function, and those
// five now import it — the shape was never in dispute, only its ownership.
//
// The version stays a per-command constant rather than a single global one. A
// command's payload changes on its own schedule, and one shared number would
// mean every consumer of every other command sees a version bump for a change
// that cannot affect them.

/** `kind` is dot-namespaced: `plan.list`, `kit.install-path`, `backups.verify`. */
export function jsonEnvelope(schemaVersion: number, kind: string, data: unknown): string {
  return JSON.stringify({ schema_version: schemaVersion, kind, data }, null, 2);
}

/**
 * Commands whose JSON predates this envelope and is their own contract.
 *
 * Measured, not assumed — each of these was checked against what it emits:
 *
 * | command    | how it differs                                     |
 * |------------|----------------------------------------------------|
 * | `contract` | `protocol_version: "2"`, a string, not a number    |
 * | `audit`    | `protocol_version` with the payload spread flat    |
 * | `config`   | camelCase `schemaVersion`, payload flat            |
 * | `workflow` | camelCase `schemaVersion`, payload flat            |
 * | `eval`     | camelCase `schemaVersion`, payload flat            |
 *
 * `validate` is **not** here despite appearing on an earlier draft of this list:
 * it emits no JSON at all, so it has no shape to preserve. It is a surface still
 * to be added, and it gets the envelope when it is.
 *
 * `workflow` was spelled `run` until the harness was renamed. The exemption
 * follows the harness rather than the name: `run` is now reserved for skill
 * dispatch, and dispatch was never granted a compatibility carve-out. Leaving
 * `run` here would have handed the new command a frozen shape it does not have.
 *
 * Mirrors `LEGACY_EXIT_COMMANDS` in `exit-codes.ts`, for the same reason: the
 * point of writing the exception down is that adding to it takes a deliberate
 * edit rather than happening by drift.
 */
export const LEGACY_JSON_COMMANDS = ["contract", "audit", "config", "workflow", "eval"] as const;
