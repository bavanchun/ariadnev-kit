import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { storageConformanceCases, type ConformanceContext } from "./conformance-cases.js";
import { nodeDriver } from "./driver-node.js";
import { selectDriver, runningUnderBun } from "./select-driver.js";

// The Bun half of this suite runs from `scripts/run-storage-conformance.ts`,
// which CI invokes with `bun`. Anything asserted here is asserted there.
describe("storage conformance (node:sqlite)", () => {
  let root: string;
  let context: ConformanceContext;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "ariadnev-storage-"));
    context = {
      open: (path) => nodeDriver.open(path),
      tempFile: (name) => join(root, name),
    };
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  for (const conformanceCase of storageConformanceCases) {
    it(conformanceCase.name, () => {
      conformanceCase.run(context);
    });
  }

  it("covers every case the Bun runner will", () => {
    // A case list that shrinks silently would let one runtime pass a suite the
    // other never ran. The count is the cheapest thing that notices.
    expect(storageConformanceCases.length).toBeGreaterThanOrEqual(12);
    expect(new Set(storageConformanceCases.map((c) => c.name)).size).toBe(storageConformanceCases.length);
  });
});

describe("driver selection", () => {
  it("picks node when the Bun global is absent", () => {
    expect(runningUnderBun({} as typeof globalThis)).toBe(false);
    expect(selectDriver({} as typeof globalThis).name).toBe("node");
  });

  it("picks bun when the Bun global is present", () => {
    const global = { Bun: {} } as unknown as typeof globalThis;
    expect(runningUnderBun(global)).toBe(true);
    expect(selectDriver(global).name).toBe("bun");
  });

  it("agrees with the runtime it is actually running on", () => {
    // vitest runs under Node, so this is the assertion that would catch a
    // selector inverted in a refactor.
    expect(selectDriver().name).toBe("node");
  });
});
