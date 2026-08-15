import { describe, it, expect } from "vitest";
import { resolveConfig } from "./resolve-config.js";

describe("resolveConfig", () => {
  it("falls back to defaults when no layer supplies a value", () => {
    const { config, warnings } = resolveConfig({});
    expect(config.paths.plans).toBe("plans");
    expect(config.privacyBlock).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("lets the project layer win over the user layer for a project-overridable key", () => {
    const { config } = resolveConfig({
      user: { paths: { plans: "user-plans" }, docs: { maxLoc: 100 } },
      project: { paths: { plans: "repo-plans" } },
    });
    expect(config.paths.plans).toBe("repo-plans");
    expect(config.docs.maxLoc).toBe(100);
  });

  it("takes a user-only key from the user layer", () => {
    const { config } = resolveConfig({ user: { privacyBlock: false, trust: { enabled: true } } });
    expect(config.privacyBlock).toBe(false);
    expect(config.trust.enabled).toBe(true);
  });

  it("ignores a wrong-typed value, warns, and keeps resolving the rest", () => {
    const { config, warnings } = resolveConfig({
      user: { docs: { maxLoc: "lots" }, paths: { plans: "kept" } },
    });
    expect(config.docs.maxLoc).toBe(800);
    expect(config.paths.plans).toBe("kept");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("docs.maxLoc");
    expect(warnings[0]).toMatch(/integer/);
  });

  it("falls through to the next layer when the higher one is invalid", () => {
    const { config, warnings } = resolveConfig({
      user: { paths: { plans: "user-plans" } },
      project: { paths: { plans: 7 } },
    });
    expect(config.paths.plans).toBe("user-plans");
    expect(warnings[0]).toContain("project");
  });

  it("rejects an enum value outside the declared set", () => {
    const { config, warnings } = resolveConfig({ user: { scripts: { executionPolicy: "yolo" } } });
    expect(config.scripts.executionPolicy).toBe("allow");
    expect(warnings[0]).toContain("executionPolicy");
  });

  it("accepts only allowlisted hosts for a notification destination", () => {
    const ok = resolveConfig({
      user: { notifications: { discordWebhook: "https://discord.com/api/webhooks/1/t" } },
    });
    expect(ok.config.notifications.discordWebhook).toBe("https://discord.com/api/webhooks/1/t");
    expect(ok.warnings).toEqual([]);

    const evil = resolveConfig({ user: { notifications: { discordWebhook: "https://evil.example/hook" } } });
    expect(evil.config.notifications.discordWebhook).toBeNull();
    expect(evil.warnings[0]).toMatch(/host/i);
    // The rejected destination must not be echoed back in the warning.
    expect(evil.warnings[0]).not.toContain("evil.example/hook");
  });

  it("rejects a lookalike host that merely ends with an allowed domain", () => {
    const { config } = resolveConfig({
      user: { notifications: { slackWebhook: "https://hooks.slack.com.evil.test/x" } },
    });
    expect(config.notifications.slackWebhook).toBeNull();
  });

  it("accepts a subdomain of an allowlisted domain", () => {
    const { config } = resolveConfig({
      user: { notifications: { slackWebhook: "https://hooks.slack.com/services/A/B/C" } },
    });
    expect(config.notifications.slackWebhook).toBe("https://hooks.slack.com/services/A/B/C");
  });

  it("requires https for a notification destination", () => {
    const { config, warnings } = resolveConfig({
      user: { notifications: { discordWebhook: "http://discord.com/api/webhooks/1/t" } },
    });
    expect(config.notifications.discordWebhook).toBeNull();
    expect(warnings).toHaveLength(1);
  });

  it("validates array element types rather than accepting any array", () => {
    const { config, warnings } = resolveConfig({ user: { assertions: ["fine", 3] } });
    expect(config.assertions).toEqual([]);
    expect(warnings[0]).toContain("assertions");
  });

  it("treats null as a value, not as absence, where null is not allowed", () => {
    // `null` in a config file is a deliberate write. Silently reading it as
    // "unset" would make a user think they cleared a setting when they did not.
    const { config, warnings } = resolveConfig({ user: { privacyBlock: null } });
    expect(config.privacyBlock).toBe(true);
    expect(warnings[0]).toContain("privacyBlock");
    // A field that does allow null accepts it without complaint.
    const nullable = resolveConfig({ user: { locale: { thinkingLanguage: null } } });
    expect(nullable.config.locale.thinkingLanguage).toBeNull();
    expect(nullable.warnings).toEqual([]);
  });

  it("rejects a non-array where a list is expected, and an unparseable destination", () => {
    expect(resolveConfig({ user: { assertions: "one instruction" } }).warnings[0]).toContain("assertions");
    const bad = resolveConfig({ user: { notifications: { slackWebhook: "not a url" } } });
    expect(bad.config.notifications.slackWebhook).toBeNull();
    expect(bad.warnings).toHaveLength(1);
  });

  it("never lets a project layer decide a user-only key, even unfiltered", () => {
    // resolveConfig is the last line of defense: filtering happens upstream, but
    // a caller that forgets must not be able to hand a project file the keys
    // that exist to protect the user.
    const { config } = resolveConfig({ project: { privacyBlock: false } });
    expect(config.privacyBlock).toBe(true);
  });
});
