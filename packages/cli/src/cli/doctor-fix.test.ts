import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDoctor } from "./doctor-command.js";
import { packageVersion } from "../version.js";

const BINDING_CMD = "node /x/session-init.cjs";

function writeReceipt(cwd: string): void {
  const receipt = {
    schemaVersion: 1,
    vcskillVersion: packageVersion(),
    installs: {
      "claude-code": {
        timestamp: "t",
        scope: "project",
        files: [],
        agentsMdManaged: false,
        hookBindings: [{ event: "SessionStart", command: BINDING_CMD, applied: true }],
        skipped: [],
      },
    },
  };
  mkdirSync(join(cwd, ".vcskill"), { recursive: true });
  writeFileSync(join(cwd, ".vcskill", "receipt.json"), JSON.stringify(receipt));
}

describe("doctor --fix (hook-binding self-heal)", () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "vcskill-doctorfix-"));
    writeReceipt(cwd);
    // settings.json exists but the vc binding was removed → drift.
    mkdirSync(join(cwd, ".claude"), { recursive: true });
    writeFileSync(join(cwd, ".claude", "settings.json"), "{}\n");
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  const opts = () => ({ scope: "project" as const, home: cwd, cwd });

  it("reports the drifted binding without --fix", () => {
    const { summary, status } = runDoctor(opts());
    expect(status).toBe("degraded");
    expect(summary).toMatch(/hook binding removed/);
  });

  it("--fix --dry-run reports the plan but writes nothing", () => {
    const { summary } = runDoctor({ ...opts(), fix: true, dryRun: true, timestamp: "20260720-000000" });
    expect(summary).toMatch(/would fix 1 hook binding/);
    // drift still reported (nothing was written) and no backup dir created
    expect(summary).toMatch(/hook binding removed/);
    expect(readFileSync(join(cwd, ".claude", "settings.json"), "utf8")).toBe("{}\n");
    expect(existsSync(join(cwd, ".vcskill", "backups"))).toBe(false);
  });

  it("--fix re-merges the binding, backs up, and re-runs clean + idempotent", () => {
    const before = runDoctor({ ...opts(), fix: true, timestamp: "20260720-000000" });
    // binding restored in settings.json
    const settings = readFileSync(join(cwd, ".claude", "settings.json"), "utf8");
    expect(settings).toContain(BINDING_CMD);
    expect(before.summary).toMatch(/fixed 1 hook binding/);
    // backup of the pre-fix settings.json was taken
    expect(existsSync(join(cwd, ".vcskill", "backups", "20260720-000000", "settings", "settings.json"))).toBe(true);

    // second --fix is a no-op (idempotent) and doctor is now healthy
    const after = runDoctor({ ...opts(), fix: true, timestamp: "20260720-000001" });
    expect(after.summary).not.toMatch(/fixed \d+ hook binding/);
    expect(after.summary).not.toMatch(/hook binding removed/);
  });
});
