import { describe, expect, it } from "vitest";
import { EXIT } from "../cli/exit-codes.js";
import { PROVIDER_IDS } from "../providers/index.js";
import { SPEC_VERIFIED } from "../providers/spec-verified.js";
import { ADAPTER_SPECS, DEFAULT_TARGET, DISPATCH_TARGETS, dispatchPrompt, invocationFor } from "./adapter-invocation.js";
import type { ResolvedSkill } from "./resolve-skill-ref.js";

const skill: ResolvedSkill = {
  ref: { kit: "demo", skill: "scout" },
  dir: "/kits/demo/skills/scout",
  skillFile: "/kits/demo/skills/scout/SKILL.md",
  source: "kits-dir",
};

describe("building an adapter invocation", () => {
  it("puts the non-interactive flag before the prompt", () => {
    const invocation = invocationFor("claude-code", skill, []);
    expect(invocation.binary).toBe("claude");
    expect(invocation.args[0]).toBe("-p");
    expect(invocation.args).toHaveLength(2);
  });

  it("uses codex's exec subcommand rather than a flag", () => {
    expect(invocationFor("codex", skill, []).args[0]).toBe("exec");
  });

  it("names the binary, not the provider id, for cursor", () => {
    // The provider is `cursor`; the executable is `cursor-agent`. Spawning
    // `cursor` would open the editor.
    expect(invocationFor("cursor", skill, []).binary).toBe("cursor-agent");
  });

  it("refuses a provider with no verified invocation", () => {
    expect(() => invocationFor("grok", skill, [])).toThrow(/no verified dispatch invocation for grok/);
  });

  it("refuses the fully unverified provider from the provider union", () => {
    // `dsh` has no verified cell in the provider matrix either. Dispatch and
    // install give the same answer about it, which is the point.
    expect(() => invocationFor("dsh", skill, [])).toThrow(/no verified dispatch invocation for dsh/);
  });

  it("reports a refusal as unavailable, not as a usage error", () => {
    // `--target grok` is a correctly-typed invocation of a capability this
    // build lacks. Exit 2 would send the user to fix their command line.
    try {
      invocationFor("grok", skill, []);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as { exitCode: number }).exitCode).toBe(EXIT.unavailable);
    }
  });

  it("lists the available targets in the refusal", () => {
    expect(() => invocationFor("dsh", skill, [])).toThrow(/available targets: .*claude-code/);
  });

  it("refuses every provider absent from the table, including ones added later", () => {
    // A partial record is what makes this hold: extending ProviderId cannot
    // make a provider dispatchable by accident.
    for (const provider of PROVIDER_IDS) {
      if (DISPATCH_TARGETS.includes(provider)) continue;
      expect(() => invocationFor(provider, skill, []), `${provider} is dispatchable without an entry`).toThrow();
    }
  });
});

describe("the dispatch prompt", () => {
  it("names the skill by absolute path so the agent can read it from any cwd", () => {
    expect(dispatchPrompt(skill, [])).toContain("/kits/demo/skills/scout/SKILL.md");
  });

  it("carries the reference the user typed", () => {
    expect(dispatchPrompt(skill, [])).toContain("demo/scout");
  });

  it("appends user arguments", () => {
    expect(dispatchPrompt(skill, ["--fast", "auth"])).toContain("Arguments: --fast auth");
  });

  it("says nothing about arguments when there are none", () => {
    expect(dispatchPrompt(skill, [])).not.toContain("Arguments:");
  });

  it("does not inline the skill body", () => {
    // A SKILL.md has no size bound and the prompt travels on a command line
    // that does. Naming the path is also how every one of these agents
    // actually loads a skill.
    expect(dispatchPrompt(skill, []).length).toBeLessThan(400);
  });
});

describe("the dispatch table agrees with the provider matrix", () => {
  it("dispatches only to providers whose skill cell is verified", () => {
    for (const target of DISPATCH_TARGETS) {
      expect(SPEC_VERIFIED[target].paths.skill.verified, `${target} is dispatchable but its skill cell is unverified`)
        .toBe(true);
    }
  });

  it("defaults to a target that is in the table", () => {
    expect(ADAPTER_SPECS[DEFAULT_TARGET]).toBeDefined();
  });
});
