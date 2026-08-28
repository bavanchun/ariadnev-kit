import { describe, expect, it } from "vitest";
import type { Artifact, Kit } from "../kit/kit-types.js";
import {
  CATALOG_KINDS,
  COMMAND_FOR_KIND,
  artifactsOf,
  catalogEntries,
  installedProviders,
  matchesQuery,
  toEntry,
  workflowEdges,
  type ArtifactTarget,
} from "./catalog-entries.js";

function artifact(name: string, frontmatter: Record<string, unknown> = {}, body = ""): Artifact {
  return { type: "skill", name, frontmatter, body, raw: body, sourcePath: `/kit/skills/${name}/SKILL.md` };
}

const kit = {
  skills: [artifact("scout", { description: "Find files", category: "dev-tools", keywords: ["search", "codebase"] }),
    artifact("brainstorm", { description: "Explore options" })],
  agents: [artifact("code-reviewer", { description: "Reviews code" })],
  commands: [artifact("term-config", { description: "Terminal setup" })],
} as unknown as Kit;

const noTargets = (): ArtifactTarget[] => [];
const never = (): boolean => false;

describe("selecting the artifact array for a kind", () => {
  it("maps each kind to its own collection", () => {
    expect(artifactsOf(kit, "skill").map((a) => a.name)).toEqual(["scout", "brainstorm"]);
    expect(artifactsOf(kit, "agent").map((a) => a.name)).toEqual(["code-reviewer"]);
    expect(artifactsOf(kit, "command").map((a) => a.name)).toEqual(["term-config"]);
  });

  it("gives every kind a command name", () => {
    for (const kind of CATALOG_KINDS) expect(COMMAND_FOR_KIND[kind]).toBeTruthy();
  });
});

describe("deciding what is installed", () => {
  it("reports the providers whose destination exists on disk", () => {
    const targets: ArtifactTarget[] = [
      { provider: "claude-code", target: "/w/.claude/skills/av-scout" },
      { provider: "codex", target: "/h/.codex/skills/av-scout" },
    ];
    expect(installedProviders(targets, (p) => p.startsWith("/w"))).toEqual(["claude-code"]);
  });

  it("ignores a provider with no verified destination", () => {
    // A null target is the installer's own answer for an unverified cell.
    // Treating it as installed would claim a file that was never written.
    const targets: ArtifactTarget[] = [{ provider: "dsh", target: null }];
    expect(installedProviders(targets, () => true)).toEqual([]);
  });

  it("does not decide from a name appearing in a path", () => {
    // The regression this replaced: matching the receipt's paths by artifact
    // name answered "not installed" for everything, because the installed
    // directory is `av-scout` rather than `scout`. Asking the resolver where
    // the file goes removes the guess entirely.
    const targets: ArtifactTarget[] = [{ provider: "claude-code", target: "/w/.claude/skills/av-scout" }];
    expect(installedProviders(targets, (p) => p === "/w/.claude/skills/av-scout")).toEqual(["claude-code"]);
    expect(installedProviders(targets, (p) => p === "/w/.claude/skills/scout")).toEqual([]);
  });

  it("sorts providers so two runs render identically", () => {
    const targets: ArtifactTarget[] = [
      { provider: "opencode", target: "/x" },
      { provider: "codex", target: "/x" },
    ];
    expect(installedProviders(targets, () => true)).toEqual(["codex", "opencode"]);
  });
});

describe("building a catalog entry", () => {
  it("projects the frontmatter fields a reader needs", () => {
    expect(toEntry(kit.skills[0], "skill", noTargets(), never)).toEqual({
      name: "scout",
      kind: "skill",
      description: "Find files",
      category: "dev-tools",
      keywords: ["codebase", "search"],
      installed: false,
      providers: [],
    });
  });

  it("survives an artifact that declares nothing", () => {
    const entry = toEntry(artifact("bare"), "skill", noTargets(), never);
    expect(entry.description).toBe("");
    expect(entry.category).toBeNull();
    expect(entry.keywords).toEqual([]);
  });

  it("ignores non-string keywords rather than rendering them", () => {
    const entry = toEntry(artifact("odd", { keywords: ["ok", 7, null] }), "skill", noTargets(), never);
    expect(entry.keywords).toEqual(["ok"]);
  });

  it("sorts entries by name so output is stable", () => {
    expect(catalogEntries(kit, "skill", noTargets, never).map((e) => e.name)).toEqual(["brainstorm", "scout"]);
  });
});

describe("searching the catalog", () => {
  const entry = toEntry(kit.skills[0], "skill", noTargets(), never);

  it.each(["scout", "SCOUT", "find", "dev-tools", "codebase"])("matches %s", (query) => {
    expect(matchesQuery(entry, query)).toBe(true);
  });

  it("searches description and keywords, not just the name", () => {
    // The case search exists for: finding a skill whose name you do not know.
    expect(matchesQuery(entry, "files")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(matchesQuery(entry, "payment")).toBe(false);
  });

  it("treats an empty query as matching everything", () => {
    expect(matchesQuery(entry, "   ")).toBe(true);
  });
});

describe("reading workflow edges out of skill prose", () => {
  const body = [
    "# Scout",
    "",
    "## Workflow Position",
    "",
    "**Typically follows:** `plan` (after planning)",
    "**Typically precedes:** `debug` (investigate), `fix` (repair)",
    "**Related:** `brainstorm`",
    "",
    "## Something Else",
    "**Typically follows:** `not-an-edge`",
  ].join("\n");

  it("reads each labelled relationship", () => {
    expect(workflowEdges(body)).toEqual({
      follows: ["plan"],
      precedes: ["debug", "fix"],
      related: ["brainstorm"],
    });
  });

  it("stops at the next heading rather than swallowing the rest of the file", () => {
    expect(workflowEdges(body).follows).not.toContain("not-an-edge");
  });

  it("returns nothing for a skill with no workflow section", () => {
    expect(workflowEdges("# Just a skill\n\nSome prose.")).toEqual({ follows: [], precedes: [], related: [] });
  });

  it("takes names only from backticks, so prose does not become an edge", () => {
    const prose = "## Workflow Position\n\n**Related:** run this after planning, obviously\n";
    expect(workflowEdges(prose).related).toEqual([]);
  });

  it("ignores a label it does not know", () => {
    const odd = "## Workflow Position\n\n**Sometimes:** `plan`\n";
    expect(workflowEdges(odd)).toEqual({ follows: [], precedes: [], related: [] });
  });
});
