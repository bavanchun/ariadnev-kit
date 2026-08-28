// The one call an instrumented command makes.
//
// It exists so no call site can build an event and then forget to append it
// safely: pairing the allowlist scrub with the never-throwing append is the
// whole job, and having exactly one place that does it is what keeps the
// fire-and-forget rule from being re-decided per caller.

import { appendActivityEvent } from "./event-log.js";
import { toActivityEvent, type ActivityEventInput, type ActivityKind } from "./event-types.js";

/**
 * Record that something happened. Never throws.
 *
 * `home` is passed rather than read from the environment because every caller
 * already has the resolved one — `--home` moves the log, and an emitter that
 * ignored the flag would write outside the directory the user chose.
 */
export function recordActivity(home: string, kind: ActivityKind, fields: ActivityEventInput = {}): void {
  appendActivityEvent(home, toActivityEvent(kind, fields));
}
