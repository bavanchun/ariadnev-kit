import { describe, it, expect } from "vitest";
import { runContract, PROTOCOL_VERSION, CAPABILITIES, KNOWN_COMMANDS } from "./contract-command.js";
import { buildProgram } from "../index.js";

describe("runContract", () => {
  it("emits schema-stable JSON with version + verified paths when --json", () => {
    const { output } = runContract({ json: true, version: "9.9.9" });
    const parsed = JSON.parse(output);
    expect(parsed.version).toBe("9.9.9"); // legacy field preserved (back-compat)
    expect(parsed.providers["claude-code"].skill).toEqual({ verified: true, path: ".claude/skills/" });
    expect(parsed.providers.antigravity.agent).toEqual({ verified: true, path: "~/.gemini/config/agents/*.md" });
  });

  it("carries the machine-discovery envelope (protocol_version, capabilities, schema)", () => {
    const parsed = JSON.parse(runContract({ json: true, version: "9.9.9" }).output);
    expect(parsed.protocol_version).toBe(PROTOCOL_VERSION);
    expect(parsed.cli_version).toBe("9.9.9");
    expect(parsed.capabilities).toEqual([...CAPABILITIES]);
    expect(parsed.capabilities.length).toBeGreaterThan(0);
    expect(parsed.schema).toEqual({ min: 1, max: 1 });
  });

  it("declares protocol 2 — the envelope lost a capability token", () => {
    // Retiring the claim-coverage system removed `coverage.claims.v1` from a
    // published contract. That is a breaking change for any consumer that
    // feature-gated on it, so the protocol version must move with it.
    const parsed = JSON.parse(runContract({ json: true, version: "9.9.9" }).output);
    expect(parsed.protocol_version).toBe("2");
    expect(parsed.capabilities).not.toContain("coverage.claims.v1");
  });

  it("emits the Markdown matrix without --json", () => {
    const { output } = runContract({ json: false, version: "9.9.9" });
    expect(output).toContain("| artifact | claude-code |");
    expect(output).not.toContain("9.9.9");
  });
});

describe("capability anti-rot guard", () => {
  it("KNOWN_COMMANDS matches the real registered command surface", () => {
    const registered = buildProgram()
      .commands.map((c) => c.name())
      .sort();
    expect(registered).toEqual([...KNOWN_COMMANDS].sort());
  });

  it("no longer registers a coverage command", () => {
    const registered = buildProgram().commands.map((c) => c.name());
    expect(registered).not.toContain("coverage");
    expect([...KNOWN_COMMANDS]).not.toContain("coverage");
  });
});
