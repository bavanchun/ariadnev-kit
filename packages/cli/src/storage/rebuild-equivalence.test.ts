import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commandSurface } from "../cli/command-surface.js";
import { derivedRoot, removeDerived, removeStorageTree } from "./operational-paths.js";
import { casesOwed, INDEX_TOUCHING_COMMANDS, rebuildEquivalenceCases } from "./rebuild-equivalence.js";

/** The round trip ADR 0014 asserts: seed, build, delete, rebuild, compare. */
function surviveDeletion(home: string, entry: (typeof rebuildEquivalenceCases)[number]): { before: unknown; after: unknown } {
  entry.seed(home);
  entry.rebuild(home);
  const before = entry.observe(home);
  removeDerived(home);
  expect(existsSync(derivedRoot(home)), `${entry.command} keeps state outside derived/`).toBe(false);
  entry.rebuild(home);
  return { before, after: entry.observe(home) };
}

describe("rebuild equivalence", () => {
  for (const entry of rebuildEquivalenceCases) {
    it(`${entry.command}: ${entry.note}`, () => {
      const home = mkdtempSync(join(tmpdir(), "ariadnev-rebuild-"));
      try {
        const { before, after } = surviveDeletion(home, entry);
        expect(after).toEqual(before);
      } finally {
        removeStorageTree(home);
      }
    });
  }

  it("has a case for every index-touching command that exists", () => {
    // Empty today because none of them are registered yet. The phase that
    // registers one turns this red until it supplies the case — which is the
    // only reason to write the invariant before its first consumer.
    const registered = [...commandSurface().subcommands.keys()];
    const owed = casesOwed(registered);
    expect(
      owed,
      `registered but with no rebuild-equivalence case: ${owed.join(", ")}. ` +
        "Add the case in the same commit that registers the command.",
    ).toEqual([]);
  });

  it("names the commands that will owe a case", () => {
    // A list that quietly emptied would make the check above vacuous forever.
    expect([...INDEX_TOUCHING_COMMANDS]).toEqual(["analytics", "content-search", "data"]);
  });
});
