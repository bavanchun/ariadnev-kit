import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { messageText, PREVIEW_LIMIT, summarizeSession, tokenTotals, truncatePreview } from "./summarize.js";
import type { DiscoveredSession } from "./discover.js";

const dirs: string[] = [];
const mk = () => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-summarize-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function session(lines: unknown[], agent: DiscoveredSession["agent"] = "claude-code"): DiscoveredSession {
  const path = join(mk(), "s.jsonl");
  writeFileSync(path, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
  return {
    id: "s",
    agent,
    path,
    projectId: "myapp",
    sizeBytes: 100,
    modifiedAt: "2026-08-28T00:00:00.000Z",
  };
}

const userMsg = (text: string, ts: string) => ({
  type: "user",
  timestamp: ts,
  message: { role: "user", content: text },
});

const assistantMsg = (text: string, ts: string, model = "claude-opus-5", usage?: unknown) => ({
  type: "assistant",
  timestamp: ts,
  message: { role: "assistant", model, content: [{ type: "text", text }], usage },
});

describe("message_count counts messages, not lines", () => {
  it("ignores the record types that carry no conversation", () => {
    // The probe found 1,862 `attachment` records against 348 `user` in a single
    // real session. Counting lines would overstate the message count several
    // times over, and `stats` sums this number.
    const found = session([
      { type: "mode", sessionId: "s" },
      { type: "attachment", timestamp: "2026-08-28T00:00:00.000Z" },
      { type: "file-history-snapshot" },
      userMsg("hello", "2026-08-28T00:00:01.000Z"),
      assistantMsg("hi", "2026-08-28T00:00:02.000Z"),
      { type: "bridge-session" },
    ]);
    expect(summarizeSession(found).message_count).toBe(2);
  });
});

describe("the preview", () => {
  it("is absent unless the caller asks for it", () => {
    // The default output of the most-used verb printed a live session's prose.
    // Absent-by-default is the fix; a flag is the opt-in.
    const found = session([userMsg("something private", "2026-08-28T00:00:01.000Z")]);
    const summary = summarizeSession(found);
    expect(summary).not.toHaveProperty("last_message_preview");
    expect(JSON.stringify(summary)).not.toContain("something private");
  });

  it("is truncated hard when it is asked for", () => {
    const long = "x".repeat(500);
    const found = session([userMsg(long, "2026-08-28T00:00:01.000Z")]);
    const preview = summarizeSession(found, { includePreview: true }).last_message_preview!;
    expect(preview.length).toBeLessThanOrEqual(PREVIEW_LIMIT + 1);
  });

  it("collapses newlines, so a preview can never be a block of transcript", () => {
    expect(truncatePreview("one\ntwo\n\nthree")).toBe("one two three");
  });

  it("reads text blocks only, never a tool call's arguments", () => {
    // A tool-use block's input is where a path, a command, or a token would be.
    const content = [
      { type: "text", text: "running it" },
      { type: "tool_use", name: "Bash", input: { command: "curl -H 'Authorization: Bearer sk-live-secret'" } },
    ];
    const text = messageText(content);
    expect(text).toBe("running it");
    expect(text).not.toContain("sk-live");
  });
});

describe("timestamps and duration", () => {
  it("spans the first and last timestamped record", () => {
    const found = session([
      userMsg("a", "2026-08-28T00:00:00.000Z"),
      assistantMsg("b", "2026-08-28T00:00:10.000Z"),
    ]);
    const summary = summarizeSession(found);
    expect(summary.started_at).toBe("2026-08-28T00:00:00.000Z");
    expect(summary.ended_at).toBe("2026-08-28T00:00:10.000Z");
    expect(summary.duration_ms).toBe(10_000);
  });

  it("never reports a negative duration", () => {
    // Wall clock is not monotonic. A negative duration would be summed by every
    // aggregate downstream without complaint.
    const found = session([
      userMsg("a", "2026-08-28T00:00:10.000Z"),
      assistantMsg("b", "2026-08-28T00:00:00.000Z"),
    ]);
    expect(summarizeSession(found).duration_ms).toBe(0);
  });
});

describe("model", () => {
  it("reports the model most recently in use, not the first", () => {
    const found = session([
      assistantMsg("a", "2026-08-28T00:00:00.000Z", "claude-sonnet-5"),
      assistantMsg("b", "2026-08-28T00:00:01.000Z", "claude-opus-5"),
    ]);
    expect(summarizeSession(found).model).toBe("claude-opus-5");
  });
});

describe("a corrupt line does not silently shorten the count", () => {
  it("reports how many lines it could not read", () => {
    const path = join(mk(), "s.jsonl");
    writeFileSync(path, `${JSON.stringify(userMsg("a", "2026-08-28T00:00:00.000Z"))}\nbroken\n`);
    const summary = summarizeSession({
      id: "s", agent: "claude-code", path, projectId: "p", sizeBytes: 10, modifiedAt: "2026-08-28T00:00:00.000Z",
    });
    expect(summary.message_count).toBe(1);
    expect(summary.skipped_lines).toBe(1);
  });
});

describe("codex", () => {
  it("takes its project from the cwd its own metadata records", () => {
    // Codex shards by date, so the path says nothing about the project.
    const found = session(
      [
        { type: "session_meta", timestamp: "2026-08-28T00:00:00.000Z", payload: { session_id: "x", cwd: "/home/u/myapp", model_provider: "openai" } },
        { type: "response_item", timestamp: "2026-08-28T00:00:01.000Z", payload: {} },
      ],
      "codex",
    );
    const summary = summarizeSession(found);
    expect(summary.project_id).toBe("myapp");
    expect(summary.runtime).toBe("codex");
    expect(summary.message_count).toBe(1);
  });
});

describe("token totals", () => {
  it("sums input, cache and output tokens across assistant records", () => {
    const found = session([
      assistantMsg("a", "2026-08-28T00:00:00.000Z", "claude-opus-5", {
        input_tokens: 2, cache_creation_input_tokens: 100, cache_read_input_tokens: 50, output_tokens: 10,
      }),
      assistantMsg("b", "2026-08-28T00:00:01.000Z", "claude-opus-5", {
        input_tokens: 1, output_tokens: 5,
      }),
    ]);
    expect(tokenTotals(found)).toEqual({ input: 153, output: 15 });
  });

  it("reports zero for an agent whose files carry no usage", () => {
    const found = session([{ type: "response_item", payload: {} }], "codex");
    expect(tokenTotals(found)).toEqual({ input: 0, output: 0 });
  });
});
