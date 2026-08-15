import { describe, it, expect } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONFIG_FIELDS,
  defaults,
  redactConfig,
  specFor,
  USER_ONLY_PATHS,
  type Layer,
} from "./config-schema.js";

describe("config schema", () => {
  it("gives every field a layer, a default, and a description", () => {
    expect(CONFIG_FIELDS.length).toBeGreaterThan(10);
    for (const { path, spec } of CONFIG_FIELDS) {
      expect(["project", "user"] satisfies Layer[]).toContain(spec.layer);
      expect(spec.default, `${path} has no default`).not.toBeUndefined();
      expect(spec.describe.length, `${path} is undocumented`).toBeGreaterThan(10);
    }
  });

  it("classifies the security-relevant keys as user-only", () => {
    // These are the keys a hostile project file must never be able to set:
    // turning off privacy blocking, granting trust, redirecting notifications,
    // or loosening script execution.
    for (const path of [
      "privacyBlock",
      "trust.enabled",
      "assertions",
      "scripts.executionPolicy",
      "notifications.enabled",
      "notifications.discordWebhook",
      "notifications.slackWebhook",
      "notifications.telegramBotToken",
      "notifications.telegramChatId",
    ]) {
      expect(specFor(path)?.layer, `${path} must be user-only`).toBe("user");
      expect(USER_ONLY_PATHS).toContain(path);
    }
  });

  it("keeps workspace-shaped keys project-overridable", () => {
    for (const path of ["paths.docs", "paths.plans", "docs.maxLoc", "plan.reportsDir", "statusline.mode"]) {
      expect(specFor(path)?.layer, `${path} should be project-overridable`).toBe("project");
    }
  });

  it("has no trust.passphrase — a plaintext secret in a printable file", () => {
    expect(specFor("trust.passphrase")).toBeUndefined();
    expect(CONFIG_FIELDS.some((f) => /passphrase|password|secret$/i.test(f.path))).toBe(false);
  });

  it("does not port the Tier-3 config branches", () => {
    for (const dropped of ["watch", "content", "gemini"]) {
      expect(CONFIG_FIELDS.some((f) => f.path.startsWith(`${dropped}.`))).toBe(false);
    }
  });

  it("builds defaults as a nested object matching the declared shape", () => {
    const d = defaults();
    expect(d.privacyBlock).toBe(true);
    expect(d.trust.enabled).toBe(false);
    expect(d.paths.plans).toBe("plans");
    expect(d.docs.maxLoc).toBe(800);
    expect(d.assertions).toEqual([]);
    expect(d.notifications.discordWebhook).toBeNull();
  });

  it("marks notification destinations sensitive and redacts them", () => {
    const config = defaults();
    config.notifications.discordWebhook = "https://discord.com/api/webhooks/1/tok";
    config.notifications.telegramBotToken = "12345:secret";
    const shown = redactConfig(config);
    expect(JSON.stringify(shown)).not.toContain("tok");
    expect(JSON.stringify(shown)).not.toContain("12345:secret");
    expect(shown.notifications.discordWebhook).toBe("<redacted>");
    // A destination that is unset stays visibly unset rather than looking set.
    expect(shown.notifications.slackWebhook).toBeNull();
    // Redaction must not disturb the non-sensitive fields.
    expect(shown.paths.docs).toBe("docs");
  });
});

describe("per-hook switches", () => {
  const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..", "..");

  it("has exactly one switch per shipped hook", () => {
    // Two ways to drift: a hook with no switch (the setting is silently
    // ignored) and a switch with no hook (a setting that does nothing). Both
    // fail here.
    const shipped = readdirSync(join(repoRoot, "kit", "hooks"))
      .filter((entry) => existsSync(join(repoRoot, "kit", "hooks", entry, "hook.json")))
      .sort();
    const declared = CONFIG_FIELDS.filter((f) => f.path.startsWith("hooks."))
      .map((f) => f.path.slice("hooks.".length))
      .sort();
    expect(declared).toEqual(shipped);
  });

  it("keeps the switches user-only, so a project file cannot disable a guard", () => {
    for (const field of CONFIG_FIELDS.filter((f) => f.path.startsWith("hooks."))) {
      expect(field.spec.layer, field.path).toBe("user");
      expect(field.spec.default, `${field.path} should ship enabled`).toBe(true);
    }
  });
});
