import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { renderConflictSummary, resolveSharedDestinations, type ProviderWrites } from "./shared-destinations.js";
import { buildReceipt } from "./install-receipt.js";
import type { ProviderInstallResult } from "./install-types.js";

const digest = (s: string) => createHash("sha256").update(s).digest("hex");

describe("resolveSharedDestinations", () => {
  it("records the bytes the last writer left, not what an earlier one intended", () => {
    const entries: ProviderWrites[] = [
      { providerId: "codex", writes: [{ path: "/r/SKILL.md", content: "codex flavour" }] },
      { providerId: "cursor", writes: [{ path: "/r/SKILL.md", content: "cursor flavour" }] },
    ];
    const { canonical, conflicts } = resolveSharedDestinations(entries);

    expect(canonical.get("/r/SKILL.md")).toBe(digest("cursor flavour"));
    expect(conflicts).toEqual([{ path: "/r/SKILL.md", providers: ["codex", "cursor"], winner: "cursor" }]);
  });

  it("reports no conflict when two providers agree byte for byte", () => {
    const { conflicts } = resolveSharedDestinations([
      { providerId: "codex", writes: [{ path: "/r/a.md", content: "same" }] },
      { providerId: "cursor", writes: [{ path: "/r/a.md", content: "same" }] },
    ]);
    expect(conflicts).toEqual([]);
  });

  it("does not count one provider writing a path twice as a conflict with itself", () => {
    const { conflicts } = resolveSharedDestinations([
      { providerId: "codex", writes: [{ path: "/r/a.md", content: "one" }, { path: "/r/a.md", content: "two" }] },
    ]);
    expect(conflicts).toEqual([]);
  });

  it("leaves a path only one provider writes entirely alone", () => {
    const { canonical, conflicts } = resolveSharedDestinations([
      { providerId: "claude-code", writes: [{ path: "/c/only.md", content: "mine" }] },
    ]);
    expect(canonical.get("/c/only.md")).toBe(digest("mine"));
    expect(conflicts).toEqual([]);
  });
});

describe("buildReceipt with a shared destination", () => {
  /**
   * The exact shape of the bug this fixes. Measured on a real machine: codex and
   * cursor shared 1485 paths, 42 of which had different recorded hashes, and all
   * 42 files held cursor's bytes while being recorded as codex-modified.
   */
  function result(provider: string, content: string): ProviderInstallResult {
    return {
      provider,
      written: 1,
      backedUp: 0,
      skipped: [],
      ops: [{ action: "write", kind: "skill", name: "advise", dest: "/home/u/.agents/skills/av-advise/SKILL.md", content, mode: 0o644 }],
    } as unknown as ProviderInstallResult;
  }

  const meta = { home: "/home/u", cwd: "/w", timestamp: "260831-0000", ariadnevVersion: "9.9.9" };

  it("gives both providers the hash of the file that is actually there", () => {
    const json = buildReceipt(
      "",
      [
        { providerId: "codex", result: result("codex", "codex flavour"), scope: "global", applyHookSettings: false },
        { providerId: "cursor", result: result("cursor", "cursor flavour"), scope: "global", applyHookSettings: false },
      ] as never,
      meta,
    );
    const receipt = JSON.parse(json);
    const codex = receipt.installs.codex.files[0].sha256;
    const cursor = receipt.installs.cursor.files[0].sha256;

    // Before the fix these differed, and codex's 42 files were then reported as
    // user-modified on every subsequent install and never written again.
    expect(codex).toBe(cursor);
    expect(codex).toBe(digest("cursor flavour"));
  });

  it("does not let a skipped write claim to be what is on disk", () => {
    const skippedResult = result("cursor", "cursor flavour");
    skippedResult.written = 0;
    skippedResult.skipped = [
      { action: "skip", kind: "skill", name: "advise", reason: "modified since install", path: "/home/u/.agents/skills/av-advise/SKILL.md" },
    ];

    const json = buildReceipt(
      "",
      [
        { providerId: "codex", result: result("codex", "codex flavour"), scope: "global", applyHookSettings: false },
        { providerId: "cursor", result: skippedResult, scope: "global", applyHookSettings: false },
      ] as never,
      meta,
    );
    const receipt = JSON.parse(json);
    // cursor never wrote, so codex's bytes are the ones on disk.
    expect(receipt.installs.codex.files[0].sha256).toBe(digest("codex flavour"));
  });
});

describe("renderConflictSummary", () => {
  it("says nothing when nothing collided", () => {
    expect(renderConflictSummary([])).toEqual([]);
  });

  it("groups by provider pair and names who won rather than listing every file", () => {
    const conflicts = Array.from({ length: 5 }, (_, i) => ({
      path: `/r/f${i}.md`,
      providers: ["codex", "cursor"],
      winner: "cursor",
    }));
    const text = renderConflictSummary(conflicts).join("\n");

    expect(text).toContain("codex + cursor: 5 file(s)");
    expect(text).toContain("cursor wrote last");
    expect(text).toContain("… and 2 more");
    expect(text).toContain("not reported as your edits");
  });
});
