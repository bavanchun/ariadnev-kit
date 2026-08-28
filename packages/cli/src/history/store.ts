// Append-only JSONL history at ~/.ariadnev/history.jsonl. Node-native (no
// bun:sqlite → never poisons the Node test graph). Recording is best-effort:
// a write failure never breaks the host command, but drops a marker so `query`
// and `doctor` can distinguish "no history" from "recording broken".
//
// The append/read/marker mechanism itself lives in `log/jsonl-log.ts`, shared
// with the activity log. This module owns *what history means* — the path, the
// event type, and the fact that `av query` reads it — and nothing else. When
// the second log arrived, one copy of the durability rules was the difference
// between two logs that agree and two that quietly disagree.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { appendLine, appendLineSafe, readLines } from "../log/jsonl-log.js";
import type { HistoryEvent } from "./record.js";

export function historyPath(home: string): string {
  return join(home, ".ariadnev", "history.jsonl");
}

export function degradedMarkerPath(home: string): string {
  return join(home, ".ariadnev", "history.degraded");
}

export function appendEvent(path: string, event: HistoryEvent): void {
  appendLine(path, JSON.stringify(event));
}

/** Read all events, skipping any corrupt line (tolerant parse). */
export function readEvents(path: string): HistoryEvent[] {
  return readLines<HistoryEvent>(path);
}

export function isDegraded(home: string): boolean {
  return existsSync(degradedMarkerPath(home));
}

/** Record an event, best-effort. Never throws. Injectable append for tests. */
export function recordSafe(
  home: string,
  event: HistoryEvent,
  deps: { append?: (path: string, event: HistoryEvent) => void } = {},
): void {
  const append = deps.append;
  appendLineSafe(
    { path: historyPath(home), line: JSON.stringify(event), markerPath: degradedMarkerPath(home) },
    // The injected seam is typed in events, not lines, because that is the
    // shape this module's callers and tests already speak.
    append ? { append: (path) => append(path, event) } : {},
  );
}
