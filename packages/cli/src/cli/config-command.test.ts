import { describe, it, expect } from "vitest";
import { runConfigResolve } from "./config-command.js";
import { userConfigPath, type LoadDeps } from "../config/load-config.js";

const HOME = "/home/u";
const CWD = "/repo";

function deps(files: Record<string, string>): LoadDeps {
  return { readFile: (path) => files[path] ?? null };
}

describe("ariadnev config prefs resolve", () => {
  it("prints every resolved setting with its source layer", () => {
    const { output, exitCode } = runConfigResolve({ home: HOME, cwd: CWD }, deps({}));
    expect(exitCode).toBe(0);
    expect(output).toContain("privacyBlock");
    expect(output).toContain("paths.plans");
  });

  it("emits a stable JSON envelope for machine consumers", () => {
    const { output } = runConfigResolve({ home: HOME, cwd: CWD, json: true }, deps({}));
    const parsed = JSON.parse(output);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.config.paths.plans).toBe("plans");
    expect(parsed.sources).toEqual({ user: null, project: null });
    expect(parsed.warnings).toEqual([]);
  });

  it("never prints a notification secret, in either output mode", () => {
    const secret = "https://discord.com/api/webhooks/42/super-secret-token";
    const files = {
      [userConfigPath(HOME)]: JSON.stringify({
        notifications: { enabled: true, discordWebhook: secret, telegramBotToken: "9:tok" },
      }),
    };
    for (const json of [false, true]) {
      const { output } = runConfigResolve({ home: HOME, cwd: CWD, json }, deps(files));
      expect(output).not.toContain("super-secret-token");
      expect(output).not.toContain("9:tok");
      expect(output).toContain("<redacted>");
    }
    // Redaction is display-only: the destination is still configured.
    const { output } = runConfigResolve({ home: HOME, cwd: CWD, json: true }, deps(files));
    expect(JSON.parse(output).config.notifications.enabled).toBe(true);
  });

  it("surfaces the warnings from loading rather than swallowing them", () => {
    const files = { [userConfigPath(HOME)]: "{ broken" };
    const human = runConfigResolve({ home: HOME, cwd: CWD }, deps(files));
    expect(human.output).toMatch(/warning/i);
    expect(human.exitCode).toBe(0);
    const machine = JSON.parse(runConfigResolve({ home: HOME, cwd: CWD, json: true }, deps(files)).output);
    expect(machine.warnings).toHaveLength(1);
  });
});
