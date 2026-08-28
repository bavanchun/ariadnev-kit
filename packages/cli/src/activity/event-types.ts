// The activity vocabulary: what an event is, and what it is allowed to contain.
//
// This is the authoritative source the derived phases read from, so its shape
// is a contract rather than an implementation detail. Two properties are load
// bearing and neither is obvious from the type alone.
//
// THE `kind` UNION IS CLOSED. A free string makes a typo a new category, and an
// aggregate that groups by category is then quietly wrong with nothing to
// notice it. A union makes the same typo a compile error.
//
// THE FIELDS ARE AN ALLOWLIST, not a spread. `toActivityEvent` copies only the
// enumerated fields, so a caller handing over its whole options object cannot
// put a credential on disk. The history log learned this from a red team; the
// second log does not get to learn it again.

/** Every category of event this tool records. Adding one is a deliberate edit. */
export const ACTIVITY_KINDS = [
  "install.completed",
  "update.completed",
  "uninstall.completed",
  "project.initialized",
  "project.registered",
  "project.deregistered",
  "workflow.started",
  "workflow.completed",
  "workflow.failed",
  // Snapshot and restore. Recorded because these are the two operations whose
  // absence is hardest to reconstruct afterwards: "when did I last have a good
  // copy of this" and "what did that restore actually touch" are exactly the
  // questions someone asks after losing state, and the log is the only place
  // that can still answer them.
  "backup.created",
  "backup.restored",
  // Skill dispatch. Two events rather than one because dispatch spawns a
  // process that can outlive the question being asked about it: a run that
  // never returned leaves only a `started`, and that absence of a matching
  // `completed` is the signal worth being able to see.
  "dispatch.started",
  "dispatch.completed",
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export interface ActivityEventV1 {
  /** Payload schema version, independent of the JSON envelope's own. */
  readonly v: 1;
  /** Cursor identity. Monotonic and lexicographically sortable — see `nextEventId`. */
  readonly id: string;
  readonly ts: string;
  readonly kind: ActivityKind;
  /** Coding-agent runtime: `codex`, `claude-code`, … */
  readonly runtime?: string;
  readonly kit?: string;
  readonly skill?: string;
  readonly workflow?: string;
  /** Categorical outcome: `ok`, `failed`, `cancelled`. */
  readonly status?: string;
  readonly durationMs?: number;
}

/** Anything else on the input is ignored rather than persisted. */
export interface ActivityEventInput {
  readonly [key: string]: unknown;
}

/**
 * Ceiling on one serialized event.
 *
 * `O_APPEND` guarantees the write offset advances atomically. It does **not**
 * make a write of arbitrary size atomic, so beyond a certain length two
 * concurrent appends can interleave and tear a line. Capping the record is what
 * turns "concurrent appends never tear a line" into a claim the mechanism
 * actually supports. (It supports nothing at all on NFS; see `event-log.ts`.)
 */
export const MAX_EVENT_BYTES = 4096;

/** Ceiling on one categorical value, well under the record cap. */
const MAX_FIELD_LENGTH = 128;

function categorical(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  // `kit` and `skill` come from user-authored content, so their length is not
  // this module's to trust. Truncating here keeps one bad value from being the
  // reason a whole event is dropped.
  return value.length > MAX_FIELD_LENGTH ? value.slice(0, MAX_FIELD_LENGTH) : value;
}

/** Build an event, copying only the fields this vocabulary declares. */
export function toActivityEvent(
  kind: ActivityKind,
  data: ActivityEventInput = {},
  now: Date = new Date(),
): ActivityEventV1 {
  const event: {
    -readonly [K in keyof ActivityEventV1]: ActivityEventV1[K];
  } = { v: 1, id: nextEventId(), ts: now.toISOString(), kind };
  const runtime = categorical(data.runtime);
  const kit = categorical(data.kit);
  const skill = categorical(data.skill);
  const workflow = categorical(data.workflow);
  const status = categorical(data.status);
  if (runtime) event.runtime = runtime;
  if (kit) event.kit = kit;
  if (skill) event.skill = skill;
  if (workflow) event.workflow = workflow;
  if (status) event.status = status;
  if (typeof data.durationMs === "number" && Number.isFinite(data.durationMs)) event.durationMs = data.durationMs;
  return Object.freeze(event);
}

// Highest millisecond this process has already issued an ID for. The clock is
// allowed to move backwards; the cursor is not.
let lastMillis = 0;
let sequence = 0;

/**
 * A cursor ID: `<millis>-<sequence>`, both zero-padded to a fixed width.
 *
 * `av activity list --since <id>` is a string comparison, so byte order has to
 * equal emission order. Three things make that true:
 *
 * - **Fixed width.** A shorter string sorts before a longer one whatever its
 *   value, so a variable-width scheme breaks silently at a digit boundary.
 * - **Never goes backwards.** Wall clock is not monotonic — NTP correction and
 *   a manual clock change both move it back — so the millisecond used is
 *   clamped to the highest one already issued.
 * - **A sequence, not randomness.** Two events in the same millisecond must
 *   still order, and randomness would order them arbitrarily on each read.
 *
 * The honest limit: this is monotonic **per process**. Two processes appending
 * in the same millisecond order arbitrarily with respect to each other, though
 * they still order totally and stably once written.
 */
export function nextEventId(clock: () => number = Date.now): string {
  const now = clock();
  if (now > lastMillis) {
    lastMillis = now;
    sequence = 0;
  } else {
    sequence += 1;
  }
  return `${String(lastMillis).padStart(15, "0")}-${String(sequence).padStart(6, "0")}`;
}

/** One JSONL line, or a throw if the event exceeds the atomic-append ceiling. */
export function serializeEvent(event: ActivityEventV1): string {
  const line = JSON.stringify(event);
  const bytes = Buffer.byteLength(line, "utf8");
  if (bytes > MAX_EVENT_BYTES) {
    throw new Error(`activity event is too large to append atomically: ${bytes} bytes exceeds ${MAX_EVENT_BYTES}`);
  }
  return line;
}
