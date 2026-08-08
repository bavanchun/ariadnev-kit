import { describe, expect, it } from "vitest";
import { categoricalToken } from "./categorical-token.js";

describe("categoricalToken", () => {
  it("rejects opaque and password-shaped values as defense in depth", () => {
    for (const value of [
      `secret.${"a".repeat(32)}`,
      `token.${"a".repeat(32)}.${"b".repeat(32)}`,
      "password.supersecret123",
    ]) {
      expect(() => categoricalToken(value, "probe")).toThrow(/sensitive/i);
    }
  });

  it("keeps low-entropy policy categories valid", () => {
    expect(categoricalToken("secret.commit", "action")).toBe("secret.commit");
    expect(categoricalToken("external.github", "capability")).toBe("external.github");
  });
});
