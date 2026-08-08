import { afterEach, describe, expect, it, vi } from "vitest";
import { buildProgram } from "../index.js";
import { runtimePreparation } from "./register-harness-commands.js";

const originalExitCode = process.exitCode;

afterEach(() => {
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

describe("harness command registration", () => {
  it("registers one public run lifecycle with machine output", () => {
    const run = buildProgram().commands.find((command) => command.name() === "run");
    expect(run).toBeDefined();
    const help = run?.helpInformation() ?? "";
    expect(help).toContain("--runtime <provider>");
    expect(help).toContain("--json");
    expect(help).toContain("--validate");
    expect(run?.commands.map((command) => command.name()).sort()).toEqual(["cancel", "resume", "status"]);
  });

  it("prepares only the explicitly selected runtime", () => {
    expect(runtimePreparation("codex", true)).toEqual({ codex: true, claudeCode: false });
    expect(runtimePreparation("claude-code", true)).toEqual({ codex: false, claudeCode: true });
    expect(runtimePreparation(undefined, true)).toEqual({ codex: true, claudeCode: true });
    expect(runtimePreparation("unknown", true)).toEqual({ codex: false, claudeCode: false });
    expect(runtimePreparation("codex", false)).toEqual({ codex: false, claudeCode: false });
  });

  it("emits a stable JSON error envelope for machine consumers", async () => {
    process.exitCode = undefined;
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line) => lines.push(String(line)));
    await buildProgram().parseAsync([
      "node", "vcskill", "--cwd", process.cwd(), "run", "missing-workflow", "--validate", "--json",
    ]);
    expect(process.exitCode).toBe(1);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({
      schemaVersion: 1,
      action: "validate",
      ok: false,
      status: "error",
      workflow: "missing-workflow",
    });
  });
});
