import { describe, it, expect, vi, afterEach } from "vitest";
import { commandSurface, surfaceOf } from "./command-surface.js";
import { buildProgram } from "../index.js";
import { lintAvInvocations, type CommandNode } from "../kit/av-invocation-lint.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const surface = commandSurface();
const child = (...path: string[]) => path.reduce<ReturnType<typeof commandSurface> | undefined>(
  (node, name) => node?.subcommands.get(name),
  surface,
);

describe("commandSurface", () => {
  it("carries the registered tree", () => {
    expect(child("plan", "use")).toBeDefined();
    expect(child("plan", "cleanup")).toBeDefined();
    expect(child("config", "prefs")).toBeDefined();
    expect(child("mcp", "verify")).toBeDefined();
    expect(child("validate")).toBeDefined();
  });

  it("carries the phantoms' absence — the whole reason the lint has a surface", () => {
    expect(child("plan", "create")).toBeUndefined();
    expect(child("plan", "add-phase")).toBeUndefined();
    expect(child("plan", "publish")).toBeUndefined();
    expect(child("config", "start")).toBeUndefined();
    expect(child("config", "stop")).toBeUndefined();
    expect(child("config", "status")).toBeUndefined();
  });

  it("carries per-command options and the globals", () => {
    expect(child("validate")?.flags.has("--strict")).toBe(true);
    expect(child("plan", "update")?.flags.has("--plan")).toBe(true);
    expect(child("plan", "update")?.valueFlags.has("--plan")).toBe(true);
    expect(surface.flags.has("--dry-run")).toBe(true);
    expect(surface.flags.has("--home")).toBe(true);
    expect(surface.valueFlags.has("--home")).toBe(true);
  });

  it("knows which group commands take a positional of their own", () => {
    // `run` keeps its positional while the deprecated spelling lives, and
    // `workflow` is a pure group whose `run` child carries the workflow ID.
    expect(child("run")?.acceptsPositional).toBe(true);
    expect(child("workflow", "run")?.acceptsPositional).toBe(true);
    expect(child("workflow")?.acceptsPositional).toBe(false);
    expect(child("plan")?.acceptsPositional).toBe(false);
    expect(child("config")?.acceptsPositional).toBe(false);
  });

  it("accepts help everywhere", () => {
    expect(child("plan", "help")).toBeDefined();
    expect(child("plan", "use")?.flags.has("--help")).toBe(true);
  });

  /**
   * The collector builds a whole program to read it. That is only safe while
   * registration is pure wiring — descriptions, options, and action callbacks
   * that Commander does not run until `parseAsync`. If a future `register*`
   * touches disk or prints at registration time, `av validate` would start doing
   * it too, and this is where that shows up.
   */
  it("builds the program without running anything", () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const before = process.exitCode;

    commandSurface();

    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(before);
  });

  /**
   * The collector registers the commands itself instead of calling
   * `buildProgram()`, to keep `index.ts` out of a cycle. That is only sound
   * while the two register the same things — a new `register*` call added to
   * `buildProgram` alone would leave the lint certifying prose against a tree
   * that is missing a whole command group.
   */
  it("matches the program the binary actually runs", () => {
    // valueFlags and the positional bit are part of the tree's meaning, not
    // decoration: without them `--home <dir>` and a bare `--home` render
    // identically, and `av run` losing its `[workflow]` would pass unnoticed.
    const render = (node: CommandNode, path: string): string[] => [
      `${path} :: flags=${[...node.flags].sort().join(" ")}` +
        ` :: values=${[...node.valueFlags].sort().join(" ")}` +
        ` :: positional=${node.acceptsPositional}`,
      ...[...node.subcommands]
        .sort(([a], [b]) => a.localeCompare(b))
        .flatMap(([name, child]) => render(child, `${path} ${name}`)),
    ];
    expect(render(commandSurface(), "av")).toEqual(render(surfaceOf(buildProgram()), "av"));
  });

  /**
   * `ValidateOpts.surface` is optional, so a caller that forgets it turns the
   * whole av-invocation check off in silence. Nothing in the type system catches
   * that. Driving the real command is what proves the registration layer still
   * hands it over.
   */
  it("reaches validate through the real command wiring", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const exitCode = process.exitCode;
    await buildProgram().parseAsync(["node", "ariadnev", "validate"]);
    process.exitCode = exitCode;
    expect(log.mock.calls.flat().join("\n")).toContain("av-invocation");
  });

  it("lints the kit's own documented invocations against itself", () => {
    expect(lintAvInvocations("`av plan use <name>` then `av plan show --json`", surface)).toEqual([]);
    expect(lintAvInvocations("`av plan create`", surface)).toMatchObject([{ severity: "error", token: "create" }]);
  });
});
