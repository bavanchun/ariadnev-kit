// Turning a session file into the metadata envelope `list` reports.
//
// FIELD NAMES ARE THE ORACLE'S, snake_case included. They cost nothing to match
// and they make ariadnev's output drop-in for a consumer already reading the
// other tool. The one thing not matched is `last_message_preview` — see below.
//
// A MESSAGE IS NOT A LINE. Claude Code writes ten-plus record types into these
// files, and most carry no conversation: the session surveyed for the probe
// held 1,862 `attachment` records and 127 each of four metadata types against
// 348 `user` and 599 `assistant`. Counting lines would overstate the message
// count several-fold, so only the two conversational types count.
//
// THE PREVIEW IS THE HAZARD. The upstream CLI's `sessions list --json` printed
// a sentence written seconds earlier in the live session, plus prose from two
// unrelated projects. It is the default output of the most-used verb. Here it
// is truncated hard and omitted unless the caller asks for it by name.

import { basename } from "node:path";
import { readRecords, scanCounts, streamLines } from "./parse.js";
import type { DiscoveredSession, SessionAgent } from "./discover.js";

/** Hard ceiling on a preview. Short enough to be a hint, not a transcript. */
export const PREVIEW_LIMIT = 80;

/** The record shapes each agent writes, reduced to what a summary needs. */
interface ClaudeRecord {
  type?: string;
  timestamp?: string;
  message?: { model?: string; role?: string; content?: unknown; usage?: ClaudeUsage };
}

interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface CodexRecord {
  type?: string;
  timestamp?: string;
  payload?: { session_id?: string; cwd?: string; model_provider?: string; model?: string };
}

export interface SessionSummary {
  readonly id: string;
  readonly project_id: string;
  readonly started_at: string;
  readonly ended_at: string;
  readonly message_count: number;
  readonly model: string;
  readonly duration_ms: number;
  readonly size_bytes: number;
  /** Present only when the caller explicitly asked. Truncated to PREVIEW_LIMIT. */
  readonly last_message_preview?: string;
  readonly runtime: SessionAgent;
  /** Unparseable lines encountered. Reported so a count is never silently short. */
  readonly skipped_lines: number;
}

/**
 * Flatten a message body to plain text.
 *
 * Content is either a string or an array of typed blocks. Only text blocks are
 * read: a tool-use block's input is arguments, which is where a token or a file
 * path would be, and none of that belongs in a preview.
 */
export function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block === "string") parts.push(block);
    else if (block && typeof block === "object" && (block as { type?: string }).type === "text") {
      const text = (block as { text?: unknown }).text;
      if (typeof text === "string") parts.push(text);
    }
  }
  return parts.join(" ");
}

/** One line, hard-capped. Newlines collapse so a preview can never be a block. */
export function truncatePreview(text: string, limit = PREVIEW_LIMIT): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit)}…`;
}

export interface SummarizeOptions {
  /** Include `last_message_preview`. Off by default — it carries the user's work. */
  readonly includePreview?: boolean;
}

function summarizeClaudeCode(found: DiscoveredSession, options: SummarizeOptions): SessionSummary {
  const { entries, skipped } = readRecords<ClaudeRecord>(found.path);
  let started: string | undefined;
  let ended: string | undefined;
  let model = "";
  let messages = 0;
  let lastText = "";

  for (const record of entries) {
    if (record.timestamp) {
      started ??= record.timestamp;
      ended = record.timestamp;
    }
    if (record.type !== "user" && record.type !== "assistant") continue;
    messages += 1;
    // The last model wins rather than the first: a session can switch models,
    // and the one in use now is the more useful answer.
    if (record.message?.model) model = record.message.model;
    if (options.includePreview) {
      const text = messageText(record.message?.content);
      if (text) lastText = text;
    }
  }

  return {
    id: found.id,
    project_id: found.projectId ?? "",
    started_at: started ?? found.modifiedAt,
    ended_at: ended ?? found.modifiedAt,
    message_count: messages,
    model,
    duration_ms: durationMs(started, ended),
    size_bytes: found.sizeBytes,
    runtime: "claude-code",
    skipped_lines: skipped,
    ...(options.includePreview ? { last_message_preview: truncatePreview(lastText) } : {}),
  };
}

function summarizeCodex(found: DiscoveredSession, options: SummarizeOptions): SessionSummary {
  const { entries, skipped } = readRecords<CodexRecord>(found.path);
  let started: string | undefined;
  let ended: string | undefined;
  let model = "";
  let cwd = "";
  let messages = 0;

  for (const record of entries) {
    if (record.timestamp) {
      started ??= record.timestamp;
      ended = record.timestamp;
    }
    if (record.type === "session_meta") {
      cwd = record.payload?.cwd ?? "";
      model = record.payload?.model ?? record.payload?.model_provider ?? "";
    }
    if (record.type === "response_item") messages += 1;
  }

  return {
    id: found.id,
    // Codex shards by date, so the project comes from the cwd its own metadata
    // records rather than from the path.
    project_id: basename(cwd),
    started_at: started ?? found.modifiedAt,
    ended_at: ended ?? found.modifiedAt,
    message_count: messages,
    model,
    duration_ms: durationMs(started, ended),
    size_bytes: found.sizeBytes,
    runtime: "codex",
    skipped_lines: skipped,
    ...(options.includePreview ? { last_message_preview: "" } : {}),
  };
}

function durationMs(started?: string, ended?: string): number {
  if (!started || !ended) return 0;
  const ms = Date.parse(ended) - Date.parse(started);
  // A clock that moved backwards mid-session would otherwise report a negative
  // duration, which every aggregate downstream would happily sum.
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

export function summarizeSession(found: DiscoveredSession, options: SummarizeOptions = {}): SessionSummary {
  return found.agent === "codex" ? summarizeCodex(found, options) : summarizeClaudeCode(found, options);
}

/**
 * A summary that reads only the file's size, not its content.
 *
 * `list` over dozens of sessions would otherwise parse every one of them —
 * tens of megabytes to print a table. Callers that need timestamps and models
 * ask for the full summary per session instead.
 */
export function quickSummary(found: DiscoveredSession): Pick<SessionSummary, "id" | "runtime" | "size_bytes"> & {
  lines: number;
} {
  return { id: found.id, runtime: found.agent, size_bytes: found.sizeBytes, lines: scanCounts(found.path).lines };
}

/** Token totals for `stats`, streamed so a large session is never held. */
export function tokenTotals(found: DiscoveredSession): { input: number; output: number } {
  if (found.agent !== "claude-code") return { input: 0, output: 0 };
  let input = 0;
  let output = 0;
  for (const raw of streamLines(found.path)) {
    const line = raw.trim();
    if (line.length === 0) continue;
    let record: ClaudeRecord;
    try {
      record = JSON.parse(line) as ClaudeRecord;
    } catch {
      continue;
    }
    const usage = record.message?.usage;
    if (!usage) continue;
    input += (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
    output += usage.output_tokens ?? 0;
  }
  return { input, output };
}
