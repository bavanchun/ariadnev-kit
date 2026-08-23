// `av query` — read the JSONL history log and render it. The reader is
// injectable so the formatter is unit-testable without touching the filesystem.

import { readEvents, historyPath, isDegraded } from "../history/store.js";
import { jsonEnvelope } from "./json-envelope.js";
import type { HistoryEvent } from "../history/record.js";
import { coral, amber, faint, symbols, type StyleOpts } from "../ui/style.js";

export type QueryView = "installs" | "doctor" | "history";

export function normalizeView(v: string | undefined): QueryView {
  if (v === "installs" || v === "install") return "installs";
  if (v === "doctor") return "doctor";
  return "history";
}

const MAX_ROWS = 30;

export function renderQuery(
  view: QueryView,
  events: HistoryEvent[],
  degraded: boolean,
  opts: StyleOpts = { color: false },
): string {
  const lines = [`${coral("ariadnev", opts)} history — ${view}`];
  if (degraded) {
    lines.push(amber(`  ${symbols.warn} recording degraded — history may be incomplete`, opts));
  }
  const filtered =
    view === "installs"
      ? events.filter((e) => e.kind === "install" || e.kind === "uninstall")
      : view === "doctor"
        ? events.filter((e) => e.kind === "doctor")
        : events;

  if (filtered.length === 0) {
    lines.push(faint("  (no events recorded yet)", opts));
    return lines.join("\n");
  }
  for (const e of filtered.slice(-MAX_ROWS)) {
    const parts: string[] = [e.kind];
    if (e.provider) parts.push(e.provider);
    if (e.status) parts.push(e.status);
    if (e.version) parts.push(`v${e.version}`);
    if (e.count != null) parts.push(`(${e.count})`);
    lines.push(`  ${faint(e.ts, opts)}  ${parts.join(" ")}`);
  }
  return lines.join("\n");
}

export const QUERY_SCHEMA_VERSION = 1;

export interface QueryOpts {
  view: QueryView;
  json?: boolean;
  home: string;
  color?: boolean;
  /** Test seam: supply events directly instead of reading the file. */
  events?: HistoryEvent[];
  degraded?: boolean;
}

export function runQuery(opts: QueryOpts): string {
  const events = opts.events ?? readEvents(historyPath(opts.home));
  const degraded = opts.degraded ?? isDegraded(opts.home);
  if (opts.json) {
    return jsonEnvelope(QUERY_SCHEMA_VERSION, `query.${opts.view}`, { view: opts.view, degraded, events });
  }
  return renderQuery(opts.view, events, degraded, { color: !!opts.color });
}
