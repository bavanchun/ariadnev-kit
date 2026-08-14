import { performance } from "node:perf_hooks";
import {
  assertCapabilityPreflight,
  type CapabilityPreflightV1,
} from "./capability-preflight.js";
import { bindRunContext, type RunBoundV1, type RunContextV1 } from "./run-context.js";
import type { ScenarioExecutionInput, ScenarioExecutor } from "./scenario-types.js";

const controlledExecutionBrand: unique symbol = Symbol("vcskill.controlled-execution");

export type ControlledStatus = "completed" | "failed" | "cancelled" | "timed-out" | "unsupported";

export interface ControlledExecutionV1 extends RunBoundV1 {
  readonly status: ControlledStatus;
  readonly latencyMs: number;
  readonly preflight: CapabilityPreflightV1;
  /** Available only to trusted evaluators; envelope serialization excludes it. */
  readonly transientOutput: unknown;
  readonly [controlledExecutionBrand]: true;
}

export interface ExecutionControllerOptions {
  run: RunContextV1;
  preflight: CapabilityPreflightV1;
  signal: AbortSignal;
  now?: () => number;
  abortStatus?: "cancelled" | "timed-out" | (() => "cancelled" | "timed-out");
}

function abortedStatus(options: ExecutionControllerOptions): "cancelled" | "timed-out" {
  return typeof options.abortStatus === "function"
    ? options.abortStatus()
    : options.abortStatus ?? "cancelled";
}

function controlled(
  run: RunContextV1,
  preflight: CapabilityPreflightV1,
  status: ControlledStatus,
  latencyMs: number,
  transientOutput: unknown,
): ControlledExecutionV1 {
  if (!Number.isFinite(latencyMs) || latencyMs < 0) throw new Error("controlled latency must be non-negative");
  const execution = { status, latencyMs, preflight, transientOutput } as Omit<ControlledExecutionV1, keyof RunBoundV1>;
  Object.defineProperty(execution, controlledExecutionBrand, { value: true });
  return bindRunContext(run, execution) as ControlledExecutionV1;
}

export async function executeScenario(
  executor: ScenarioExecutor,
  input: ScenarioExecutionInput,
  options: ExecutionControllerOptions,
): Promise<ControlledExecutionV1> {
  assertCapabilityPreflight(options.run, options.preflight);
  if (options.preflight.status === "unsupported") {
    return controlled(options.run, options.preflight, "unsupported", 0, undefined);
  }
  const now = options.now ?? (() => performance.now());
  const start = now();
  if (options.signal.aborted) {
    return controlled(options.run, options.preflight, abortedStatus(options), 0, undefined);
  }
  try {
    const transientOutput = await executor.execute(input, options.signal);
    const elapsed = now() - start;
    if (options.signal.aborted) {
      return controlled(options.run, options.preflight, abortedStatus(options), elapsed, transientOutput);
    }
    return controlled(options.run, options.preflight, "completed", elapsed, transientOutput);
  } catch {
    const elapsed = now() - start;
    const status = options.signal.aborted ? abortedStatus(options) : "failed";
    return controlled(options.run, options.preflight, status, elapsed, undefined);
  }
}

export function isControlledExecution(value: unknown): value is ControlledExecutionV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.isFrozen(value) &&
    Object.prototype.hasOwnProperty.call(value, controlledExecutionBrand)
  );
}
