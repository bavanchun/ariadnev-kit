import { categoricalToken } from "./categorical-token.js";
import { bindRunContext, type RunBoundV1, type RunContextV1 } from "./run-context.js";

const observationBrand: unique symbol = Symbol("ariadnev.run-observation");
const metricObservationBrand: unique symbol = Symbol("ariadnev.metric-observation");
export type ObservationSource = "harness" | "runtime";

interface ObservationBase extends RunBoundV1 {
  readonly source: ObservationSource;
  readonly complete: boolean;
  readonly [observationBrand]: true;
}
export interface RoutingObservationV1 extends ObservationBase {
  readonly domain: "routing";
  readonly selectedSkills: readonly string[];
}
export interface ActionObservationV1 extends ObservationBase {
  readonly domain: "actions";
  readonly forbiddenActions: readonly string[];
  readonly violations: number;
}
export interface TrajectoryObservationV1 extends ObservationBase {
  readonly domain: "trajectory";
  readonly labels: readonly string[];
  readonly eventCount: number;
}
export type RunObservationV1 = RoutingObservationV1 | ActionObservationV1 | TrajectoryObservationV1;

export type MetricName = "inputTokens" | "outputTokens" | "contextChars" | "retries" | "humanInterventions";
export interface MetricObservationV1 extends RunBoundV1 {
  readonly source: ObservationSource;
  readonly metrics: Readonly<Partial<Record<MetricName, number | null>>>;
  readonly [metricObservationBrand]: true;
}

function source(value: ObservationSource): ObservationSource {
  if (value !== "harness" && value !== "runtime") throw new Error("observation source is unsupported");
  return value;
}

function registered(values: string[], allowed: string[], label: string): readonly string[] {
  const registry = new Set(allowed.map((value, index) => categoricalToken(value, `${label}.allowed[${index}]`)));
  const normalized = values.map((value, index) => categoricalToken(value, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label} entries must be unique`);
  for (const value of normalized) if (!registry.has(value)) throw new Error(`${label} is not registered or watched: ${value}`);
  return Object.freeze(normalized);
}

function brand<T extends object>(run: RunContextV1, value: T): T & RunBoundV1 {
  Object.defineProperty(value, observationBrand, { value: true });
  return bindRunContext(run, value);
}

export function observeRouting(input: {
  run: RunContextV1;
  source: ObservationSource;
  complete: boolean;
  selectedSkills: string[];
  allowedSkills: string[];
}): RoutingObservationV1 {
  return brand(input.run, {
    domain: "routing",
    source: source(input.source),
    complete: input.complete,
    selectedSkills: registered(input.selectedSkills, input.allowedSkills, "routing.selectedSkills"),
  }) as RoutingObservationV1;
}

export function observeActions(input: {
  run: RunContextV1;
  source: ObservationSource;
  complete: boolean;
  forbiddenActions: string[];
  violations: number;
  watchedActions: string[];
}): ActionObservationV1 {
  if (!Number.isInteger(input.violations) || input.violations < 0) throw new Error("action violations must be non-negative");
  return brand(input.run, {
    domain: "actions",
    source: source(input.source),
    complete: input.complete,
    forbiddenActions: registered(input.forbiddenActions, input.watchedActions, "actions.forbiddenActions"),
    violations: input.violations,
  }) as ActionObservationV1;
}

export function observeTrajectory(input: {
  run: RunContextV1;
  source: ObservationSource;
  complete: boolean;
  labels: string[];
  eventCount: number;
  allowedLabels: string[];
}): TrajectoryObservationV1 {
  if (!Number.isInteger(input.eventCount) || input.eventCount < 0) throw new Error("trajectory eventCount must be non-negative");
  return brand(input.run, {
    domain: "trajectory",
    source: source(input.source),
    complete: input.complete,
    labels: registered(input.labels, input.allowedLabels, "trajectory.labels"),
    eventCount: input.eventCount,
  }) as TrajectoryObservationV1;
}

export function observeMetrics(input: {
  run: RunContextV1;
  source: ObservationSource;
  metrics: Partial<Record<MetricName, number | null>>;
}): MetricObservationV1 {
  const allowed = new Set<MetricName>(["inputTokens", "outputTokens", "contextChars", "retries", "humanInterventions"]);
  const metrics: Partial<Record<MetricName, number | null>> = {};
  for (const [name, value] of Object.entries(input.metrics)) {
    if (!allowed.has(name as MetricName)) throw new Error(`metric is unsupported: ${name}`);
    if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
      throw new Error(`metric must be non-negative or null: ${name}`);
    }
    if ((name === "retries" || name === "humanInterventions") && value !== null && !Number.isInteger(value)) {
      throw new Error(`metric must be an integer: ${name}`);
    }
    metrics[name as MetricName] = value;
  }
  const observation = { source: source(input.source), metrics: Object.freeze(metrics) } as MetricObservationV1;
  Object.defineProperty(observation, metricObservationBrand, { value: true });
  return bindRunContext(input.run, observation) as MetricObservationV1;
}

export function isRunObservation(value: unknown): value is RunObservationV1 {
  return typeof value === "object" && value !== null && Object.isFrozen(value) && Object.prototype.hasOwnProperty.call(value, observationBrand);
}

export function isMetricObservation(value: unknown): value is MetricObservationV1 {
  return typeof value === "object" && value !== null && Object.isFrozen(value) && Object.prototype.hasOwnProperty.call(value, metricObservationBrand);
}
