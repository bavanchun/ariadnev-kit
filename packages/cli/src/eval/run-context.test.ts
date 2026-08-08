import { describe, expect, it } from "vitest";
import { observeActions, observeMetrics } from "./run-observation.js";
import { assertRunBound, createRunContext } from "./run-context.js";

describe("run context lineage", () => {
  it("uses hidden identity rather than a forgeable public run id", () => {
    const first = createRunContext();
    const second = createRunContext();
    const actions = observeActions({
      run: first,
      source: "harness",
      complete: true,
      forbiddenActions: [],
      violations: 0,
      watchedActions: ["workspace.write"],
    });
    const metrics = observeMetrics({ run: first, source: "harness", metrics: { retries: 0 } });

    expect(() => assertRunBound(first, actions, "actions")).not.toThrow();
    expect(() => assertRunBound(first, metrics, "metrics")).not.toThrow();
    expect(() => assertRunBound(second, actions, "actions")).toThrow(/run context/i);
    expect(JSON.stringify(actions)).toContain(first.runId);
    expect(Object.getOwnPropertySymbols(actions)).not.toEqual([]);
  });
});
