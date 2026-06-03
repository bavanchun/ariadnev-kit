import { describe, it, expect } from "vitest";
import { parse as tomlParse } from "smol-toml";
import { agentToToml, resolveSandboxMode } from "./agent-to-toml.js";

const reviewer = {
  name: "sample-reviewer",
  frontmatter: { description: "Reviews a diff.", tools: "Read, Grep, Glob" },
  body: "Use the Task tool and AskUserQuestion. Read .claude/rules/ here.",
};

describe("agentToToml", () => {
  const toml = agentToToml(reviewer);
  const parsed = tomlParse(toml) as Record<string, unknown>;

  it("emits valid, parseable TOML with required keys", () => {
    expect(parsed.name).toBe("sample-reviewer");
    expect(typeof parsed.description).toBe("string");
    expect(parsed.sandbox_mode).toBe("read-only"); // no write tools
    expect(typeof parsed.developer_instructions).toBe("string");
  });

  it("adapts paths/tools in developer_instructions", () => {
    const instr = parsed.developer_instructions as string;
    expect(instr).toContain("Codex spawn_agent tool");
    expect(instr).toContain("request_user_input");
    expect(instr).toContain("$HOME/.agents/vcskill/rules/");
    expect(instr).toContain("Codex custom agent converted from vcskill");
  });

  it("strips any footer from inline description", () => {
    const t = agentToToml({
      name: "x",
      frontmatter: { description: "Desc.\n\n## Codex Compatibility\n\nfoo" },
      body: "b",
    });
    expect((tomlParse(t) as Record<string, unknown>).description).toBe("Desc.");
  });
});

describe("resolveSandboxMode", () => {
  it("honors metadata.sandbox override", () => {
    expect(resolveSandboxMode({ metadata: { sandbox: "danger-full-access" }, tools: "Read" })).toBe(
      "danger-full-access",
    );
  });
  it("infers workspace-write when write tools present", () => {
    expect(resolveSandboxMode({ tools: "Read, Edit" })).toBe("workspace-write");
  });
  it("read-only when only read tools", () => {
    expect(resolveSandboxMode({ tools: ["Read", "Grep"] })).toBe("read-only");
  });
  it("defaults workspace-write when no tools declared", () => {
    expect(resolveSandboxMode({})).toBe("workspace-write");
  });
});
