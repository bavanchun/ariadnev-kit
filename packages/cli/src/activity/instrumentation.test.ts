import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildProgram } from "../index.js";
import { readActivity } from "./event-log.js";
import { recordActivity } from "./emit.js";

const dirs: string[] = [];
const mk = () => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-instrument-"));
  dirs.push(dir);
  return dir;
};

const originalExitCode = process.exitCode;

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

describe("the workflow path emits", () => {
  it("records a start and a failure when a workflow cannot be validated", async () => {
    // Driven through the real command wiring rather than by calling the
    // emitter: the thing worth proving is that the instrumentation is actually
    // reached, which a direct call cannot show.
    const home = mk();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync([
      "node", "ariadnev", "--home", home, "--cwd", process.cwd(),
      "workflow", "run", "no-such-workflow", "--json",
    ]);

    const kinds = readActivity(home).map((event) => event.kind);
    expect(kinds).toContain("workflow.started");
    expect(kinds).toContain("workflow.failed");
  });

  it("records nothing for --validate, which never invokes a provider", async () => {
    // A usage aggregate that counts validations counts work that never
    // happened, and nothing downstream could tell the difference.
    const home = mk();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync([
      "node", "ariadnev", "--home", home, "--cwd", process.cwd(),
      "workflow", "run", "no-such-workflow", "--validate", "--json",
    ]);

    expect(readActivity(home)).toEqual([]);
  });

  it("writes into the --home the user chose, not the real one", async () => {
    // An emitter reading `homedir()` would write outside the directory the
    // flag selected — and every test here would still pass while doing it.
    const home = mk();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    process.exitCode = undefined;

    await buildProgram().parseAsync([
      "node", "ariadnev", "--home", home, "--cwd", process.cwd(),
      "workflow", "run", "no-such-workflow", "--json",
    ]);

    expect(readActivity(home).length).toBeGreaterThan(0);
  });
});

describe("emission never breaks the operation it observes", () => {
  it("survives a home that cannot hold a log directory", () => {
    // The classic telemetry failure, asserted directly: an install must not
    // fail because a log write failed. Here `home` is a regular file, so every
    // path under it is unopenable.
    const home = join(mk(), "this-is-a-file");
    writeFileSync(home, "");
    expect(() => recordActivity(home, "install.completed", { runtime: "codex" })).not.toThrow();
  });

  it("keeps the command's own output and exit code intact when the log is broken", async () => {
    const broken = join(mk(), "this-is-a-file");
    writeFileSync(broken, "");
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line) => lines.push(String(line)));
    process.exitCode = undefined;

    await buildProgram().parseAsync([
      "node", "ariadnev", "--home", broken, "--cwd", process.cwd(),
      "workflow", "run", "no-such-workflow", "--json",
    ]);

    // The command still answered, in its own shape, with its own exit code.
    expect(process.exitCode).toBe(1);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({ schemaVersion: 1, ok: false });
  });
});

describe("what reaches disk", () => {
  it("contains no credential-shaped string, even when handed one", () => {
    // The redaction property, proven at the log rather than at the type: the
    // scrub is an allowlist, so a caller passing its whole options object gets
    // its secrets dropped instead of persisted.
    const home = mk();
    recordActivity(home, "workflow.completed", {
      runtime: "codex",
      token: "ghp_0123456789abcdefghijklmnopqrstuvwxyz",
      authorization: "Bearer sk-ant-api03-secret",
      env: { ANTHROPIC_API_KEY: "sk-ant-secret" },
      argv: ["--password", "hunter2"],
    } as never);

    const serialized = JSON.stringify(readActivity(home));
    for (const secret of ["ghp_", "sk-ant", "Bearer", "hunter2", "password", "ANTHROPIC"]) {
      expect(serialized, secret).not.toContain(secret);
    }
    expect(readActivity(home)[0]).toMatchObject({ runtime: "codex" });
  });
});
