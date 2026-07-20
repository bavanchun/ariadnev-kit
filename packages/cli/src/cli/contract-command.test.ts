import { describe, it, expect } from "vitest";
import { runContract } from "./contract-command.js";

describe("runContract", () => {
  it("emits schema-stable JSON with version + verified paths when --json", () => {
    const { output } = runContract({ json: true, version: "9.9.9" });
    const parsed = JSON.parse(output);
    expect(parsed.version).toBe("9.9.9");
    expect(parsed.providers["claude-code"].skill).toEqual({ verified: true, path: ".claude/skills/" });
    expect(parsed.providers.antigravity.agent).toEqual({ verified: false, path: null });
  });

  it("emits the Markdown matrix without --json", () => {
    const { output } = runContract({ json: false, version: "9.9.9" });
    expect(output).toContain("| artifact | claude-code |");
    expect(output).not.toContain("9.9.9");
  });
});
