import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { jsonEnvelope, LEGACY_JSON_COMMANDS } from "./json-envelope.js";
import { buildProgram } from "../index.js";
import type { Command } from "commander";
import { runList } from "./list-command.js";
import { runValidate } from "./validate-command.js";
import { runTelemetryStatus } from "./telemetry-command.js";
import { runQuery } from "./query-command.js";
import { resolveKitRoot } from "../kit/load-kit.js";

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
    expect([...LEGACY_JSON_COMMANDS]).toEqual(["contract", "audit", "config", "workflow", "eval"]);
  });

  /**
   * The harness was renamed from `run` to `workflow`, and its carve-out moved
   * with it. `run` now fronts skill dispatch — new surface, which gets the
   * shared envelope. Had the old name stayed on this list, dispatch would have
   * inherited a frozen JSON shape nobody ever granted it, and nothing else in
   * the tree would have failed to say so.
   */
  it("exempts the harness and not the name it used to have", () => {
    expect(LEGACY_JSON_COMMANDS).toContain("workflow");
    expect(LEGACY_JSON_COMMANDS).not.toContain("run");
  });

  /**
   * `validate` sat on an earlier draft of this list. It emitted no JSON at all,
   * so it had no shape to be grandfathered — listing it would have permanently
   * exempted it from an envelope it had never used. It emits one now, and it is
   * the shared one.
   */
  it("does not include validate, which uses the shared envelope", () => {
    expect(LEGACY_JSON_COMMANDS).not.toContain("validate");
    const source = readFileSync(join(CLI_DIR, "validate-command.ts"), "utf8");
    expect(source).toContain("jsonEnvelope(VALIDATE_SCHEMA_VERSION");
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

describe("--json coverage", () => {
  /**
   * Every top-level command answers `--json`, either through the shared
   * envelope or — for the five that predate it — in its own recorded shape.
   *
   * Asserted against the real Commander tree rather than a written-down list,
   * because a list is exactly what goes stale: the point is that adding a
   * command without `--json` fails here, and it cannot do that if the check
   * reads from something the same commit can edit.
   */
  it("is offered by every top-level command", () => {
    const program = buildProgram();
    const offers = (cmd: Command): boolean => cmd.options.some((opt) => opt.long === "--json");
    // A command that only groups subcommands answers through them: `av plan`
    // alone does nothing, and putting `--json` on the group would be a flag
    // with no output to shape.
    const covered = (cmd: Command): boolean =>
      cmd.commands.length > 0 ? cmd.commands.every(covered) : offers(cmd);

    const missing = program.commands.filter((cmd) => !covered(cmd)).map((cmd) => cmd.name());
    expect(missing, "every top-level command should support --json").toEqual([]);
  });
});

describe("the kind each surface declares", () => {
  /**
   * `kind` is the field a consumer switches on, so it is the part of the
   * envelope that cannot change quietly. Asserted from real handler calls
   * rather than from the source, because a string that only exists in a
   * template literal is not a contract until something runs it.
   */
  const parsed = (output: string) => JSON.parse(output) as { kind: string; schema_version: number };

  it("list.kit", () => {
    const out = parsed(runList({ scope: "project", home: "/nope", cwd: "/nope", json: true }));
    expect(out.kind).toBe("list.kit");
    expect(out.schema_version).toBe(1);
  });

  it("validate.kit, carrying no held findings after close-out", () => {
    const out = JSON.parse(runValidate({ kitRoot: resolveKitRoot(process.cwd()), json: true }).summary) as {
      kind: string;
      data: { heldFindings: string[]; counts: { skills: number } };
    };
    expect(out.kind).toBe("validate.kit");
    expect(out.data.heldFindings).toEqual([]);
    expect(out.data.counts.skills).toBeGreaterThan(0);
  });

  it("telemetry.status", () => {
    const out = parsed(runTelemetryStatus({}, {}, { color: false, json: true }));
    expect(out.kind).toBe("telemetry.status");
  });

  it("query.<view>, named for the view that was asked for", () => {
    expect(parsed(runQuery({ view: "installs", home: "/nope", events: [], json: true })).kind).toBe("query.installs");
    expect(parsed(runQuery({ view: "history", home: "/nope", events: [], json: true })).kind).toBe("query.history");
  });
});
