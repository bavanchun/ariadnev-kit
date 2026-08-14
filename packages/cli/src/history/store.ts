// Append-only JSONL history at ~/.ariadnev/history.jsonl. Node-native (no
// bun:sqlite → never poisons the Node test graph). Recording is best-effort:
// a write failure never breaks the host command, but drops a marker so `query`
// and `doctor` can distinguish "no history" from "recording broken".

import { appendFileSync, readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import type { HistoryEvent } from "./record.js";

export function historyPath(home: string): string {
  return join(home, ".ariadnev", "history.jsonl");
}

export function degradedMarkerPath(home: string): string {
  return join(home, ".ariadnev", "history.degraded");
}

export function appendEvent(path: string, event: HistoryEvent): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(event)}\n`);
}

/** Read all events, skipping any corrupt line (tolerant parse). */
export function readEvents(path: string): HistoryEvent[] {
  if (!existsSync(path)) return [];
  const out: HistoryEvent[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as HistoryEvent);
    } catch {
      // Skip a truncated/corrupt line rather than failing the whole read.
    }
  }
  return out;
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
  try {
    (deps.append ?? appendEvent)(historyPath(home), event);
  } catch {
    try {
      const marker = degradedMarkerPath(home);
      mkdirSync(dirname(marker), { recursive: true });
      writeFileSync(marker, new Date().toISOString());
    } catch {
      // Nothing more we can do — but the host command still succeeds.
    }
  }
}
