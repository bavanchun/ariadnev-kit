import { describe, expect, it } from "vitest";
import {
  createExecutorProbe,
  createExecutorResult,
  type ExecutorCapabilityV1,
  type ExecutorRequestV1,
  type GraphExecutorV1,
} from "./executor.js";
import { createExecutorRegistry } from "./executor-registry.js";

class FixtureExecutor implements GraphExecutorV1 {
  constructor(readonly provider: string, private readonly supported: boolean) {}

  probe(required: readonly ExecutorCapabilityV1[]) {
    return createExecutorProbe({
      provider: this.provider,
      adapterVersion: "1.0.0",
      runtimeVersion: "1.0.0",
      model: "fixture",
      status: this.supported ? "supported" : "unsupported",
      available: this.supported ? required : [],
      missing: this.supported ? [] : required,
      ...(!this.supported ? { reason: "runtime-unavailable" as const } : {}),
    });
  }

  async execute(request: ExecutorRequestV1) {
    return createExecutorResult({
      status: "completed",
      probe: this.probe(request.requiredCapabilities),
      elapsedMs: 0,
      evidenceRefs: [],
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
      transientStateWrites: {},
    });
  }
}

describe("executor registry", () => {
  const required = ["execution:cancel", "execution:structured-output"] as const;

  it("selects an explicit runtime without falling back when it is unavailable", () => {
    const registry = createExecutorRegistry([
      new FixtureExecutor("codex", false),
      new FixtureExecutor("claude-code", true),
    ]);
    expect(registry.select({ provider: "codex", requiredCapabilities: required })).toMatchObject({
      ok: false,
      reason: "runtime-unavailable",
      provider: "codex",
    });
  });

  it("uses capability selection only when exactly one runtime is eligible", () => {
    const one = createExecutorRegistry([
      new FixtureExecutor("codex", false),
      new FixtureExecutor("claude-code", true),
    ]);
    expect(one.select({ requiredCapabilities: required })).toMatchObject({
      ok: true,
      selection: "capability",
      executor: { provider: "claude-code" },
    });

    const ambiguous = createExecutorRegistry([
      new FixtureExecutor("codex", true),
      new FixtureExecutor("claude-code", true),
    ]);
    expect(ambiguous.select({ requiredCapabilities: required })).toMatchObject({
      ok: false,
      reason: "ambiguous-runtime",
    });
  });

  it("rejects duplicate and unknown providers", () => {
    expect(() => createExecutorRegistry([
      new FixtureExecutor("codex", true),
      new FixtureExecutor("codex", true),
    ])).toThrow(/duplicate/i);
    expect(createExecutorRegistry([new FixtureExecutor("codex", true)]).select({
      provider: "missing",
      requiredCapabilities: required,
    })).toMatchObject({ ok: false, reason: "unknown-runtime" });
  });
});
