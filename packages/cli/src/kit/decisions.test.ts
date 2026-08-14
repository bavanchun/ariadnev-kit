import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseRegistry } from "./registry.js";
import { loadKit } from "./load-kit.js";

const here = dirname(fileURLToPath(import.meta.url));
const kitRoot = join(here, "..", "..", "..", "..", "kit");
const registry = parseRegistry(
  readFileSync(join(kitRoot, "decisions.json"), "utf8"),
);
// Every skill must eventually carry an adjudicated `claims[]` ledger. This
// is a ratchet: skills without claims must be listed in WAVE0_PENDING;
// adjudicating a skill requires removing it from PENDING in the same
// commit, and re-adding it would be visible in review. Once WAVE0_PENDING
// is empty, the initial ledger side is complete. Later waves ship new
// entries with claims at creation, so the invariant holds program-wide
// with no further test edits.
const WAVE0_PENDING = new Set<string>(["obsidian-second-brain-note"]);

describe("decisions registry", () => {
  it("uses schema v1 and exactly mirrors the kit inventory", () => {
    const skillNames = loadKit(kitRoot).skills.map((skill) => skill.name).sort();
    expect(registry.schema_version).toBe(1);
    expect(Object.keys(registry.skills).sort()).toEqual(skillNames);
  });

  it("every skill has claims or is in WAVE0_PENDING (ratchet)", () => {
    const mapped = Object.entries(registry.skills);
    const withClaims = mapped
      .filter(([, entry]) => entry.claims !== undefined && (entry.claims ?? []).length > 0)
      .map(([name]) => name);
    const withoutClaims = mapped
      .filter(([, entry]) => entry.claims === undefined || (entry.claims ?? []).length === 0)
      .map(([name]) => name);

    // Invariant 1: every skill either has claims or is pending.
    for (const name of withoutClaims) {
      expect(WAVE0_PENDING.has(name), `${name} lacks claims and is not in WAVE0_PENDING`).toBe(true);
    }

    // Invariant 2: WAVE0_PENDING can't go stale — a skill can never
    // silently lose its ledger without being visibly re-added to PENDING.
    for (const name of withClaims) {
      expect(WAVE0_PENDING.has(name), `${name} has claims but is still in WAVE0_PENDING (remove it)`).toBe(false);
    }

    // Per-entry structural invariants (unchanged from prior contract).
    for (const name of withClaims) {
      const claims = registry.skills[name].claims ?? [];
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

  it("every rejection's `why` starts with a legal prefix ontology", () => {
    // Without this test, `routed: vc:<self> itself` (Goodhart bait,
    // banned) and free-form rationales (uncounted by the fidelity
    // formula) can re-enter the ledger silently.
    //
    // Legal prefixes:
    //   • `routed: vc:<other> — …`          (real cross-skill route)
    //   • `routed: hosting agent — …`       (harness/agent-owned)
    //   • `compacted: …`                    (design simplification)
    //   • `out-of-scope: …`                 (outcome deliberately excluded)
    //   • `dropped: …`                      (truly abandoned; hurts fidelity)
    //   • `fragment/heading only — …`       (pure extraction fragment)
    // Routed destinations may be a single skill (`routed: vc:test — …`),
    // the hosting agent (`routed: hosting agent — …`), or a compound
    // target (`routed: vc:docs / vc:plan — …` when the same capability
    // is legitimately covered by more than one vc skill).
    const LEGAL = [
      /^routed: (vc:[a-z-]+|hosting agent)( ?[+/] ?(vc:[a-z-]+|hosting agent))* — /,
      /^compacted: /,
      /^out-of-scope: /,
      /^dropped: /,
      /^fragment\/heading only/,
    ];
    // `routed: vc:<self> itself` is Goodhart bait — explicitly banned.
    const BANNED = /routed: vc:[a-z-]+ itself/;

    const violations: string[] = [];
    for (const [skillName, entry] of Object.entries(registry.skills)) {
      for (const claim of entry.claims ?? []) {
        if (claim.status !== "rejected") continue;
        const why = claim.why ?? "";
        if (BANNED.test(why)) {
          violations.push(`${skillName}.${claim.id} carries banned routed-to-self prefix`);
          continue;
        }
        if (!LEGAL.some((rx) => rx.test(why))) {
          violations.push(`${skillName}.${claim.id} missing legal prefix: ${why.slice(0, 80)}`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
