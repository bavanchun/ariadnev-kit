import { afterEach, describe, expect, it, vi } from "vitest";
import { buildProgram } from "../index.js";
import { runtimePreparation } from "./register-harness-commands.js";

const originalExitCode = process.exitCode;

afterEach(() => {
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

const named = (name: string) => buildProgram().commands.find((command) => command.name() === name);

describe("harness command registration", () => {
  it("registers one public workflow lifecycle with machine output", () => {
    const workflow = named("workflow");
    expect(workflow).toBeDefined();
    const run = workflow?.commands.find((command) => command.name() === "run");
    const help = run?.helpInformation() ?? "";
    expect(help).toContain("--runtime <provider>");
    expect(help).toContain("--json");
    expect(help).toContain("--validate");
    expect(workflow?.commands.map((command) => command.name()).sort()).toEqual(["cancel", "resume", "run", "status"]);
  });

  it("carries only dispatch options on `run`, the workflow ones having gone with the shim", () => {
    // The harness options were on `run` only to keep the deprecated spelling
    // whole. With that spelling retired, leaving them would advertise a sense
    // of the command that no longer exists.
    const help = named("run")?.helpInformation() ?? "";
    for (const option of ["--target <provider>", "--timeout <duration>", "--kits-dir <dir>"]) {
      expect(help).toContain(option);
    }
    for (const gone of ["--runtime <provider>", "--run-id <id>", "--initial-state <json>", "--validate"]) {
      expect(help).not.toContain(gone);
    }
  });

  it("advertises the reserved dispatch grammar on `run --help`", () => {
    expect(named("run")?.description()).toContain("<kit>/<skill>");
  });

  it("routes `av run kit/skill` to dispatch rather than to a workflow of that name", async () => {
    // Reaching skill resolution — and failing there, on a kit that does not
    // exist — is the proof that it went to dispatch. A workflow lookup would
    // have complained about a missing workflow instead.
    const warnings: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line) => warnings.push(String(line)));
    await expect(
      buildProgram().parseAsync(["node", "ariadnev", "--cwd", process.cwd(), "run", "nosuchkit/scout"]),
    ).rejects.toThrow(/unknown kit "nosuchkit"/);
    // No deprecation warning: dispatch is what `run` means now.
    expect(warnings).toEqual([]);
  });

  it("refuses a bare token instead of running a workflow of that name", async () => {
    // The retired spelling must not silently become a dispatch attempt at
    // something else, and must not quietly resolve to a workflow either: the
    // grammar it expected is the whole answer.
    await expect(
      buildProgram().parseAsync(["node", "ariadnev", "--cwd", process.cwd(), "run", "missing-workflow"]),
    ).rejects.toThrow(/exactly <kit>\/<skill>/);
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
      "node", "ariadnev", "--cwd", process.cwd(), "workflow", "run", "missing-workflow", "--validate", "--json",
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

  it("leaves `workflow run` — the surviving spelling — writing its envelope to stdout alone", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line) => stdout.push(String(line)));
    vi.spyOn(console, "error").mockImplementation((line) => stderr.push(String(line)));
    const before = process.exitCode;
    await buildProgram().parseAsync([
      "node", "ariadnev", "--cwd", process.cwd(), "workflow", "run", "missing-workflow", "--validate", "--json",
    ]);
    process.exitCode = before;
    expect(stdout).toHaveLength(1);
    expect(stderr.join("\n")).toBe("");
  });
});
