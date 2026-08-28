import { describe, expect, it } from "vitest";
import { Command } from "commander";
import { buildProgram } from "../index.js";
import type { Kit } from "../kit/kit-types.js";
import { loadKit, resolveKitRoot } from "../kit/load-kit.js";
import { buildProviderMatrix } from "../providers/provider-matrix.js";
import { normalizeReleaseNotes, projectCli, projectKit, projectProof, projectProviders } from "./docs-bundle-projector.js";

describe("docs bundle projector", () => {
  it("projects public cli facts without leaking default values or absolute paths", () => {
    const program = new Command()
      .name("ariadnev")
      .description("Public CLI")
      .option("--token <value>", "private token", "secret-value")
      .option("--flag", "feature flag", false)
      .argument("<input>", "input path");
    program.command("doctor").alias("dr").description("Diagnose install state").option("--home <dir>", "home root", "/Users/test/private");

    const projected = projectCli(program);

    expect(projected.commands).toEqual([
      {
        path: "ariadnev",
        aliases: [],
        description: "Public CLI",
        arguments: [{ name: "input", required: true, variadic: false, description: "input path" }],
        options: [
          { flags: "--flag", description: "feature flag", required: false, optionalValue: false, variadic: false, defaultValueShape: "boolean" },
          { flags: "--token <value>", description: "private token", required: true, optionalValue: false, variadic: false, defaultValueShape: "string" },
        ],
      },
      {
        path: "ariadnev doctor",
        aliases: ["dr"],
        description: "Diagnose install state",
        arguments: [],
        options: [
          { flags: "--home <dir>", description: "home root", required: true, optionalValue: false, variadic: false, defaultValueShape: "string" },
        ],
      },
    ]);
    expect(JSON.stringify(projected)).not.toContain("secret-value");
    expect(JSON.stringify(projected)).not.toContain("/Users/test/private");
  });

  it("projects kit metadata with a reviewed public allowlist and no raw/private fields", () => {
    const kitRoot = resolveKitRoot(process.cwd());
    const canonicalKit = loadKit(kitRoot);
    const syntheticKit = {
      ...canonicalKit,
      skills: [
        {
          ...canonicalKit.skills[0]!,
          name: "synthetic",
          frontmatter: {
            name: "av:synthetic",
            description: "Public synthetic skill",
            metadata: {
              author: "V Chun",
              version: "1.0.0",
              nested: { secret: "drop-me" },
            },
            when_to_use: "Use publicly",
            category: "utility",
            "argument-hint": "--flag",
            "user-invocable": true,
            keywords: ["safe", "public"],
          },
          raw: "prompt body",
          body: "private body",
          sourcePath: "/Users/private/skill.md",
        },
      ],
    } as Kit;

    const projected = projectKit(syntheticKit);
    expect(projected.skills[0]).toEqual({
      id: "synthetic",
      name: "av:synthetic",
      description: "Public synthetic skill",
      whenToUse: "Use publicly",
      category: "utility",
      argumentHint: "--flag",
      userInvocable: true,
      keywords: ["public", "safe"],
      metadata: {
        author: "V Chun",
        version: "1.0.0",
      },
    });
    expect(JSON.stringify(projected)).not.toContain("drop-me");
    expect(JSON.stringify(projected)).not.toContain("prompt body");
    expect(JSON.stringify(projected)).not.toContain("private body");
    expect(JSON.stringify(projected)).not.toContain("/Users/private");
  });

  it("projects canonical providers in the reviewed public order", () => {
    const projected = projectProviders(buildProviderMatrix());
    expect(projected.providers.map((provider) => provider.id)).toEqual([
      "claude-code",
      "codex",
      "cursor",
      "antigravity",
      "opencode",
      "omp",
      "grok",
      "dsh",
      "generic",
    ]);
    expect(projected.providers.every((provider) => provider.artifacts.every((artifact) => artifact.verified))).toBe(true);
  });

  it("projects a fully unverified provider with no artifacts rather than dropping it", () => {
    // `dsh` has no verified cell at all. It still appears, because a public
    // bundle that omitted it would say nothing, while one that lists it with an
    // empty artifact set says "known, and nothing is installable" — which is
    // the fact a reader needs.
    const dsh = projectProviders(buildProviderMatrix()).providers.find((provider) => provider.id === "dsh");
    expect(dsh).toBeDefined();
    expect(dsh?.artifacts).toEqual([]);
  });

  it("summarizes proof inputs with explicit digest and enum validation", () => {
    expect(projectProof({
      schemaVersion: 1,
      boundary: "allowlist:v1",
      sourceDigests: {
        scenario: `sha256:${"a".repeat(64)}`,
        attestation: `sha256:${"b".repeat(64)}`,
      },
      claims: [
        { id: "bundle.redaction", status: "pass", summary: "Forbidden inputs are excluded." },
        { id: "bundle.determinism", status: "pass", summary: "Two builds match byte-for-byte." },
      ],
      attestations: [
        { id: "att-1", producer: "evaluator", proof: "outcome", status: "pass" },
        { id: "att-2", producer: "harness", proof: "artifact", status: "pass" },
      ],
      privateTranscript: "must not serialize",
    } as Record<string, unknown>)).toEqual({
      schemaVersion: 1,
      boundary: "allowlist:v1",
      sourceDigests: {
        attestation: `sha256:${"b".repeat(64)}`,
        scenario: `sha256:${"a".repeat(64)}`,
      },
      claims: [
        { id: "bundle.determinism", status: "pass", summary: "Two builds match byte-for-byte." },
        { id: "bundle.redaction", status: "pass", summary: "Forbidden inputs are excluded." },
      ],
      attestations: [
        { id: "att-1", producer: "evaluator", proof: "outcome", status: "pass" },
        { id: "att-2", producer: "harness", proof: "artifact", status: "pass" },
      ],
    });

    expect(() => projectProof({
      schemaVersion: 1,
      boundary: "allowlist:v1",
      sourceDigests: { bad: "sha256:short" },
      claims: [],
      attestations: [],
    } as Record<string, unknown>)).toThrow(/sha256 digest/i);
  });

  it("normalizes release notes and rejects secrets or absolute paths", () => {
    expect(normalizeReleaseNotes({
      version: "0.11.0",
      changelog: "# Changelog\n\n## 0.11.0\nLine 1\r\nLine 2\r\n",
      workspaceRoot: process.cwd(),
    })).toBe("## 0.11.0\nLine 1\nLine 2\n");

    expect(() => normalizeReleaseNotes({
      version: "0.11.0",
      changelog: "# Changelog\n\n## 0.11.0\nleak ghp_abcdefghijklmnopqrst1234\n",
      workspaceRoot: process.cwd(),
    })).toThrow(/secret/i);

    expect(() => normalizeReleaseNotes({
      version: "0.11.0",
      changelog: `# Changelog\n\n## 0.11.0\npath ${process.cwd()}/private.txt\n`,
      workspaceRoot: process.cwd(),
    })).toThrow(/path/i);

    // A slash command is not a path, and several ported skills name one in
    // their description. Rejecting those would block the bundle over text that
    // reveals nothing about any machine.
    expect(normalizeReleaseNotes({
      version: "0.11.0",
      changelog: "# Changelog\n\n## 0.11.0\nUse /goal for durable objectives, or /plan.\n",
      workspaceRoot: process.cwd(),
    })).toContain("/goal");
  });

  it("matches the current canonical program shape", () => {
    const projected = projectCli(buildProgram());
    expect(projected.commands.find((command) => command.path === "ariadnev")?.options.map((option) => option.flags)).toEqual([
      "--cwd <dir>",
      "--dry-run",
      "--home <dir>",
      "--yes",
      "-V, --version",
    ]);
    expect(projected.commands.some((command) => command.path === "ariadnev run")).toBe(true);
    expect(projected.commands.some((command) => command.path === "ariadnev validate")).toBe(true);
  });
});
