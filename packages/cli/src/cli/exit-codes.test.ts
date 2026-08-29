import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXIT, LEGACY_EXIT_COMMANDS, UsageError, UnavailableError } from "./exit-codes.js";

const here = fileURLToPath(new URL(".", import.meta.url));

describe("exit codes", () => {
  it("carries the errors that name their own code", () => {
    expect(new UsageError("bad flag").exitCode).toBe(EXIT.usage);
    expect(new UnavailableError("no runtime").exitCode).toBe(EXIT.unavailable);
    expect(EXIT.ok).toBe(0);
  });

  it("leaves doctor's mapping alone — CI gates on it", () => {
    // The whole reason this table is scoped to new commands. Under it, 2 means
    // "called wrong"; doctor's 2 means "this install is unhealthy". A job that
    // reads the exit code cannot tell those apart, so the mapping stays put and
    // this test is what notices if someone unifies them.
    const source = readFileSync(join(here, "doctor-command.ts"), "utf8");
    expect(source).toMatch(/healthy.*0/s);
    expect(source).toContain("degraded");
    expect(source).not.toContain("exit-codes.js");
    expect(LEGACY_EXIT_COMMANDS).toContain("doctor");
  });

  it("names every command that predates the table", () => {
    // A command left off this list would be free to adopt the new codes without
    // anyone deciding to; the point is that adopting them is a decision.
    for (const command of ["doctor", "audit", "validate", "eval", "skill", "workflow"]) {
      expect(LEGACY_EXIT_COMMANDS).toContain(command);
    }
  });

  it("exempts the harness and not the name it used to have", () => {
    // Same reasoning as the JSON list: `run` now fronts skill dispatch, and a
    // command introduced after this table was written has no grandfathered
    // exit codes to protect.
    expect(LEGACY_EXIT_COMMANDS).not.toContain("run");
  });
});

describe("the entrypoint honors a named exit code", () => {
  it("passes an error's own exitCode through instead of collapsing to 1", () => {
    // Without this, every failure exits 1 and a caller cannot tell "you called
    // it wrong" from "the check failed" — which is the entire point of the
    // table. Read from source because the handler runs at process exit.
    const source = readFileSync(join(here, "..", "index.ts"), "utf8");
    expect(source).toMatch(/exitCode/);
    expect(source).toMatch(/process\.exit\(typeof named === "number" \? named : 1\)/);
  });
});
