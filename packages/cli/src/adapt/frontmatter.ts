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

/**
 * Providers that read the agent `tools:` key as a typed value rather than text.
 *
 * agy checks the frontmatter by type: an unknown key passes through, but a
 * *known* key of the wrong YAML shape makes it drop the whole agent — no
 * warning, no partial load. `tools` must be a sequence, and the canonical kit
 * writes Claude Code's comma-separated string, which is why 16 agent files sat
 * in agy's own discovery root without one of them ever being listed.
 *
 * Only the container changes. The entries stay verbatim because this provider's
 * `toolNames` cell is unverified, and renaming on a static guess would put
 * invented identifiers into a file the user reads as authoritative.
 */
const TYPED_TOOLS_PROVIDERS = new Set<ProviderId>(["antigravity"]);

/**
 * Frontmatter keys a provider drops the whole artifact over.
 *
 * `model` was planted on an agent agy had already listed, in three spellings —
 * the kit's own alias (`haiku`), a real id out of `agy models`, and an object
 * wrapping that id — and every one of them made the agent disappear from `agy
 * agent` again. No shape that agy accepts was found, so the key cannot be
 * translated, only removed; the agent then runs on agy's default model, which
 * is the difference between a working agent and one that never loads.
 *
 * Removal is per provider and applies to the adapted copy alone. The canonical
 * kit keeps `model`, and every other provider still receives it verbatim.
 */
const DROPPED_KEYS: Partial<Record<ProviderId, readonly string[]>> = {
  antigravity: ["model"],
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
  if (TYPED_TOOLS_PROVIDERS.has(provider)) {
    const list = toList(next.tools);
    if (list) next.tools = list;
  }
  for (const key of DROPPED_KEYS[provider] ?? []) delete next[key];
  return next;
}
