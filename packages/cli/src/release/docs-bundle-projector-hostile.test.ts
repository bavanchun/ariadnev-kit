import { describe, expect, it } from "vitest";
import { Command } from "commander";
import type { Kit } from "../kit/kit-types.js";
import type { MatrixData } from "../providers/provider-matrix.js";
import { projectCli, projectKit, projectProof, projectProviders } from "./docs-bundle-projector.js";

describe("docs bundle projector hostile fixtures", () => {
  it("rejects unsafe cli aliases, argument names, option fields, and descriptions", () => {
    const program = new Command().name("ariadnev").description("Public CLI");
    program.command("scan").alias("/Users/private/bin").description("Safe").argument("<C:\\\\secret>");
    program.command("config").description("Safe").option("--token <ghp_abcdefghijklmnopqrst1234>", "desc");
    program.command("unsafe").description("Path /Users/private");

    expect(() => projectCli(program)).toThrow(/absolute path|secret/i);

    for (const description of ["Reads /tmp/private-state", "workspace=/private/state", "path:/etc/passwd", "root[/opt/data]"]) {
      expect(() => projectCli(new Command().name("ariadnev").description(description))).toThrow(/absolute path/i);
    }
    expect(() => projectCli(new Command().name("ariadnev").description("Docs https://ariadnev.com/reference"))).not.toThrow();
    expect(() => projectCli(new Command().name("ariadnev").description("Accept a task or plan / phase file"))).not.toThrow();
  });

  it("drops unknown skill metadata keys and rejects unsafe public string fields", () => {
    const kit = {
      root: process.cwd(),
      agents: [],
      commands: [],
      outputStyles: [],
      rules: [],
      hooks: [],
      warnings: [],
      scriptsDir: null,
      envExample: null,
      workflows: [],
      skills: [{
        type: "skill",
        name: "skill/../private",
        body: "private body",
        raw: "private raw",
        sourcePath: "/Users/private/skill.md",
        frontmatter: {
          name: "av:demo",
          description: "Safe",
          metadata: {
            author: "/Users/private",
            version: "1.0.0",
            forkedFrom: "drop-me",
            notes: ["drop-me"],
          },
        },
      }],
    } satisfies Kit;

    expect(() => projectKit(kit)).toThrow(/absolute path/i);

    const safeKit = {
      ...kit,
      skills: [{
        ...kit.skills[0],
        name: "demo-skill",
        frontmatter: {
          ...kit.skills[0].frontmatter,
          metadata: {
            author: "V Chun",
            version: "1.0.0",
            forkedFrom: "drop-me",
            notes: ["drop-me"],
          },
        },
      }],
    } satisfies Kit;
    expect(projectKit(safeKit).skills).toEqual([{
      id: "demo-skill",
      name: "av:demo",
      description: "Safe",
      metadata: {
        author: "V Chun",
        version: "1.0.0",
      },
    }]);
  });

  it("rejects unsafe workflow graph fields and provider path leaks", () => {
    const kit = {
      root: process.cwd(),
      skills: [],
      agents: [],
      commands: [],
      outputStyles: [],
      rules: [],
      hooks: [],
      warnings: [],
      scriptsDir: null,
      envExample: null,
      workflows: [{
        name: "release",
        raw: "{}",
        sourcePath: "/Users/private/workflow.json",
        graph: {
          id: "release",
          title: "Release flow",
          description: "Public",
          entry: "agent-1",
          state: { fields: [] },
          nodes: [{ id: "agent-1", type: "agent", handler: { kind: "agent", ref: "C:\\\\private\\\\agent" }, state: { reads: [], writes: [] }, authority: { effect: "none", capabilities: [], idempotency: "optional" } }],
          edges: [{ id: "edge-1", from: "agent-1", to: "agent-1", type: "\\\\server\\share" }],
        },
      }],
    } as unknown as Kit;
    const providers: MatrixData = {
      codex: { skill: { verified: true, path: "\\\\server\\share\\skills" }, agent: { verified: false, path: null } },
    };

    expect(() => projectKit(kit)).toThrow(/absolute path/i);
    expect(() => projectProviders(providers)).toThrow(/absolute path/i);
  });

  it("rejects unsafe proof fields instead of copying them through", () => {
    expect(() => projectProof({
      schemaVersion: 1,
      boundary: "allowlist:v1",
      sourceDigests: { "C:\\\\secret": `sha256:${"a".repeat(64)}` },
      claims: [{ id: "bundle.redaction", status: "pass", summary: "\\\\server\\share" }],
      attestations: [{ id: "/Users/private", producer: "harness", proof: "artifact", status: "pass" }],
    } as Record<string, unknown>)).toThrow(/absolute path/i);
  });
});
