import { describe, it, expect } from "vitest";
import { loadConfig, projectConfigPath, userConfigPath, type LoadDeps } from "./load-config.js";

const HOME = "/home/u";
const CWD = "/repo";

function deps(files: Record<string, string>): LoadDeps {
  return { readFile: (path) => files[path] ?? null };
}

describe("loadConfig", () => {
  it("puts both layers under the .ariadnev dir the rest of the CLI already owns", () => {
    expect(userConfigPath(HOME).endsWith("/.ariadnev/config.json")).toBe(true);
    expect(projectConfigPath(CWD).startsWith(CWD)).toBe(true);
  });

  it("returns defaults with no warnings when neither file exists", () => {
    const { config, warnings, sources } = loadConfig({ home: HOME, cwd: CWD }, deps({}));
    expect(config.privacyBlock).toBe(true);
    expect(warnings).toEqual([]);
    expect(sources).toEqual({ user: null, project: null });
  });

  it("merges both layers and reports which files were read", () => {
    const files = {
      [userConfigPath(HOME)]: JSON.stringify({ privacyBlock: false, paths: { plans: "user-plans" } }),
      [projectConfigPath(CWD)]: JSON.stringify({ paths: { plans: "repo-plans" } }),
    };
    const { config, sources } = loadConfig({ home: HOME, cwd: CWD }, deps(files));
    expect(config.privacyBlock).toBe(false);
    expect(config.paths.plans).toBe("repo-plans");
    expect(sources).toEqual({ user: userConfigPath(HOME), project: projectConfigPath(CWD) });
  });

  it("refuses a user-only key set by the project file and says where it came from", () => {
    const files = { [projectConfigPath(CWD)]: JSON.stringify({ privacyBlock: false, trust: { enabled: true } }) };
    const { config, warnings } = loadConfig({ home: HOME, cwd: CWD }, deps(files));
    expect(config.privacyBlock).toBe(true);
    expect(config.trust.enabled).toBe(false);
    expect(warnings.join("\n")).toContain(projectConfigPath(CWD));
    expect(warnings.some((w) => w.includes("privacyBlock"))).toBe(true);
  });

  it("survives malformed JSON with defaults and a warning naming the file", () => {
    const files = { [userConfigPath(HOME)]: "{ not json" };
    const { config, warnings } = loadConfig({ home: HOME, cwd: CWD }, deps(files));
    expect(config.privacyBlock).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(userConfigPath(HOME));
  });

  it("reports an unknown key in the user file without discarding the valid ones", () => {
    const files = { [userConfigPath(HOME)]: JSON.stringify({ nope: 1, paths: { docs: "kept" } }) };
    const { config, warnings } = loadConfig({ home: HOME, cwd: CWD }, deps(files));
    expect(config.paths.docs).toBe("kept");
    expect(warnings.some((w) => w.includes("nope"))).toBe(true);
  });

  it("keeps a wrong-typed value from costing the user the rest of the file", () => {
    const files = { [userConfigPath(HOME)]: JSON.stringify({ docs: { maxLoc: "many" }, paths: { docs: "kept" } }) };
    const { config, warnings } = loadConfig({ home: HOME, cwd: CWD }, deps(files));
    expect(config.docs.maxLoc).toBe(800);
    expect(config.paths.docs).toBe("kept");
    expect(warnings.some((w) => w.includes("docs.maxLoc"))).toBe(true);
  });

  it("never throws when a file cannot be read at all", () => {
    const throwing: LoadDeps = {
      readFile: () => {
        throw new Error("EACCES");
      },
    };
    expect(() => loadConfig({ home: HOME, cwd: CWD }, throwing)).not.toThrow();
    expect(loadConfig({ home: HOME, cwd: CWD }, throwing).config.privacyBlock).toBe(true);
  });
});
