import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runUpdate, isNewerVersion, parseLatestTag } from "./update-command.js";

describe("parseLatestTag", () => {
  it("strips the vcskill@ prefix", () => {
    expect(parseLatestTag("vcskill@0.5.0")).toBe("0.5.0");
  });
  it("tolerates a bare version or a leading v", () => {
    expect(parseLatestTag("0.5.0")).toBe("0.5.0");
    expect(parseLatestTag("v0.5.0")).toBe("0.5.0");
  });
});

let sandbox: string;
let root: string;
beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "vcskill-update-"));
  root = join(sandbox, "proj");
  mkdirSync(join(root, ".vcskill"), { recursive: true });
});
afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

function writeReceipt(version: string) {
  writeFileSync(
    join(root, ".vcskill", "receipt.json"),
    JSON.stringify({ schemaVersion: 1, vcskillVersion: version, installs: {} }),
  );
}

describe("isNewerVersion", () => {
  it("compares semver-ish strings numerically, not lexicographically", () => {
    expect(isNewerVersion("0.10.0", "0.9.0")).toBe(true);
    expect(isNewerVersion("0.9.0", "0.10.0")).toBe(false);
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
    expect(isNewerVersion("1.0.1", "1.0.0")).toBe(true);
  });
});

describe("runUpdate (offline-safe)", () => {
  it("exits 0 and reports 'could not check' when the version fetch fails", async () => {
    writeReceipt("0.3.0");
    const res = await runUpdate(
      { home: sandbox, cwd: root, scope: "project", currentVersion: "0.4.0" },
      { fetchLatestVersion: async () => null },
    );
    expect(res.exitCode).toBe(0);
    expect(res.summary).toMatch(/could not check/i);
  });

  it("reports up to date when latest equals current", async () => {
    writeReceipt("0.4.0");
    const res = await runUpdate(
      { home: sandbox, cwd: root, scope: "project", currentVersion: "0.4.0" },
      { fetchLatestVersion: async () => "0.4.0" },
    );
    expect(res.exitCode).toBe(0);
    expect(res.summary).toMatch(/up to date/i);
  });

  it("reports an available update with an upgrade command", async () => {
    writeReceipt("0.3.0");
    const res = await runUpdate(
      { home: sandbox, cwd: root, scope: "project", currentVersion: "0.4.0" },
      { fetchLatestVersion: async () => "0.5.0" },
    );
    expect(res.exitCode).toBe(0);
    expect(res.summary).toContain("0.5.0");
    expect(res.summary).toContain("install.sh");
  });

  it("notes when the receipt's recorded version differs from the running CLI", async () => {
    writeReceipt("0.2.0");
    const res = await runUpdate(
      { home: sandbox, cwd: root, scope: "project", currentVersion: "0.4.0" },
      { fetchLatestVersion: async () => "0.4.0" },
    );
    expect(res.summary).toContain("0.2.0");
  });

  it("handles a missing receipt without failing", async () => {
    const res = await runUpdate(
      { home: sandbox, cwd: root, scope: "project", currentVersion: "0.4.0" },
      { fetchLatestVersion: async () => "0.4.0" },
    );
    expect(res.exitCode).toBe(0);
  });
});
