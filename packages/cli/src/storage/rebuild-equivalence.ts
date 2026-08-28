// The standing invariant behind ADR 0014: delete the derived index, rebuild it,
// get the same answer. If that ever stops being true, something under
// `derived/` has quietly become the only copy of something.
//
// WRITTEN BEFORE ITS FIRST CONSUMER, DELIBERATELY. A gate added after the code
// it guards is shaped around what was already built — it ends up asserting the
// behaviour it found rather than the behaviour that was wanted. The case list
// below is empty today and gains an entry as each index-touching command lands.
//
// The list of commands that owe a case is NOT maintained by remembering. It is
// declared here and checked against the live command surface, so the phase that
// registers `analytics` finds this test red until it supplies the case. A
// forgotten case would otherwise fail silently, which for an invariant is the
// same as not having one.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { rebuildIndex } from "../analytics/rebuild.js";
import { runAnalyticsStatus } from "../cli/analytics-command.js";
import { runDataStatus } from "../cli/data-command.js";
import { enableAnalytics } from "../analytics/lifecycle.js";
import { activityRoot } from "./operational-paths.js";
import type { SqlRow } from "./driver.js";

/**
 * Commands that own state under `~/.ariadnev/operational/derived/`.
 *
 * Read off the plan's storage design rather than discovered at runtime: a
 * command cannot be asked whether it writes an index until it exists, and the
 * point is to have the obligation recorded before it does.
 */
export const INDEX_TOUCHING_COMMANDS = ["analytics", "content-search", "data"] as const;

/**
 * Files outside `storage/` allowed to reach for a `derived/` path, and the
 * command each one belongs to.
 *
 * `INDEX_TOUCHING_COMMANDS` above is a closed list, so on its own it cannot
 * notice a *new* command that starts writing derived state without being named.
 * This is the other half: the test enumerates everything importing a derived
 * path helper and fails on anything not registered here. Adding an entry points
 * at a command, and a registered command with no case fails `casesOwed`.
 */
export const DERIVED_CONSUMERS: Readonly<Record<string, (typeof INDEX_TOUCHING_COMMANDS)[number]>> = {
  "analytics/lifecycle.ts": "analytics",
  "analytics/rebuild.ts": "analytics",
  "cli/analytics-command.ts": "analytics",
  "cli/data-command.ts": "data",
  "data/retention.ts": "data",
};

export interface RebuildCase {
  /** The `av` command whose observable output must survive the round trip. */
  readonly command: (typeof INDEX_TOUCHING_COMMANDS)[number];
  /** What this case actually proves, in one line. */
  readonly note: string;
  /** Write the authoritative files the index is derived from. */
  seed(home: string): void;
  /** Build (or rebuild) the derived state from those files. */
  rebuild(home: string): void;
  /** The answer under test. Must be comparable by value. */
  observe(home: string): SqlRow[] | unknown;
}

/** Activity segments are the cheapest authoritative source to seed. */
function seedSources(home: string): void {
  mkdirSync(activityRoot(home), { recursive: true });
  const events = [
    { v: 1, id: "1", ts: "2026-08-28T00:00:00.000Z", kind: "install.completed", runtime: "claude-code" },
    { v: 1, id: "2", ts: "2026-08-28T00:00:01.000Z", kind: "workflow.completed", runtime: "codex", durationMs: 40 },
  ];
  writeFileSync(
    join(activityRoot(home), "activity-20260828.jsonl"),
    `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
  );
}

const REBUILD_AT = "2026-08-28T12:00:00.000Z";

/**
 * One case per index-touching command that is registered.
 *
 * Each observes the command's own **output**, not the index behind it. That is
 * the point: the invariant is about the answer a user gets surviving the loss
 * of the cache, not about a table being reconstructible.
 */
export const rebuildEquivalenceCases: readonly RebuildCase[] = [
  {
    command: "analytics",
    note: "status reports the same facts after the index is deleted and rebuilt",
    seed(home) {
      seedSources(home);
      enableAnalytics(home, REBUILD_AT);
    },
    rebuild(home) {
      rebuildIndex(home, { now: REBUILD_AT, env: {} });
    },
    observe(home) {
      // `last_successful_at` is pinned by the fixed `now` above, so it compares
      // by value rather than being excluded — excluding a field is how a
      // comparison quietly stops covering the thing that changed.
      return JSON.parse(runAnalyticsStatus({ home, now: REBUILD_AT, json: true })) as unknown;
    },
  },
  {
    command: "data",
    note: "status reports the same classes after the index is deleted and rebuilt",
    seed(home) {
      seedSources(home);
      enableAnalytics(home, REBUILD_AT);
    },
    rebuild(home) {
      rebuildIndex(home, { now: REBUILD_AT, env: {} });
    },
    observe(home) {
      return JSON.parse(runDataStatus({ home, now: REBUILD_AT, json: true })) as unknown;
    },
  },
];

/** Commands that are registered, own derived state, and still have no case. */
export function casesOwed(registered: Iterable<string>): string[] {
  const live = new Set(registered);
  const covered = new Set(rebuildEquivalenceCases.map((entry) => entry.command));
  return INDEX_TOUCHING_COMMANDS.filter((command) => live.has(command) && !covered.has(command));
}
