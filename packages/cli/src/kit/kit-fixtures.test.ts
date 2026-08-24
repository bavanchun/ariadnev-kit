import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { loadKit, resolveKitRoot, KitValidationError } from "./load-kit.js";
import { skillFiles } from "../install/artifact-content.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoKitRoot = join(here, "..", "..", "..", "..", "kit");
const REQUIRED_SKILL_SECTIONS = `
## Output format

Output.

## Quality gates

- Check.

## Workflow position

Related: none.
`;
const NONE_PROVENANCE = "";
const IGNORE_FIXTURE_SKILL = `---
name: av:demo
description: Use this fixture skill to prove the loader and installer share one ignore list.
---

# Demo

See references/used.md.
${REQUIRED_SKILL_SECTIONS}`;

function withProvenance(content: string): string {
  return content;
}

describe("loadKit (real kit/)", () => {
  const kit = loadKit(repoKitRoot);

  it("discovers all artifact kinds", () => {
    expect(kit.skills.length).toBeGreaterThanOrEqual(2);
    // agents/commands roster is under active construction (av kit v2 plan);
    // arrays must exist even when empty — non-empty asserted by the
    // "full-kit install smoke" describe block once the roster lands.
    expect(kit.agents).toBeInstanceOf(Array);
    expect(kit.commands).toBeInstanceOf(Array);
    expect(kit.rules.length).toBeGreaterThanOrEqual(1);
    expect(kit.scriptsDir).not.toBeNull();
    expect(kit.envExample).not.toBeNull();
  });

  it("parses skill frontmatter and enforces av: name == dir", () => {
    for (const s of kit.skills) {
      expect(s.frontmatter.name).toBe(`av:${s.name}`);
      expect(typeof s.frontmatter.description).toBe("string");
      expect((s.frontmatter.description as string).length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate skill names", () => {
    const names = kit.skills.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("loadKit validation (negative cases)", () => {
  function tmpKit(): string {
    const root = mkdtempSync(join(tmpdir(), "ariadnev-kit-"));
    mkdirSync(join(root, "skills"), { recursive: true });
    return root;
  }

  function writeSkill(root: string, dir: string, frontmatter: string) {
    mkdirSync(join(root, "skills", dir), { recursive: true });
    writeFileSync(
      join(root, "skills", dir, "SKILL.md"),
      `---\n${frontmatter}\n${NONE_PROVENANCE}\n---\n\n# body\n${REQUIRED_SKILL_SECTIONS}`,
    );
  }

  it("rejects missing av: prefix", () => {
    const root = tmpKit();
    writeSkill(root, "foo", "name: foo\ndescription: x");
    expect(() => loadKit(root)).toThrow(KitValidationError);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects name/dir mismatch", () => {
    const root = tmpKit();
    writeSkill(root, "foo", "name: av:bar\ndescription: x");
    expect(() => loadKit(root)).toThrow(/av:foo/);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects missing description", () => {
    const root = tmpKit();
    writeSkill(root, "foo", "name: av:foo");
    expect(() => loadKit(root)).toThrow(KitValidationError);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects duplicate names", () => {
    const root = tmpKit();
    const desc = "Valid fixture skill. Use when testing kit loading of multiple skills.";
    writeSkill(root, "foo", `name: av:foo\ndescription: ${desc}`);
    // second skill dir 'bar' but name av:foo -> mismatch first, so use valid dup setup
    mkdirSync(join(root, "skills", "foo2"), { recursive: true });
    writeFileSync(
      join(root, "skills", "foo2", "SKILL.md"),
      `---\nname: av:foo2\ndescription: ${desc}\n${NONE_PROVENANCE}\n---\n# foo2\n${REQUIRED_SKILL_SECTIONS}`,
    );
    // duplicate is hard to trigger with name==dir invariant; ensure valid kit loads
    expect(loadKit(root).skills.length).toBe(2);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("loadKit skill lint gates (negative fixtures)", () => {
  function tmpKit(): string {
    const root = mkdtempSync(join(tmpdir(), "ariadnev-lint-"));
    mkdirSync(join(root, "skills"), { recursive: true });
    return root;
  }

  function writeSkillFile(root: string, dir: string, content: string) {
    mkdirSync(join(root, "skills", dir), { recursive: true });
    writeFileSync(join(root, "skills", dir, "SKILL.md"), withProvenance(content));
  }

  const okDescription = "Demo skill for lint tests. Use when validating the kit CI gate rules.";

  it("rejects a too-short description", () => {
    const root = tmpKit();
    writeSkillFile(root, "foo", `---\nname: av:foo\ndescription: Use it.\n---\n# foo\n`);
    expect(() => loadKit(root)).toThrow(KitValidationError);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects a description without trigger verb", () => {
    const root = tmpKit();
    writeSkillFile(
      root,
      "foo",
      `---\nname: av:foo\ndescription: A pile of git conventions and various pipelines together.\n---\n# foo\n`,
    );
    expect(() => loadKit(root)).toThrow(/trigger/);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects SKILL.md over 300 lines", () => {
    const root = tmpKit();
    const body = Array.from({ length: 301 }, (_, i) => `line ${i}`).join("\n");
    writeSkillFile(root, "foo", `---\nname: av:foo\ndescription: ${okDescription}\n---\n${body}\n`);
    expect(() => loadKit(root)).toThrow(/300/);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects a reference file over the 800-line budget", () => {
    const root = tmpKit();
    writeSkillFile(
      root,
      "foo",
      `---\nname: av:foo\ndescription: ${okDescription}\n---\n# foo\n${REQUIRED_SKILL_SECTIONS}`,
    );
    mkdirSync(join(root, "skills", "foo", "references"), { recursive: true });
    writeFileSync(
      join(root, "skills", "foo", "references", "big.md"),
      Array.from({ length: 801 }, () => "x").join("\n"),
    );
    expect(() => loadKit(root)).toThrow(/big\.md/);
    rmSync(root, { recursive: true, force: true });
  });

  it("accepts a reference file that only the old 300-line budget rejected", () => {
    // The budget moved 300 → 800 on measured evidence: 83 of 463 linted
    // reference files exceed 300 and only 6 exceed 800. Pins the new floor so
    // the raise cannot be quietly undone.
    const root = tmpKit();
    writeSkillFile(
      root,
      "foo",
      `---\nname: av:foo\ndescription: ${okDescription}\n---\n# foo\n${REQUIRED_SKILL_SECTIONS}`,
    );
    mkdirSync(join(root, "skills", "foo", "references"), { recursive: true });
    writeFileSync(
      join(root, "skills", "foo", "references", "big.md"),
      `# Big\n\nSee references/big.md.\n${Array.from({ length: 400 }, () => "x").join("\n")}`,
    );
    expect(() => loadKit(root)).not.toThrow();
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects unknown frontmatter fields", () => {
    const root = tmpKit();
    writeSkillFile(
      root,
      "foo",
      `---\nname: av:foo\ndescription: ${okDescription}\ncatgeory: dev-tools\n---\n# foo\n`,
    );
    expect(() => loadKit(root)).toThrow(/catgeory/);
    rmSync(root, { recursive: true, force: true });
  });

  it("surfaces duplicate-heading overlap as kit warnings, not errors", () => {
    const root = tmpKit();
    writeSkillFile(
      root,
      "foo",
      `---\nname: av:foo\ndescription: ${okDescription}\n---\n# foo\n${REQUIRED_SKILL_SECTIONS}\n## Shared Heading\n`,
    );
    mkdirSync(join(root, "skills", "foo", "references"), { recursive: true });
    writeFileSync(join(root, "skills", "foo", "references", "ref.md"), "## Shared Heading\n\ntext\n");
    const kit = loadKit(root);
    expect(kit.warnings.some((w) => w.includes("Shared Heading"))).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it("real kit/ passes the lint gate", () => {
    expect(() => loadKit(repoKitRoot)).not.toThrow();
  });
});

describe("loadKit hooks discovery", () => {
  function tmpKitWithHook(manifest: string | null, withCjs = true): string {
    const root = mkdtempSync(join(tmpdir(), "ariadnev-hooks-"));
    mkdirSync(join(root, "skills"), { recursive: true });
    const hookDir = join(root, "hooks", "session-init");
    mkdirSync(hookDir, { recursive: true });
    if (withCjs) writeFileSync(join(hookDir, "hook.cjs"), "process.exit(0);\n");
    if (manifest !== null) writeFileSync(join(hookDir, "hook.json"), manifest);
    return root;
  }

  it("discovers hooks with manifest {event, matcher?, description}", () => {
    const root = tmpKitWithHook(
      JSON.stringify({ event: "SessionStart", description: "init session env" }),
    );
    const kit = loadKit(root);
    expect(kit.hooks.length).toBe(1);
    expect(kit.hooks[0].name).toBe("session-init");
    expect(kit.hooks[0].manifest.event).toBe("SessionStart");
    expect(kit.hooks[0].file.endsWith("hook.cjs")).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects a hook manifest without event", () => {
    const root = tmpKitWithHook(JSON.stringify({ description: "no event" }));
    expect(() => loadKit(root)).toThrow(KitValidationError);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects a hook dir missing hook.cjs", () => {
    const root = tmpKitWithHook(
      JSON.stringify({ event: "Stop", description: "persist state" }),
      false,
    );
    expect(() => loadKit(root)).toThrow(/hook\.cjs/);
    rmSync(root, { recursive: true, force: true });
  });

  it("skips underscore-prefixed dirs like _lib", () => {
    const root = tmpKitWithHook(
      JSON.stringify({ event: "SessionStart", description: "init session env" }),
    );
    mkdirSync(join(root, "hooks", "_lib"), { recursive: true });
    writeFileSync(join(root, "hooks", "_lib", "helper.cjs"), "module.exports = {};\n");
    const kit = loadKit(root);
    expect(kit.hooks.map((h) => h.name)).toEqual(["session-init"]);
    rmSync(root, { recursive: true, force: true });
  });

  it("accepts a multi-event manifest via events[]", () => {
    const root = tmpKitWithHook(
      JSON.stringify({ events: ["Stop", "SubagentStop"], description: "persist state" }),
    );
    const kit = loadKit(root);
    expect(kit.hooks[0].manifest.events).toEqual(["Stop", "SubagentStop"]);
    rmSync(root, { recursive: true, force: true });
  });

  it("returns empty hooks when kit has no hooks dir", () => {
    const root = mkdtempSync(join(tmpdir(), "ariadnev-nohooks-"));
    mkdirSync(join(root, "skills"), { recursive: true });
    expect(loadKit(root).hooks).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("loadKit agent lint gates", () => {
  function tmpKit(): string {
    const root = mkdtempSync(join(tmpdir(), "ariadnev-agentlint-"));
    mkdirSync(join(root, "skills"), { recursive: true });
    mkdirSync(join(root, "agents"), { recursive: true });
    return root;
  }

  const okDescription =
    "Use this agent when scouting a codebase, needing a fast file map, or tracing how modules relate. <example>Example: user asks to find auth code; assistant delegates to av-explore.</example><commentary>Fast read-only scan avoids the main agent burning context on broad greps.</commentary>";

  function writeAgent(root: string, stem: string, frontmatterExtra: string) {
    writeFileSync(
      join(root, "agents", `av-${stem}.md`),
      `---\nname: av-${stem}\ndescription: "${okDescription}"\n${frontmatterExtra}---\n\n# ${stem}\n\nPersona.\n\n## Behavioral Checklist\n\n- [ ] Item\n`,
    );
  }

  it("rejects any agent that skips the house rules, whatever its filename", () => {
    // The lint once exempted agents whose filename lacked an `av-` prefix. No
    // agent file carried it, so the exemption covered all of them and the gate
    // certified nothing. Every shipped agent meets the rules now, and loadKit
    // is what keeps it that way.
    const root = tmpKit();
    writeFileSync(
      join(root, "agents", "demo.md"),
      `---\nname: demo\ndescription: "${okDescription}"\n---\n\n# demo\n\nNo checklist.\n`,
    );
    expect(() => loadKit(root)).toThrow(/Behavioral Checklist/);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects an agent body over the line limit", () => {
    const root = tmpKit();
    const body = Array.from({ length: 121 }, (_, i) => `line ${i}`).join("\n");
    writeFileSync(
      join(root, "agents", "av-demo.md"),
      `---\nname: av-demo\ndescription: "${okDescription}"\n---\n${body}\n\n## Behavioral Checklist\n`,
    );
    expect(() => loadKit(root)).toThrow(/120/);
    rmSync(root, { recursive: true, force: true });
  });

  it("accepts a well-formed agent", () => {
    const root = tmpKit();
    writeAgent(root, "demo", "");
    const kit = loadKit(root);
    expect(kit.agents.some((a) => a.name === "av-demo")).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("resolveKitRoot", () => {
  it("locates a directory containing skills/ from a start path", () => {
    const root = resolveKitRoot(repoKitRoot);
    expect(root).toBe(repoKitRoot);
  });
});

describe("loader and installer agree on which files exist", () => {
  it("both skip the same ignored trees inside a skill", () => {
    const root = mkdtempSync(join(tmpdir(), "ariadnev-ignore-"));
    const skill = join(root, "skills", "demo");
    mkdirSync(join(skill, "references"), { recursive: true });
    mkdirSync(join(skill, ".venv", "lib"), { recursive: true });
    mkdirSync(join(skill, "node_modules", "pkg"), { recursive: true });
    mkdirSync(join(skill, "scripts"), { recursive: true });
    writeFileSync(join(skill, "SKILL.md"), IGNORE_FIXTURE_SKILL);
    writeFileSync(join(skill, "references", "used.md"), "# Used\n");
    writeFileSync(join(skill, "scripts", "run.py"), "print('hi')\n");
    writeFileSync(join(skill, ".venv", "lib", "junk.py"), "junk\n");
    writeFileSync(join(skill, "node_modules", "pkg", "index.js"), "junk\n");
    writeFileSync(join(skill, ".env"), "SECRET=1\n");

    const kit = loadKit(root);
    const copied = skillFiles(kit.skills[0], "claude-code").map((f) => f.rel).sort();

    expect(copied).toEqual(["SKILL.md", "references/used.md", "scripts/run.py"]);
    // A directory named like an ignored tree is not a skill either.
    mkdirSync(join(root, "skills", "node_modules"), { recursive: true });
    writeFileSync(join(root, "skills", "node_modules", "SKILL.md"), IGNORE_FIXTURE_SKILL);
    expect(loadKit(root).skills.map((s) => s.name)).toEqual(["demo"]);

    rmSync(root, { recursive: true, force: true });
  });
});
