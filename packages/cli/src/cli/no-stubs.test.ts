import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NotImplementedError, notImplemented } from "./not-implemented.js";

// "Every phase ships working behavior or does not ship." Without this the parity
// ratchet is gameable: registering 22 empty commands would take the missing
// count to zero and the surface to a lie.
//
// Active from day one rather than added at phase 13, because a gate that arrives
// after the thing it guards only ever certifies what already happened.

const SRC = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SANCTIONED = ["cli/not-implemented.ts", "cli/no-stubs.test.ts"];

function typescriptFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...typescriptFiles(path));
    else if (entry.endsWith(".ts")) found.push(path);
  }
  return found;
}

describe("no stubs", () => {
  it("registers no command that refuses to do its job", () => {
    const hits: string[] = [];
    for (const path of typescriptFiles(SRC)) {
      const relative = path.slice(SRC.length + 1).split("\\").join("/");
      if (SANCTIONED.includes(relative)) continue;
      const source = readFileSync(path, "utf8");
      if (/\bNotImplementedError\b|\bnotImplemented\s*\(/.test(source)) hits.push(relative);
    }
    expect(
      hits,
      "a command was registered as a stub. Ship the behaviour or leave the name " +
        "unregistered — an absent command is an honest gap, a refusing one is a support ticket.",
    ).toEqual([]);
  });

  it("still finds the source tree", () => {
    expect(typescriptFiles(SRC).length).toBeGreaterThan(100);
  });
});

describe("NotImplementedError", () => {
  it("names the command and carries its own exit code", () => {
    const error = new NotImplementedError("analytics rebuild");
    expect(error.message).toBe("av analytics rebuild is registered but not implemented");
    expect(error.exitCode).toBe(3);
    expect(error).toBeInstanceOf(Error);
  });

  it("throws from the action the helper builds", () => {
    expect(() => notImplemented("gui")()).toThrow(NotImplementedError);
  });
});
