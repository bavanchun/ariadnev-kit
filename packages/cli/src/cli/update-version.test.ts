import { describe, it, expect } from "vitest";
import { isValidVersion, isPrerelease, versionQuery } from "./update-version.js";



/**
 * The beta channel is the existing `?version=` selector pointed at a prerelease
 * tag, not a new concept. Phase 11 priced a channel abstraction against this and
 * this won — but it only works if the parser accepts exactly the prerelease
 * shape the project publishes, and nothing else, since the value reaches a URL.
 */
describe("prerelease versions", () => {
  for (const good of ["2.0.0-beta.1", "0.1.0-beta.12", "10.20.30-beta.999"]) {
    it(`accepts ${good}`, () => {
      expect(isValidVersion(good)).toBe(true);
      expect(isPrerelease(good)).toBe(true);
    });
  }

  // Narrower than semver on purpose. Every one of these is legal semver and
  // none of them is a thing this project publishes.
  for (const bad of [
    "2.0.0-beta",
    "2.0.0-alpha.1",
    "2.0.0-rc.1",
    "2.0.0+build.1",
    "2.0.0-beta.1+build",
    "2.0.0-BETA.1",
    "2.0.0-beta.1 ",
    "2.0.0-beta.1\n",
    "2.0.0-beta.-1",
  ]) {
    it(`refuses ${JSON.stringify(bad)}`, () => {
      expect(isValidVersion(bad)).toBe(false);
    });
  }

  it("does not call a stable version a prerelease", () => {
    expect(isPrerelease("1.2.3")).toBe(false);
  });

  it("passes a prerelease through the selector unchanged", () => {
    expect(versionQuery("2.0.0-beta.1")).toBe("?version=2.0.0-beta.1");
  });
});
