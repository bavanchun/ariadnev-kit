import { describe, expect, it, vi } from "vitest";
import { createSupportedTestRun } from "./__fixtures__/run-test-fixture.js";
import { executeScenario, isControlledExecution } from "./execution-controller.js";

describe("executeScenario", () => {
  it("derives lifecycle and latency while keeping executor output transient", async () => {
    const forged = {
      status: "completed",
      events: [{ evidenceIds: ["tests.results"] }],
      metrics: { inputTokens: 0, outputTokens: 0 },
      password: "supersecret123",
    };
    const executor = { execute: vi.fn(async () => forged) };
    const { run, preflight } = createSupportedTestRun();
    const times = [100, 145];
    const execution = await executeScenario(
      executor,
      { prompt: "Run the task", workspaceRoot: "/tmp/ariadnev-eval-abcd/workspace" },
      { run, preflight, signal: new AbortController().signal, now: () => times.shift() ?? 145 },
    );

    expect(execution).toMatchObject({ status: "completed", latencyMs: 45, transientOutput: forged });
    expect(isControlledExecution(execution)).toBe(true);
    expect(executor.execute).toHaveBeenCalledTimes(1);
    expect(isControlledExecution({ status: "completed", latencyMs: 0, transientOutput: forged })).toBe(false);
  });

  it("maps throws and controller cancellation without persisting error text", async () => {
    const failedRun = createSupportedTestRun();
    const failed = await executeScenario(
      { execute: async () => Promise.reject(new Error("password.supersecret123")) },
      { prompt: "Run", workspaceRoot: "/tmp/ariadnev-eval-fail/workspace" },
      { ...failedRun, signal: new AbortController().signal, now: () => 1 },
    );
    const aborted = new AbortController();
    aborted.abort();
    const cancelledRun = createSupportedTestRun();
    const cancelled = await executeScenario(
      { execute: async () => ({ status: "completed" }) },
      { prompt: "Run", workspaceRoot: "/tmp/ariadnev-eval-cancel/workspace" },
      { ...cancelledRun, signal: aborted.signal, now: () => 1 },
    );

    expect(failed.status).toBe("failed");
    expect(JSON.stringify(failed)).not.toContain("supersecret123");
    expect(cancelled.status).toBe("cancelled");
  });
});
