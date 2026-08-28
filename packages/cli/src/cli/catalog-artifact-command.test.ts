import { existsSync, mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { getKitRoot } from "../kit/embedded-kit.js";
import { loadKit } from "../kit/load-kit.js";
import type { Kit } from "../kit/kit-types.js";
import { CATALOG_KINDS, COMMAND_FOR_KIND, type CatalogKind } from "../catalog/catalog-entries.js";
import { runCatalog, type CatalogOpts } from "./catalog-artifact-command.js";
import { EXIT } from "./exit-codes.js";

let kit: Kit;
let home: string;
let cwd: string;

beforeEach(() => {
  kit = loadKit(getKitRoot(process.cwd()));
  const root = mkdtempSync(join(tmpdir(), "av-catalog-"));
  home = join(root, "home");
  cwd = join(root, "work");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
});

function opts(overrides: Partial<CatalogOpts> = {}): CatalogOpts {
  return { kind: "skill", verb: "list", scope: "project", home, cwd, ...overrides };
}

/** A name that exists in the real kit for each artifact kind. */
function sampleName(kind: CatalogKind): string {
  const list = kind === "skill" ? kit.skills : kind === "agent" ? kit.agents : kit.commands;
  return list[0].name;
}

describe("listing the catalog", () => {
  it("lists every artifact of the kind, none installed in a fresh tree", () => {
    const result = runCatalog(kit, opts());
    expect(result.exitCode).toBe(EXIT.ok);
    expect(result.output).toContain(`of ${kit.skills.length}`);
  });

  it("emits the same envelope shape for all three kinds", () => {
    // The reason the implementation is shared. A consumer switching from
    // `agents list --json` to `skills list --json` must not have to switch
    // parsers too.
    const shapes = CATALOG_KINDS.map((kind) => {
      const parsed = JSON.parse(runCatalog(kit, opts({ kind, json: true })).output) as Record<string, unknown>;
      return Object.keys(parsed).sort().join(",");
    });
    expect(new Set(shapes).size, `envelopes differ across kinds: ${shapes.join(" | ")}`).toBe(1);
    expect(shapes[0]).toBe("data,kind,schema_version");
  });

  it("namespaces the envelope kind per artifact kind", () => {
    for (const kind of CATALOG_KINDS) {
      const parsed = JSON.parse(runCatalog(kit, opts({ kind, json: true })).output) as { kind: string };
      expect(parsed.kind).toBe(`${kind}.list`);
    }
  });

  it("narrows to what is on disk with --installed", () => {
    expect(runCatalog(kit, opts({ installedOnly: true })).output).toContain("nothing to show");
  });
});

describe("searching", () => {
  it("finds a skill by a word from its description", () => {
    const result = runCatalog(kit, opts({ verb: "search", name: "codebase" }));
    expect(result.exitCode).toBe(EXIT.ok);
    expect(result.output).toMatch(/\d+ match\(es\)/);
  });

  it("answers no with exit 1, so a script can branch without parsing", () => {
    const result = runCatalog(kit, opts({ verb: "search", name: "zzz-no-such-thing" }));
    expect(result.exitCode).toBe(EXIT.failed);
    expect(result.output).toContain("0 match(es)");
  });

  it("requires a query rather than listing everything", () => {
    expect(() => runCatalog(kit, opts({ verb: "search" }))).toThrow(/requires a query/);
  });
});

describe("showing one artifact", () => {
  it("shows details for each kind", () => {
    for (const kind of CATALOG_KINDS) {
      const name = sampleName(kind);
      expect(runCatalog(kit, opts({ kind, verb: "show", name })).output).toContain(name);
    }
  });

  it("refuses an unknown name as a usage error", () => {
    const failing = () => runCatalog(kit, opts({ verb: "show", name: "no-such-skill" }));
    expect(failing).toThrow(/no skill named/);
    expect(failing).toThrow(expect.objectContaining({ exitCode: EXIT.usage }));
  });
});

describe("the skill graph", () => {
  it("reports relationships for the whole kit", () => {
    expect(runCatalog(kit, opts({ verb: "graph" })).output).toContain("av skills graph");
  });

  it("marks an edge naming something outside the kit as unresolved", () => {
    // Skills cross-reference prose names that are not kit artifacts. Dropping
    // those silently would make the graph look complete when it is not.
    const parsed = JSON.parse(runCatalog(kit, opts({ verb: "graph", json: true })).output) as {
      data: { skills: { unresolved: string[] }[] };
    };
    expect(parsed.data.skills.some((node) => node.unresolved.length > 0)).toBe(true);
  });

  it("is refused for the kinds that declare no workflow position", () => {
    for (const kind of ["agent", "command"] as CatalogKind[]) {
      expect(() => runCatalog(kit, opts({ kind, verb: "graph" }))).toThrow(/only available for skills/);
    }
  });
});

describe("installing and removing a single artifact", () => {
  it("writes only that artifact's files, not the rest of the kit", () => {
    const name = sampleName("skill");
    runCatalog(kit, opts({ verb: "install", name }));
    const installedDirs = readdirSync(join(cwd, ".claude", "skills"));
    expect(installedDirs).toHaveLength(1);
  });

  it("makes the artifact show as installed afterwards", () => {
    const name = sampleName("skill");
    runCatalog(kit, opts({ verb: "install", name }));
    expect(runCatalog(kit, opts({ installedOnly: true })).output).toContain(name);
  });

  it("leaves nothing behind on remove, so list stops reporting it", () => {
    // Removing the files but not the directory left `list` answering yes: it
    // decides from the directory's existence. The empty tree has to go too.
    const name = sampleName("skill");
    runCatalog(kit, opts({ verb: "install", name }));
    runCatalog(kit, opts({ verb: "remove", name }));
    expect(runCatalog(kit, opts({ installedOnly: true })).output).toContain("nothing to show");
  });

  it("never deletes the kind root itself", () => {
    // `.claude/skills` is shared with every other skill and with other tools.
    const name = sampleName("skill");
    runCatalog(kit, opts({ verb: "install", name }));
    runCatalog(kit, opts({ verb: "remove", name }));
    expect(existsSync(join(cwd, ".claude", "skills"))).toBe(true);
  });

  it("writes nothing under --dry-run", () => {
    const name = sampleName("skill");
    const result = runCatalog(kit, opts({ verb: "install", name, dryRun: true }));
    expect(result.output).toContain("would install");
    expect(existsSync(join(cwd, ".claude", "skills", `av-${name}`))).toBe(false);
  });

  it("refuses a provider with no verified path for the kind", () => {
    // The same skip-and-log answer a full install gives, and the same exit as
    // any other "the environment cannot do this".
    const failing = () => runCatalog(kit, opts({ verb: "install", name: sampleName("skill"), provider: "dsh" }));
    expect(failing).toThrow(/no verified path/);
    expect(failing).toThrow(expect.objectContaining({ exitCode: EXIT.unavailable }));
  });

  it("refuses an unknown provider as a usage error", () => {
    expect(() => runCatalog(kit, opts({ verb: "install", name: sampleName("skill"), provider: "nope" })))
      .toThrow(/unknown --provider/);
  });

  it("refuses an unknown artifact with a suggestion", () => {
    const name = `${sampleName("skill")}-typo`;
    expect(() => runCatalog(kit, opts({ verb: "install", name }))).toThrow(/did you mean/);
  });

  it("reports removing something that was never installed without failing", () => {
    const result = runCatalog(kit, opts({ verb: "remove", name: sampleName("skill") }));
    expect(result.exitCode).toBe(EXIT.ok);
    expect(result.output).toContain("nothing installed");
  });

  it("installs an agent and a command too, through the same code", () => {
    for (const kind of ["agent", "command"] as CatalogKind[]) {
      const name = sampleName(kind);
      const result = runCatalog(kit, opts({ kind, verb: "install", name }));
      expect(result.output).toContain(`installed ${name}`);
      expect(runCatalog(kit, opts({ kind, verb: "remove", name })).output).toContain(`removed ${name}`);
    }
  });
});

describe("the three commands stay one implementation", () => {
  it("registers a distinct command name per kind", () => {
    expect(Object.values(COMMAND_FOR_KIND).sort()).toEqual(["agents", "commands", "skills"]);
  });

  it("writes a manifest-free tree: install touches only the install surface", () => {
    // `install-surface.test.ts` proves the allowlist covers what a full install
    // plans; this proves the single-artifact path plans nothing outside it.
    const name = sampleName("skill");
    runCatalog(kit, opts({ verb: "install", name }));
    const top = readdirSync(cwd);
    expect(top).toEqual([".claude"]);
  });
});
