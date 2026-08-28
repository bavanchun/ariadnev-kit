import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readActivity } from "../activity/event-log.js";
import { EXIT } from "./exit-codes.js";
import { kitsDirFor, parseTimeout, runDispatch, type DispatchOpts } from "./run-dispatch-command.js";

let root: string;
let home: string;
let cwd: string;

/**
 * A kits tree with one dispatchable skill, and an "adapter" that is really
 * `node -e`. Dispatch's job is to spawn a program and stream it; using a real
 * one keeps the test honest about that without needing a coding agent.
 */
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "av-dispatch-"));
  home = join(root, "home");
  cwd = join(root, "work");
  mkdirSync(join(cwd, "kits", "demo", "skills", "scout"), { recursive: true });
  mkdirSync(home, { recursive: true });
  writeFileSync(join(cwd, "kits", "demo", "skills", "scout", "SKILL.md"), "# scout\n");
});

afterEach(() => {
  delete process.env.ARIADNEV_KITS_DIR;
});

function opts(overrides: Partial<DispatchOpts> = {}): DispatchOpts {
  return { ref: "demo/scout", args: [], cwd, home, ...overrides };
}

describe("parsing --timeout", () => {
  it.each([
    ["30s", 30_000],
    ["2m", 120_000],
    ["500ms", 500],
    ["1h", 3_600_000],
    ["1.5s", 1500],
  ])("reads %s", (raw, expected) => {
    expect(parseTimeout(raw)).toBe(expected);
  });

  it("reads a bare number as seconds", () => {
    // Milliseconds would make `--timeout 30` kill every run instantly, which is
    // a worse failure than the ambiguity.
    expect(parseTimeout("30")).toBe(30_000);
  });

  it("treats an absent timeout as no timeout, matching the documented zero", () => {
    expect(parseTimeout(undefined)).toBe(0);
    expect(parseTimeout("0")).toBe(0);
  });

  it("refuses a duration it cannot read rather than guessing", () => {
    expect(() => parseTimeout("soon")).toThrow(/invalid --timeout/);
    expect(() => parseTimeout("30 seconds")).toThrow(/invalid --timeout/);
  });

  it("reports a bad duration as a usage error", () => {
    try {
      parseTimeout("soon");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as { exitCode: number }).exitCode).toBe(EXIT.usage);
    }
  });
});

describe("choosing the kits directory", () => {
  it("prefers the explicit flag", () => {
    expect(kitsDirFor(opts({ kitsDir: "/explicit" }), { ARIADNEV_KITS_DIR: "/env" })).toBe("/explicit");
  });

  it("falls back to the environment, then to ./kits", () => {
    expect(kitsDirFor(opts(), { ARIADNEV_KITS_DIR: "/env" })).toBe("/env");
    expect(kitsDirFor(opts(), {})).toBe(join(cwd, "kits"));
  });
});

describe("dispatching a skill", () => {
  it("refuses a target with no verified invocation before spawning anything", async () => {
    await expect(runDispatch(opts({ target: "dsh" }))).rejects.toThrow(/no verified dispatch invocation/);
  });

  it("refuses an unknown target as a usage error", async () => {
    await expect(runDispatch(opts({ target: "not-a-provider" }))).rejects.toThrow(/unknown --target/);
  });

  it("reports a missing adapter binary as an environment problem, naming the binary", async () => {
    // Exit 3, not 1: the skill did not run and say no, it never started.
    const failing = runDispatch(opts(), { PATH: "/nonexistent" });
    await expect(failing).rejects.toThrow(/is not on PATH/);
    await expect(failing).rejects.toMatchObject({ exitCode: EXIT.unavailable });
  });

  it("refuses a reference that names no kit", async () => {
    await expect(runDispatch(opts({ ref: "nope/scout" }))).rejects.toThrow(/unknown kit/);
  });

  it("records a started event even when the adapter never launches", async () => {
    // The reason `started` exists separately: a run that leaves no trace is
    // indistinguishable from one that never happened.
    await expect(runDispatch(opts(), { PATH: "/nonexistent" })).rejects.toThrow();
    const kinds = readActivity(home).map((event) => event.kind);
    expect(kinds).toContain("dispatch.started");
    expect(kinds).toContain("dispatch.completed");
  });
});

describe("dispatching to a real process", () => {
  /** Put a fake `claude` on PATH that just reports its arguments. */
  function fakeAdapter(body: string): NodeJS.ProcessEnv {
    const bin = join(root, "bin");
    mkdirSync(bin, { recursive: true });
    const script = join(bin, "claude");
    writeFileSync(script, `#!/bin/sh\nexec ${process.execPath} -e ${JSON.stringify(body)} -- "$@"\n`, { mode: 0o755 });
    return { ...process.env, PATH: bin };
  }

  it("passes the prompt to the adapter behind its non-interactive flag", async () => {
    const out: string[] = [];
    const result = await runDispatch(
      opts({ stdout: (c) => out.push(c) }),
      fakeAdapter("process.stdout.write(JSON.stringify(process.argv.slice(1)))"),
    );
    const argv = JSON.parse(out.join("")) as string[];
    expect(argv[0]).toBe("-p");
    expect(argv[1]).toContain("SKILL.md");
    // The prompt is one argument, not several. An unquoted prompt would arrive
    // as a dozen arguments and the adapter would read only the first word.
    expect(argv).toHaveLength(2);
    expect(result.exitCode).toBe(0);
  });

  it("forwards the skill's own arguments into the prompt", async () => {
    const out: string[] = [];
    await runDispatch(
      opts({ args: ["--fast", "auth"], stdout: (c) => out.push(c) }),
      fakeAdapter("process.stdout.write(process.argv.slice(1).join(' '))"),
    );
    expect(out.join("")).toContain("Arguments: --fast auth");
  });

  it("propagates the adapter's exit code instead of collapsing it to 1", async () => {
    const result = await runDispatch(opts({ stdout: () => {} }), fakeAdapter("process.exit(42)"));
    expect(result.exitCode).toBe(42);
  });

  it("records the outcome as an activity event", async () => {
    await runDispatch(opts({ stdout: () => {} }), fakeAdapter("process.exit(0)"));
    const completed = readActivity(home).find((event) => event.kind === "dispatch.completed");
    expect(completed).toMatchObject({ kit: "demo", skill: "scout", status: "ok", runtime: "claude-code" });
  });

  it("marks a failed run as failed", async () => {
    await runDispatch(opts({ stdout: () => {} }), fakeAdapter("process.exit(1)"));
    const completed = readActivity(home).find((event) => event.kind === "dispatch.completed");
    expect(completed?.status).toBe("failed");
  });

  it("keeps the adapter's chatter off stdout under --json", async () => {
    // stdout carries the envelope. Interleaving the child's output there would
    // break every parser reading it.
    const out: string[] = [];
    const err: string[] = [];
    const result = await runDispatch(
      opts({ json: true, stdout: (c) => out.push(c), stderr: (c) => err.push(c) }),
      fakeAdapter("process.stdout.write('chatter')"),
    );
    expect(out.join("")).toBe("");
    expect(err.join("")).toContain("chatter");
    expect(JSON.parse(result.output)).toMatchObject({
      kind: "dispatch.result",
      data: { kit: "demo", skill: "scout", target: "claude-code", exit_code: 0, status: "ok" },
    });
  });

  it("prints no envelope when --json was not asked for", async () => {
    const result = await runDispatch(opts({ stdout: () => {} }), fakeAdapter("process.exit(0)"));
    expect(result.output).toBe("");
  });
});
