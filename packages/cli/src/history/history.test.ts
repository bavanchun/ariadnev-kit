import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toEvent } from "./record.js";
import { appendEvent, readEvents, recordSafe, historyPath, isDegraded } from "./store.js";
import { runQuery, renderQuery, normalizeView } from "../cli/query-command.js";

const dirs: string[] = [];
const mk = () => {
  const d = mkdtempSync(join(tmpdir(), "vcskill-hist-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("toEvent — allowlist scrub", () => {
  it("keeps only enumerated categorical fields; drops anything else", () => {
    const e = toEvent(
      "install",
      { provider: "claude-code", scope: "project", version: "1.2.3", count: 5, secret: "ghp_leak", token: "x" } as never,
      new Date("2026-07-20T00:00:00.000Z"),
    );
    expect(e).toEqual({ ts: "2026-07-20T00:00:00.000Z", kind: "install", provider: "claude-code", scope: "project", version: "1.2.3", count: 5 });
    expect(JSON.stringify(e)).not.toContain("ghp_leak");
    expect(JSON.stringify(e)).not.toContain("token");
  });

  it("ignores an invalid scope and a non-finite count", () => {
    const e = toEvent("doctor", { scope: "weird" as never, count: Infinity });
    expect(e.scope).toBeUndefined();
    expect(e.count).toBeUndefined();
  });
});

describe("store — append / read / degraded", () => {
  it("round-trips events and skips a corrupt line", () => {
    const home = mk();
    const p = historyPath(home);
    appendEvent(p, toEvent("install", { provider: "codex" }));
    mkdirSync(join(home, ".vcskill"), { recursive: true });
    appendFileSync(p, "{ this is not json }\n");
    appendEvent(p, toEvent("doctor", { status: "healthy" }));
    const events = readEvents(p);
    expect(events).toHaveLength(2);
    expect(events[0].provider).toBe("codex");
    expect(events[1].status).toBe("healthy");
  });

  it("readEvents returns [] for a missing file", () => {
    expect(readEvents(historyPath(mk()))).toEqual([]);
  });

  it("recordSafe never throws on a failing append AND sets the degraded marker", () => {
    const home = mk();
    const boom = () => {
      throw new Error("disk full");
    };
    expect(() => recordSafe(home, toEvent("install"), { append: boom })).not.toThrow();
    expect(isDegraded(home)).toBe(true);
  });
});

describe("query — render + view filtering", () => {
  const events = [
    toEvent("install", { provider: "codex", scope: "project", count: 3 }),
    toEvent("doctor", { status: "degraded" }),
    toEvent("uninstall", { provider: "codex" }),
  ];

  it("normalizeView maps aliases and defaults to history", () => {
    expect(normalizeView("install")).toBe("installs");
    expect(normalizeView("doctor")).toBe("doctor");
    expect(normalizeView(undefined)).toBe("history");
  });

  it("installs view shows install + uninstall only, plain when color:false", () => {
    const out = renderQuery("installs", events, false, { color: false });
    expect(out).not.toContain("\x1b[");
    expect(out).toContain("install codex");
    expect(out).toContain("uninstall codex");
    expect(out).not.toContain("doctor");
  });

  it("surfaces the degraded marker line", () => {
    expect(renderQuery("history", events, true)).toContain("recording degraded");
  });

  it("says so when there are no events", () => {
    expect(renderQuery("doctor", [], false)).toContain("no events recorded");
  });

  it("runQuery reads from the injected events seam", () => {
    const out = runQuery({ view: "doctor", home: mk(), events, degraded: false });
    expect(out).toContain("doctor degraded");
  });
});
