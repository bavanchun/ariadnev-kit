import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadKit } from "./load-kit.js";

interface Claim {
  id: string;
  text: string;
  status: "covered" | "rejected" | "unclassified";
  why?: string;
}

interface RegistryEntry {
  upstream: string;
  upstream_version: string;
  upstream_digest: string;
  upstream_relation: "distill" | "fork" | "none";
  pinned_at: string;
  claims?: Claim[];
}

interface Registry {
  schema_version: number;
  skills: Record<string, RegistryEntry>;
}

const here = dirname(fileURLToPath(import.meta.url));
const kitRoot = join(here, "..", "..", "..", "..", "kit");
const registry = JSON.parse(
  readFileSync(join(kitRoot, "distill-decisions.json"), "utf8"),
) as Registry;
const tracked = new Set([
  "bootstrap",
  "code-review",
  "docs-seeker",
  "fix",
  "plan",
  "problem-solving",
  "sequential-thinking",
  "skill-creator",
]);

describe("distill-decisions registry", () => {
  it("uses schema v1 and exactly mirrors the kit inventory", () => {
    const skillNames = loadKit(kitRoot).skills.map((skill) => skill.name).sort();
    expect(registry.schema_version).toBe(1);
    expect(Object.keys(registry.skills).sort()).toEqual(skillNames);
  });

  it("matches every skill's provenance metadata", () => {
    for (const skill of loadKit(kitRoot).skills) {
      const metadata = skill.frontmatter.metadata as Record<string, unknown>;
      const entry = registry.skills[skill.name];
      expect(entry, skill.name).toBeDefined();
      for (const field of [
        "upstream",
        "upstream_version",
        "upstream_digest",
        "upstream_relation",
      ] as const) {
        expect(entry[field], `${skill.name}.${field}`).toBe(metadata[field]);
        expect(typeof entry[field], `${skill.name}.${field}`).toBe("string");
      }
      expect(entry.pinned_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("tracks claims for exactly the eight reshape targets", () => {
    const withClaims = Object.entries(registry.skills)
      .filter(([, entry]) => entry.claims !== undefined)
      .map(([name]) => name);
    expect(new Set(withClaims)).toEqual(tracked);

    for (const name of withClaims) {
      const claims = registry.skills[name].claims ?? [];
      expect(claims.length, name).toBeGreaterThan(0);
      expect(claims.map((claim) => claim.id)).toEqual(
        claims.map((_, index) => `c${String(index + 1).padStart(3, "0")}`),
      );
      expect(new Set(claims.map((claim) => claim.text)).size).toBe(claims.length);
      for (const claim of claims) {
        expect(["covered", "rejected", "unclassified"]).toContain(claim.status);
        if (claim.status === "rejected") expect(claim.why?.trim()).toBeTruthy();
      }
    }
  });
});
