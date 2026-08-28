import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runSetup, SETUP_STEPS, SETUP_STEP_NAMES, setupWritablePaths } from "./setup-command.js";
import { CONFIG_FIELDS, specFor } from "../config/config-schema.js";
import { projectConfigPath, userConfigPath } from "../config/load-config.js";

const dirs: string[] = [];
const mk = () => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-setup-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function sandbox() {
  const root = mk();
  const home = join(root, "home");
  const cwd = join(root, "proj");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  return { home, cwd };
}

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;

describe("setup writes no auth material", () => {
  it("offers no step that touches a field the schema marks sensitive", () => {
    // The captured surface has three credential steps and an --advanced mode
    // for provider keys. None are ported, and this is what keeps that true as
    // steps get added: it reads the schema's own marks rather than a list of
    // names someone has to remember to update.
    const sensitive = setupWritablePaths().filter((path) => specFor(path)?.sensitive);
    expect(sensitive).toEqual([]);
  });

  it("refuses a sensitive path even when one is handed to it directly", () => {
    // Not reachable through a step today. The check exists so that a step which
    // one day includes such a field fails here instead of shipping.
    const { home, cwd } = sandbox();
    const secret = CONFIG_FIELDS.find((field) => field.spec.sensitive)!.path;
    expect(() => runSetup({ home, cwd, values: { [secret]: "x" } })).toThrow(/not part of the selected step/);
  });

  it("has at least one sensitive field in the schema, or the guard proves nothing", () => {
    expect(CONFIG_FIELDS.some((field) => field.spec.sensitive)).toBe(true);
  });
});

describe("--no-interactive --config", () => {
  it("writes config without a TTY", () => {
    const { home, cwd } = sandbox();
    const file = join(cwd, "answers.json");
    writeFileSync(file, JSON.stringify({ "paths.docs": "documentation", "statusline.mode": "compact" }));

    runSetup({ home, cwd, interactive: false, configFile: file });

    expect(readJson(projectConfigPath(cwd))).toMatchObject({
      paths: { docs: "documentation" },
      statusline: { mode: "compact" },
    });
  });

  it("refuses to run with no values rather than writing defaults nobody chose", () => {
    const { home, cwd } = sandbox();
    expect(() => runSetup({ home, cwd, interactive: false })).toThrow(/needs values/);
  });

  it("fails on a config file that is not there", () => {
    const { home, cwd } = sandbox();
    expect(() => runSetup({ home, cwd, interactive: false, configFile: join(cwd, "nope.json") }))
      .toThrow(/no such config file/);
  });
});

describe("routing values to the right layer", () => {
  it("sends user-only fields to the user config and project fields to the project one", () => {
    const { home, cwd } = sandbox();
    runSetup({ home, cwd, values: { privacyBlock: false, "paths.plans": "roadmaps" } });

    expect(readJson(userConfigPath(home))).toMatchObject({ privacyBlock: false });
    expect(readJson(projectConfigPath(cwd))).toMatchObject({ paths: { plans: "roadmaps" } });
  });

  it("writes the user config 0600", () => {
    const { home, cwd } = sandbox();
    runSetup({ home, cwd, values: { privacyBlock: false } });
    if (process.platform !== "win32") {
      expect(statSync(userConfigPath(home)).mode & 0o777).toBe(0o600);
    }
  });

  it("merges into an existing config instead of replacing it", () => {
    const { home, cwd } = sandbox();
    runSetup({ home, cwd, values: { "paths.docs": "documentation" } });
    runSetup({ home, cwd, values: { "paths.plans": "roadmaps" } });
    expect(readJson(projectConfigPath(cwd))).toMatchObject({ paths: { docs: "documentation", plans: "roadmaps" } });
  });
});

describe("--step", () => {
  it("limits what may be written, naming a path outside the selection", () => {
    // Silently dropping an out-of-scope path leaves the user believing they
    // configured something they did not.
    const { home, cwd } = sandbox();
    expect(() => runSetup({ home, cwd, steps: ["statusline"], values: { "paths.docs": "documentation" } }))
      .toThrow(/not part of the selected step/);
  });

  it("rejects an unknown step by name, and lists the real ones", () => {
    const { home, cwd } = sandbox();
    expect(() => runSetup({ home, cwd, steps: ["anthropic_api_key"] }))
      .toThrow(/unknown --step value\(s\): anthropic_api_key/);
  });

  it("covers only paths the schema actually defines", () => {
    // A step naming a config key nothing resolves would produce a wizard that
    // writes settings no consumer reads.
    for (const path of setupWritablePaths()) {
      expect(specFor(path), path).toBeDefined();
    }
    expect(SETUP_STEP_NAMES.length).toBe(Object.keys(SETUP_STEPS).length);
  });
});

describe("validation", () => {
  it("rejects a value outside a closed set", () => {
    const { home, cwd } = sandbox();
    expect(() => runSetup({ home, cwd, values: { "statusline.mode": "off" } })).toThrow(/must be one of/);
  });

  it("rejects a value of the wrong type", () => {
    const { home, cwd } = sandbox();
    expect(() => runSetup({ home, cwd, values: { "docs.maxLoc": "many" } })).toThrow(/expects integer/);
  });

  it("rejects null for a field that is not nullable", () => {
    const { home, cwd } = sandbox();
    expect(() => runSetup({ home, cwd, values: { "paths.docs": null } })).toThrow(/cannot be null/);
  });

  it("accepts null for a field that is", () => {
    const { home, cwd } = sandbox();
    runSetup({ home, cwd, values: { "locale.responseLanguage": null } });
    expect(readJson(projectConfigPath(cwd))).toMatchObject({ locale: { responseLanguage: null } });
  });
});
