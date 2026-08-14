import type {
  ExecutorCapabilityV1,
  ExecutorProbeReasonV1,
  ExecutorProbeV1,
  GraphExecutorV1,
} from "./executor.js";

export type ExecutorSelectionFailureReasonV1 =
  | "unknown-runtime"
  | "runtime-unavailable"
  | "ambiguous-runtime";

export type ExecutorSelectionV1 = Readonly<{
  ok: true;
  selection: "explicit" | "capability";
  provider: string;
  executor: GraphExecutorV1;
  probe: ExecutorProbeV1;
}> | Readonly<{
  ok: false;
  reason: ExecutorSelectionFailureReasonV1;
  provider: string | null;
  probes: readonly ExecutorProbeV1[];
  detail?: ExecutorProbeReasonV1;
}>;

export interface ExecutorRegistryV1 {
  readonly providers: readonly string[];
  select(input: {
    provider?: string;
    requiredCapabilities: readonly ExecutorCapabilityV1[];
  }): ExecutorSelectionV1;
}

export function createExecutorRegistry(executors: readonly GraphExecutorV1[]): ExecutorRegistryV1 {
  const byProvider = new Map<string, GraphExecutorV1>();
  for (const executor of executors) {
    if (typeof executor.provider !== "string" || executor.provider.length === 0) {
      throw new Error("executor provider is required");
    }
    if (byProvider.has(executor.provider)) throw new Error(`duplicate executor provider: ${executor.provider}`);
    byProvider.set(executor.provider, executor);
  }
  const providers = Object.freeze([...byProvider.keys()].sort());

  return Object.freeze({
    providers,
    select(input: {
      provider?: string;
      requiredCapabilities: readonly ExecutorCapabilityV1[];
    }): ExecutorSelectionV1 {
      if (input.provider !== undefined) {
        const executor = byProvider.get(input.provider);
        if (!executor) {
          return Object.freeze({ ok: false, reason: "unknown-runtime", provider: input.provider, probes: Object.freeze([]) });
        }
        const probe = executor.probe(input.requiredCapabilities);
        if (probe.status !== "supported") {
          return Object.freeze({
            ok: false,
            reason: "runtime-unavailable",
            provider: input.provider,
            probes: Object.freeze([probe]),
            ...(probe.reason ? { detail: probe.reason } : {}),
          });
        }
        return Object.freeze({ ok: true, selection: "explicit", provider: input.provider, executor, probe });
      }

      const probed = providers.map((provider) => {
        const executor = byProvider.get(provider)!;
        return { executor, probe: executor.probe(input.requiredCapabilities) };
      });
      const eligible = probed.filter(({ probe }) => probe.status === "supported");
      if (eligible.length !== 1) {
        return Object.freeze({
          ok: false,
          reason: eligible.length === 0 ? "runtime-unavailable" : "ambiguous-runtime",
          provider: null,
          probes: Object.freeze(probed.map(({ probe }) => probe)),
        });
      }
      const [{ executor, probe }] = eligible;
      return Object.freeze({
        ok: true,
        selection: "capability",
        provider: executor.provider,
        executor,
        probe,
      });
    },
  });
}
