// `av sessions list | show | tail | stats | redact`.
//
// READ-ONLY, ALL FIVE. Nothing here opens a session file for writing, and
// `redact` prints a plan rather than editing — see `sessions/redact.ts` for why
// the oracle's `--apply` is not ported.
//
// SESSION CONTENT NEVER REACHES THE ACTIVITY LOG. These commands record no
// events. The activity vocabulary is a closed union with no session kind in it,
// so there is nothing to emit even by accident; this comment is here because
// the absence is deliberate rather than an oversight.

import { discoverSessions, SUPPORTED_AGENTS, UNSUPPORTED_AGENTS, type SessionAgent } from "../sessions/discover.js";
import { statSync } from "node:fs";
import { readFrom, readRecords } from "../sessions/parse.js";
import { messageText, summarizeSession, tokenTotals, truncatePreview } from "../sessions/summarize.js";
import { planRedactions } from "../sessions/redact.js";
import { UsageError } from "./exit-codes.js";
import { jsonEnvelope } from "./json-envelope.js";

export const SESSIONS_SCHEMA_VERSION = 1;

/** Matches the oracle's default page size. */
export const DEFAULT_SHOW_LIMIT = 200;
/** A finite snapshot, not the whole history — same reasoning as `activity list`. */
export const DEFAULT_LIST_LIMIT = 50;

export interface SessionsListOpts {
  readonly home: string;
  readonly projects?: readonly string[];
  readonly runtime?: string;
  readonly limit?: number;
  /** Include the truncated preview. Off by default — it carries the user's work. */
  readonly preview?: boolean;
  readonly json?: boolean;
  readonly env?: NodeJS.ProcessEnv;
}

function parseRuntime(runtime: string | undefined): SessionAgent[] | undefined {
  if (!runtime) return undefined;
  if ((UNSUPPORTED_AGENTS as readonly string[]).includes(runtime)) {
    // Named as unreadable rather than answered with an empty list, which is
    // indistinguishable from an agent nobody used.
    throw new UsageError(
      `${runtime} sessions cannot be read: its on-disk layout is not one this build has verified. ` +
        `Readable runtimes: ${SUPPORTED_AGENTS.join(", ")}`,
    );
  }
  if (!(SUPPORTED_AGENTS as readonly string[]).includes(runtime)) {
    throw new UsageError(`unknown runtime: ${runtime}. Readable runtimes: ${SUPPORTED_AGENTS.join(", ")}`);
  }
  return [runtime as SessionAgent];
}

export function runSessionsList(opts: SessionsListOpts): string {
  const found = discoverSessions({
    home: opts.home,
    ...(opts.projects ? { projects: opts.projects } : {}),
    ...(parseRuntime(opts.runtime) ? { agents: parseRuntime(opts.runtime)! } : {}),
    ...(opts.env ? { env: opts.env } : {}),
  }).slice(0, opts.limit ?? DEFAULT_LIST_LIMIT);

  const sessions = found.map((session) => summarizeSession(session, { includePreview: !!opts.preview }));

  if (opts.json) {
    return jsonEnvelope(SESSIONS_SCHEMA_VERSION, "sessions.list", { sessions, total: sessions.length });
  }
  if (sessions.length === 0) return "No sessions found for registered projects.";
  const lines = sessions.map((session) => {
    const head = `  ${session.id}  ${session.runtime}  ${session.project_id || "—"}  ${session.message_count} msg  ${session.model || "—"}`;
    return opts.preview && session.last_message_preview ? `${head}\n      ${session.last_message_preview}` : head;
  });
  return [`${sessions.length} session(s):`, ...lines].join("\n");
}

export interface SessionsShowOpts {
  readonly home: string;
  readonly project: string;
  readonly sessionId: string;
  readonly cursor?: number;
  readonly limit?: number;
  readonly json?: boolean;
  readonly env?: NodeJS.ProcessEnv;
}

interface ShownMessage {
  readonly role: string;
  readonly timestamp: string;
  readonly text: string;
}

interface ConversationRecord {
  type?: string;
  timestamp?: string;
  message?: { role?: string; content?: unknown };
}

/**
 * The two record types that carry conversation.
 *
 * Everything else in these files — attachments, mode changes, hook results,
 * file-history snapshots — is machinery. A real session held 1,862 attachment
 * records against 348 user messages, so this predicate is the difference
 * between a page of messages and a page of bookkeeping.
 */
function isConversation(record: ConversationRecord): boolean {
  return record.type === "user" || record.type === "assistant";
}

function locate(opts: { home: string; project: string; sessionId: string; env?: NodeJS.ProcessEnv }) {
  const found = discoverSessions({
    home: opts.home,
    projects: [opts.project],
    ...(opts.env ? { env: opts.env } : {}),
  }).find((session) => session.id === opts.sessionId)
    // Codex sessions are not reachable by project, so fall back to a full scan
    // before declaring the session missing.
    ?? discoverSessions({ home: opts.home, ...(opts.env ? { env: opts.env } : {}) })
      .find((session) => session.id === opts.sessionId);
  if (!found) throw new UsageError(`no session ${opts.sessionId} found for project ${opts.project}`);
  return found;
}

export function runSessionsShow(opts: SessionsShowOpts): string {
  const found = locate(opts);
  // `--limit` counts messages, which is what its help says. Applying it to
  // lines would return an empty page from a session full of conversation: a
  // real file opens with several metadata records before the first message.
  const page = readRecords<ConversationRecord>(found.path, {
    cursor: opts.cursor ?? 0,
    limit: opts.limit ?? DEFAULT_SHOW_LIMIT,
    keep: isConversation,
  });

  const messages: ShownMessage[] = page.entries.map((record) => ({
    role: record.message?.role ?? record.type ?? "",
    timestamp: record.timestamp ?? "",
    text: messageText(record.message?.content),
  }));

  if (opts.json) {
    return jsonEnvelope(SESSIONS_SCHEMA_VERSION, "sessions.show", {
      session_id: found.id,
      messages,
      total: messages.length,
      skipped_lines: page.skipped,
      ...(page.nextCursor === undefined ? {} : { next_cursor: page.nextCursor }),
    });
  }
  if (messages.length === 0) return `No messages in this window of ${found.id}.`;
  const lines = messages.map((message) => `  [${message.role}] ${message.timestamp}\n    ${message.text}`);
  if (page.skipped > 0) lines.push(`  (${page.skipped} unreadable line(s) skipped)`);
  if (page.nextCursor !== undefined) lines.push(`  more: --cursor ${page.nextCursor}`);
  return lines.join("\n");
}

export interface SessionsStatsOpts {
  readonly home: string;
  readonly projects?: readonly string[];
  readonly by?: string;
  readonly metric?: string;
  readonly json?: boolean;
  readonly env?: NodeJS.ProcessEnv;
}

const METRICS = ["tokens", "messages", "sessions", "duration"] as const;
const DIMENSIONS = ["runtime", "model", "project"] as const;

export function runSessionsStats(opts: SessionsStatsOpts): string {
  const metric = opts.metric ?? "tokens";
  const dimension = opts.by ?? "runtime";
  if (!(METRICS as readonly string[]).includes(metric)) {
    throw new UsageError(`unknown --metric: ${metric}. Available: ${METRICS.join(", ")}`);
  }
  if (!(DIMENSIONS as readonly string[]).includes(dimension)) {
    throw new UsageError(`unknown --by: ${dimension}. Available: ${DIMENSIONS.join(", ")}`);
  }

  const found = discoverSessions({
    home: opts.home,
    ...(opts.projects ? { projects: opts.projects } : {}),
    ...(opts.env ? { env: opts.env } : {}),
  });

  const totals = new Map<string, number>();
  // Per-runtime data quality, the way the oracle's `provenance` map reports it.
  // Token counts exist only in Claude Code's records, so a `tokens` row for
  // Codex is `unavailable` rather than a zero that reads as "none used".
  const quality = new Map<string, "exact" | "unavailable">();

  for (const session of found) {
    const summary = summarizeSession(session);
    const key =
      dimension === "runtime" ? summary.runtime
      : dimension === "model" ? (summary.model || "unknown")
      : (summary.project_id || "unknown");

    let value = 0;
    let known = true;
    if (metric === "sessions") value = 1;
    else if (metric === "messages") value = summary.message_count;
    else if (metric === "duration") value = summary.duration_ms;
    else {
      const tokens = tokenTotals(session);
      value = tokens.input + tokens.output;
      known = session.agent === "claude-code";
    }

    totals.set(key, (totals.get(key) ?? 0) + value);
    if (!known) quality.set(key, "unavailable");
    else if (!quality.has(key)) quality.set(key, "exact");
  }

  const rows = [...totals.entries()]
    .map(([key, value]) => ({ metric, dimension, key, value, quality: quality.get(key) ?? "exact" }))
    .sort((a, b) => b.value - a.value);
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  if (opts.json) {
    return jsonEnvelope(SESSIONS_SCHEMA_VERSION, "sessions.stats", {
      rows,
      total,
      metric,
      dimension,
      unreadable_runtimes: [...UNSUPPORTED_AGENTS],
    });
  }
  if (rows.length === 0) return "No sessions found for registered projects.";
  const lines = rows.map((row) => `  ${row.key}: ${row.value}${row.quality === "exact" ? "" : "  (unavailable for this runtime)"}`);
  return [`${metric} by ${dimension}`, ...lines, `  total: ${total}`].join("\n");
}

export interface SessionsRedactOpts {
  readonly home: string;
  readonly projects?: readonly string[];
  readonly sessions?: readonly string[];
  readonly redactEmails?: boolean;
  readonly json?: boolean;
  readonly env?: NodeJS.ProcessEnv;
}

export function runSessionsRedact(opts: SessionsRedactOpts): string {
  const all = discoverSessions({
    home: opts.home,
    ...(opts.projects ? { projects: opts.projects } : {}),
    ...(opts.env ? { env: opts.env } : {}),
  });
  const selected = opts.sessions?.length
    ? all.filter((session) => opts.sessions!.some((id) => session.id.includes(id)))
    : all;

  const report = planRedactions(selected, { redactEmails: !!opts.redactEmails });

  if (opts.json) {
    return jsonEnvelope(SESSIONS_SCHEMA_VERSION, "sessions.redact", {
      // Only counts and line positions — never the matched value. A report that
      // quoted a credential would be a second copy of the problem.
      plans: report.plans.map((plan) => ({
        session_id: plan.sessionId,
        findings: plan.findings,
        lines_scanned: plan.linesScanned,
      })),
      sessions_scanned: report.sessionsScanned,
      findings_total: report.findingsTotal,
      applied: false,
    });
  }
  const lines = [`Scanned ${report.sessionsScanned} session(s); ${report.findingsTotal} finding(s).`];
  for (const plan of report.plans) {
    if (plan.findings.length === 0) continue;
    lines.push(`  ${plan.sessionId}: ${plan.findings.length} finding(s)`);
    for (const finding of plan.findings.slice(0, 10)) {
      lines.push(`      line ${finding.line}: ${finding.matches} ${finding.kind} match(es)`);
    }
  }
  lines.push("");
  lines.push("Nothing was changed. ariadnev does not rewrite another tool's session files.");
  return lines.join("\n");
}

export interface SessionsTailOpts {
  readonly home: string;
  readonly project: string;
  readonly sessionId: string;
  readonly json?: boolean;
  readonly onLine: (line: string) => void;
  readonly signal?: AbortSignal;
  readonly intervalMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Follow a session, printing messages appended after the tail starts.
 *
 * Same shape as `tailActivity` — injected clock and abort signal so the loop is
 * testable without real time, and a cursor rather than a file offset. The
 * mechanism cannot literally be shared: that one reads the activity log's own
 * segments, this one reads a file another tool owns. What carries over is that
 * the cursor is a **position**, so a file being appended to needs no special
 * handling; the next poll simply starts where the last one stopped.
 *
 * Starts at the current end of the file: `tail` means new messages only.
 */
export async function tailSession(opts: SessionsTailOpts): Promise<void> {
  const intervalMs = opts.intervalMs ?? 1000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const found = locate(opts);
  // Start at the current end of the file, taken from its size rather than by
  // reading it: `tail` shows new messages, so there is no reason to parse the
  // twenty megabytes it is skipping.
  let offset = sessionSize(found.path);

  while (!opts.signal?.aborted) {
    const window = readFrom<unknown>(found.path, offset);
    for (const record of window.entries) {
      const line = renderTailLine(record, !!opts.json);
      if (line !== undefined) opts.onLine(line);
    }
    offset = window.endOffset;
    if (opts.signal?.aborted) break;
    await sleep(intervalMs);
  }
}

function sessionSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

/** One rendered line per message, for `tail`. */
export function renderTailLine(record: unknown, json: boolean): string | undefined {
  const typed = record as { type?: string; timestamp?: string; message?: { role?: string; content?: unknown } };
  if (typed.type !== "user" && typed.type !== "assistant") return undefined;
  const text = messageText(typed.message?.content);
  if (json) {
    return JSON.stringify({ role: typed.message?.role ?? typed.type, timestamp: typed.timestamp ?? "", text });
  }
  return `[${typed.message?.role ?? typed.type}] ${truncatePreview(text, 200)}`;
}

export { locate as locateSession };
