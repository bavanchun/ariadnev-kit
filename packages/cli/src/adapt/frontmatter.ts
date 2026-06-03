import matter from "gray-matter";
import type { ProviderId } from "../providers/spec-verified.js";
import { rewriteTools } from "./tool-rewrites.js";

export interface ParsedFrontmatter {
  data: Record<string, unknown>;
  body: string;
}

export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const parsed = matter(raw);
  return { data: parsed.data ?? {}, body: parsed.content.replace(/^\n+/, "") };
}

export function serializeFrontmatter(data: Record<string, unknown>, body: string): string {
  if (Object.keys(data).length === 0) return body;
  return matter.stringify(body, data);
}

const STRIP = Symbol("strip");

// Tool-NAME map for frontmatter values (allowed-tools entries). Distinct from
// body phrase rewrites: these stay valid identifiers or are stripped entirely.
const NAME_MAP: Partial<Record<ProviderId, Record<string, string | typeof STRIP>>> = {
  codex: {
    AskUserQuestion: "request_user_input",
    TodoWrite: "update_plan",
    TaskCreate: "update_plan",
    TaskUpdate: "update_plan",
    TaskGet: "update_plan",
    TaskList: "update_plan",
    Task: "spawn_agent",
    SendMessage: "send_input",
  },
  cursor: {
    Task: "spawn_agent",
    SendMessage: "send_message",
    AskUserQuestion: STRIP, // no Cursor equivalent
  },
};

function toList(value: unknown): string[] | null {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.split(",").map((s) => s.trim()).filter(Boolean);
  return null;
}

function mapToolList(list: string[], map: Record<string, string | typeof STRIP>): string[] {
  const out: string[] = [];
  for (const tool of list) {
    const mapped = map[tool];
    if (mapped === STRIP) continue;
    const next = typeof mapped === "string" ? mapped : tool;
    if (!out.includes(next)) out.push(next);
  }
  return out;
}

/**
 * Rewrite/strip tool names inside `allowed-tools` / `disallowed-tools` and adapt
 * `argument-hint` for the target provider. Body rewrites alone are insufficient
 * because providers parse the frontmatter directly.
 */
export function adaptFrontmatterTools(
  data: Record<string, unknown>,
  provider: ProviderId,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...data };
  const map = NAME_MAP[provider];
  if (map) {
    for (const key of ["allowed-tools", "disallowed-tools"]) {
      const list = toList(next[key]);
      if (list) next[key] = mapToolList(list, map);
    }
  }
  if (typeof next["argument-hint"] === "string") {
    next["argument-hint"] = rewriteTools(next["argument-hint"], provider);
  }
  return next;
}
