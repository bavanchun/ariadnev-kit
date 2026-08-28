import { afterEach, describe, expect, it, vi } from "vitest";
import { EXIT, UsageError } from "./exit-codes.js";
import { classifyRun, refuseLegacyRunSubcommand, RUN_SHIM_REMOVED_IN } from "./run-shim.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function captureStderr(): string[] {
  const lines: string[] = [];
  vi.spyOn(console, "error").mockImplementation((line) => lines.push(String(line)));
  return lines;
}

describe("the legacy `av run` shim", () => {
  it("lets a workflow ID through, and says the name is going away", () => {
    const warnings = captureStderr();
    classifyRun("read-only-delivery");
    expect(warnings).toHaveLength(1);
    // Naming the replacement and the release is the whole content of a
    // deprecation. A warning that only says "deprecated" tells a user their
    // script is doomed without telling them what to type instead.
    expect(warnings[0]).toContain("av workflow run read-only-delivery");
    expect(warnings[0]).toContain(RUN_SHIM_REMOVED_IN);
  });

  it("warns for the bare form too", () => {
    // `av run` with no positional is still the harness, so it is still the
    // invocation that stops working — silence here would strand exactly the
    // users who never pass a workflow ID.
    const warnings = captureStderr();
    classifyRun(undefined);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("av workflow run");
  });

  it("warns on stderr and prints nothing to stdout", () => {
    // A `--json` consumer reads stdout. A warning there corrupts the envelope,
    // which would make the deprecation itself the breaking change.
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    captureStderr();
    classifyRun("read-only-delivery");
    expect(log).not.toHaveBeenCalled();
  });

  it("routes a slashed positional to dispatch", () => {
    // The grammar the name was reserved for, now implemented. Misrouting it
    // would run the harness against a workflow ID that cannot exist and report
    // "not found" for a command that was spelled correctly.
    expect(classifyRun("engineer/scout")).toBe("dispatch");
  });

  it("says nothing at all when dispatching", () => {
    // Dispatch is the current meaning of `run`, not a deprecated one. Warning
    // here would print a deprecation notice on the spelling users are being
    // moved towards.
    const warnings = captureStderr();
    classifyRun("engineer/scout");
    expect(warnings).toEqual([]);
  });

  it("keeps both senses of run alive at once", () => {
    // The coexistence requirement, as one assertion: the slash decides, and
    // neither answer is an error.
    captureStderr();
    expect(classifyRun("engineer/scout")).toBe("dispatch");
    expect(classifyRun("read-only-delivery")).toBe("legacy-workflow");
  });

  it("sends the moved subcommands to their new spelling", () => {
    for (const name of ["resume", "status", "cancel"]) {
      let thrown: unknown;
      try {
        refuseLegacyRunSubcommand(name);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(UsageError);
      expect((thrown as UsageError).message).toContain(`av workflow ${name}`);
      expect((thrown as UsageError).exitCode).toBe(EXIT.usage);
    }
  });

  it("names the release that deletes this file", () => {
    // The one fact that has to survive being forgotten. A shim with no removal
    // date is a permanent second spelling of every command it fronts.
    expect(RUN_SHIM_REMOVED_IN).toBe("1.4.0");
  });
});
