// Pure event mapping for the JSONL history log. `toEvent` is an allowlist scrub:
// it copies ONLY the enumerated categorical fields onto the event, so free-form
// or secret data in the caller's payload can never be persisted (red-team).

export type HistoryKind = "install" | "uninstall" | "doctor" | "update" | "eval";

export interface HistoryEvent {
  ts: string; // ISO timestamp
  kind: HistoryKind;
  provider?: string; // categorical provider id(s), comma-joined
  scope?: "project" | "global";
  version?: string; // vcskill version at the time
  status?: string; // categorical outcome, e.g. "healthy" | "degraded" | "ok"
  count?: number; // a numeric bucket (files written, skills scored, …)
}

export interface EventInput {
  provider?: string;
  scope?: "project" | "global";
  version?: string;
  status?: string;
  count?: number;
  // Anything else on the input object is intentionally ignored (scrubbed).
  [key: string]: unknown;
}

export function toEvent(kind: HistoryKind, data: EventInput = {}, now: Date = new Date()): HistoryEvent {
  const e: HistoryEvent = { ts: now.toISOString(), kind };
  if (typeof data.provider === "string") e.provider = data.provider;
  if (data.scope === "project" || data.scope === "global") e.scope = data.scope;
  if (typeof data.version === "string") e.version = data.version;
  if (typeof data.status === "string") e.status = data.status;
  if (typeof data.count === "number" && Number.isFinite(data.count)) e.count = data.count;
  return e;
}
