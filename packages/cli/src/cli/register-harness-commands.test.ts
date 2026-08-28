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

  it("keeps the deprecated `run` spelling with the same options", () => {
    // The shim has to accept every invocation the old name accepted. An option
    // dropped here turns a deprecation into an outage for whoever used it.
    const help = named("run")?.helpInformation() ?? "";
    for (const option of ["--runtime <provider>", "--run-id <id>", "--initial-state <json>", "--validate", "--json"]) {
      expect(help).toContain(option);
    }
  });

  it("advertises the reserved dispatch grammar on `run --help`", () => {
    expect(named("run")?.description()).toContain("<kit>/<skill>");
  });

  it("refuses `av run kit/skill` rather than looking for a workflow of that name", async () => {
    const warnings: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line) => warnings.push(String(line)));
    await expect(
      buildProgram().parseAsync(["node", "ariadnev", "--cwd", process.cwd(), "run", "engineer/scout"]),
    ).rejects.toThrow("reserved for skill dispatch");
    expect(warnings).toEqual([]);
  });

  it("sends `av run status <id>` to its new spelling without touching a run", async () => {
    await expect(
      buildProgram().parseAsync(["node", "ariadnev", "--cwd", process.cwd(), "run", "status", "some-run"]),
    ).rejects.toThrow("av workflow status");
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

  it("leaves the deprecated spelling's stdout byte-identical, warning only on stderr", async () => {
    // The compatibility claim of the whole phase, asserted rather than argued:
    // a script piping stdout through a JSON parser sees no difference at all,
    // and the human running the same command in a terminal is told the name is
    // going away.
    const capture = async (argv: readonly string[]) => {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const log = vi.spyOn(console, "log").mockImplementation((line) => stdout.push(String(line)));
      const error = vi.spyOn(console, "error").mockImplementation((line) => stderr.push(String(line)));
      const before = process.exitCode;
      await buildProgram().parseAsync(["node", "ariadnev", "--cwd", process.cwd(), ...argv]);
      const exitCode = process.exitCode;
      process.exitCode = before;
      log.mockRestore();
      error.mockRestore();
      return { stdout: stdout.join("\n"), stderr: stderr.join("\n"), exitCode };
    };

    const canonical = await capture(["workflow", "run", "missing-workflow", "--validate", "--json"]);
    const deprecated = await capture(["run", "missing-workflow", "--validate", "--json"]);

    expect(deprecated.stdout).toBe(canonical.stdout);
    expect(deprecated.exitCode).toBe(canonical.exitCode);
    expect(canonical.stderr).toBe("");
    expect(deprecated.stderr).toContain("av workflow run missing-workflow");
  });
});
