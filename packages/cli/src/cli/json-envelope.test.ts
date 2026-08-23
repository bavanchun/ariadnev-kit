import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { jsonEnvelope, LEGACY_JSON_COMMANDS } from "./json-envelope.js";

const CLI_DIR = join(process.cwd(), "packages/cli/src/cli");

describe("jsonEnvelope", () => {
  it("emits the shape the five extracted commands already emitted", () => {
    expect(jsonEnvelope(1, "plan.list", { plans: [] })).toBe(
      JSON.stringify({ schema_version: 1, kind: "plan.list", data: { plans: [] } }, null, 2),
    );
  });

  it("keeps the version per command rather than sharing one number", () => {
    expect(JSON.parse(jsonEnvelope(3, "x.y", null)).schema_version).toBe(3);
  });
});

describe("the legacy JSON list", () => {
  /**
   * The point of writing an exception down is that adding to it takes a
   * deliberate edit. A command that quietly starts emitting its own shape
   * instead of the envelope is the drift this list exists to make visible, and
   * an unpinned list cannot do that.
   */
  it("is exactly the five commands whose shape predates the envelope", () => {
    expect([...LEGACY_JSON_COMMANDS]).toEqual(["contract", "audit", "config", "run", "eval"]);
  });

  /**
   * `validate` sat on an earlier draft of this list. It emits no JSON at all,
   * so it has no shape to be grandfathered — it is a surface still to be added,
   * and listing it would have permanently exempted it from the envelope it has
   * never used.
   */
  it("does not include validate, which emits no JSON to preserve", () => {
    expect(LEGACY_JSON_COMMANDS).not.toContain("validate");
    const quality = readFileSync(join(CLI_DIR, "register-quality-commands.ts"), "utf8");
    const block = quality.slice(quality.indexOf('.command("validate")'), quality.indexOf('.command("audit")'));
    expect(block).not.toContain("--json");
  });

  /**
   * No sixth private copy. The five that had one now import the helper, and a
   * new command writing `schema_version` by hand is how a sixth starts.
   */
  it("leaves no hand-written schema_version literal outside the helper", () => {
    const offenders = readdirSync(CLI_DIR)
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && name !== "json-envelope.ts")
      .filter((name) => readFileSync(join(CLI_DIR, name), "utf8").includes("schema_version:"));
    expect(offenders, "use jsonEnvelope() instead of writing schema_version by hand").toEqual([]);
  });
});
