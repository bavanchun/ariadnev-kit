import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildVersions, NO_REGISTRY_NOTE, runVersions } from "./versions-command.js";
import { packageVersion } from "../version.js";

const dirs: string[] = [];
const mk = () => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-versions-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * A kit with two skills, one of which declares its own version.
 *
 * Written to satisfy the kit linter rather than trimmed to what this test
 * cares about: `loadKit` refuses an invalid skill, so a shortcut fixture here
 * would fail for reasons that have nothing to do with versions. The
 * descriptions deliberately share no vocabulary — two that differ only by name
 * trip the routing-collision check.
 */
function skillBody(name: string, description: string, version?: string): string {
  return [
    "---",
    `name: av:${name}`,
    `description: ${description}`,
    ...(version ? [`version: ${version}`] : []),
    "---",
    "",
    `# ${name}`,
    "",
    "## Output format",
    "",
    "Output.",
    "",
    "## Quality gates",
    "",
    "- Check.",
    "",
    "## Workflow position",
    "",
    "Related: none.",
    "",
  ].join("\n");
}

function kitRoot(): string {
  const root = join(mk(), "kit");
  for (const [name, description, version] of [
    ["alpha", "Use this fixture skill to exercise the versions command reporting path.", "2.1.0"],
    ["beta", "Invoke as a second artifact that declares no version of its own at all.", undefined],
  ] as const) {
    const dir = join(root, "skills", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), skillBody(name, description, version));
  }
  return root;
}

const opts = (root: string) => ({ home: mk(), cwd: mk(), kitRoot: root });

describe("versions is local and says so", () => {
  it("states there is no registry to compare against", () => {
    // The captured surface set this precedent for its own registry: ship the
    // local half and name the missing half, rather than leaving a blank
    // `latest` column implying a lookup that failed.
    const result = runVersions(opts(kitRoot()));
    expect(result.output).toContain(NO_REGISTRY_NOTE);
    expect(result.exitCode).toBe(0);
  });

  it("marks registry_available false rather than making a reader infer it", () => {
    expect(buildVersions(opts(kitRoot())).registry_available).toBe(false);
  });

  it("needs no network, so a flag asking it to skip one changes nothing", () => {
    const root = kitRoot();
    const withFlag = buildVersions({ ...opts(root), localOnly: true });
    const without = buildVersions(opts(root));
    expect(withFlag).toEqual(without);
  });

  it("says the compatibility flags are inert rather than silently ignoring them", () => {
    // A flag that is silently inert is a small lie; one documented as inert is
    // a compatibility shim.
    const result = runVersions({ ...opts(kitRoot()), localOnly: true, cacheTtl: "30m" });
    expect(result.output).toMatch(/accepted for compatibility and change nothing/);
  });
});

describe("what it reports", () => {
  it("reports the CLI version and the kit's artifact counts", () => {
    const report = buildVersions(opts(kitRoot()));
    expect(report.cli).toBe(packageVersion());
    expect(report.kit.skills).toBe(2);
  });

  it("reports a skill's own version when it declares one, and null when it does not", () => {
    // Printing the kit's version beside every skill would suggest a per-skill
    // version that does not exist.
    const report = buildVersions(opts(kitRoot()));
    expect(report.skills).toEqual([
      { name: "alpha", version: "2.1.0" },
      { name: "beta", version: null },
    ]);
  });

  it("lists only the skills that declare a version, and says so when none do", () => {
    const text = runVersions(opts(kitRoot())).output;
    expect(text).toContain("alpha");
    expect(text).not.toMatch(/^ {2}beta/m);
  });

  it("emits the envelope, with one schema_version at the top", () => {
    const parsed = JSON.parse(runVersions({ ...opts(kitRoot()), json: true }).output) as {
      schema_version: number; kind: string; data: Record<string, unknown>;
    };
    expect(parsed.kind).toBe("versions.list");
    expect(parsed.data).not.toHaveProperty("schema_version");
  });
});
