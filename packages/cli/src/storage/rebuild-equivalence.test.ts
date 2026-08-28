import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { commandSurface } from "../cli/command-surface.js";
import { derivedRoot, removeDerived, removeStorageTree } from "./operational-paths.js";
import { casesOwed, DERIVED_CONSUMERS, INDEX_TOUCHING_COMMANDS, rebuildEquivalenceCases } from "./rebuild-equivalence.js";

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

const SRC = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function typescriptFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...typescriptFiles(path));
    else if (entry.endsWith(".ts")) found.push(path);
  }
  return found;
}

describe("every derived-state consumer is accounted for", () => {
  it("lets nothing reach a derived/ path without naming the command it belongs to", () => {
    // `INDEX_TOUCHING_COMMANDS` is a closed list and so cannot notice a command
    // nobody added to it. This can: writing derived state means importing one of
    // these helpers, and importing one means appearing here.
    const unregistered: string[] = [];
    for (const path of typescriptFiles(SRC)) {
      const relative = path.slice(SRC.length + 1).split("\\").join("/");
      if (relative.startsWith("storage/")) continue;
      // Tests are exempt because the obligation is a command's, not a file's: a
      // test that reaches for a derived path is asserting where state lives,
      // which is the opposite of quietly depending on it. Registering one in
      // `DERIVED_CONSUMERS` would mean naming a test as a command.
      if (relative.endsWith(".test.ts")) continue;
      // `contentRoot` is in this list because it is itself defined in terms of
      // `derivedPath`: a helper that wraps a derived path would otherwise let a
      // whole command reach derived state without matching the pattern, which
      // is precisely the silent gap this check exists to close.
      if (!/\b(?:derivedPath|derivedRoot|removeDerived|contentRoot)\b/.test(readFileSync(path, "utf8"))) continue;
      if (!(relative in DERIVED_CONSUMERS)) unregistered.push(relative);
    }
    expect(
      unregistered,
      "these reach for derived state without naming a command: add each to DERIVED_CONSUMERS, " +
        "and give that command a rebuild-equivalence case.",
    ).toEqual([]);
  });

  it("names only commands that owe a case", () => {
    for (const [file, command] of Object.entries(DERIVED_CONSUMERS)) {
      expect(INDEX_TOUCHING_COMMANDS, `${file} names ${command}, which is not index-touching`).toContain(command);
    }
  });
});
