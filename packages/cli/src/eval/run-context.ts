import { randomUUID } from "node:crypto";
import { categoricalToken } from "./categorical-token.js";

const runContextBrand: unique symbol = Symbol("ariadnev.run-context");
const runContextIdentity: unique symbol = Symbol("ariadnev.run-context-identity");
const boundContextIdentity: unique symbol = Symbol("ariadnev.bound-run-context");

export interface RunContextV1 {
  readonly runId: string;
  readonly [runContextBrand]: true;
  readonly [runContextIdentity]: object;
}

export interface RunBoundV1 {
  readonly runId: string;
}

export function createRunContext(): RunContextV1 {
  const context = { runId: categoricalToken(randomUUID(), "run.id") } as RunContextV1;
  Object.defineProperty(context, runContextBrand, { value: true });
  Object.defineProperty(context, runContextIdentity, { value: Object.freeze({}) });
  return Object.freeze(context);
}

export function isRunContext(value: unknown): value is RunContextV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.isFrozen(value) &&
    Object.prototype.hasOwnProperty.call(value, runContextBrand) &&
    Object.prototype.hasOwnProperty.call(value, runContextIdentity)
  );
}

export function bindRunContext<T extends object>(run: RunContextV1, value: T): Readonly<T & RunBoundV1> {
  if (!isRunContext(run)) throw new Error("run context must be controller-created");
  if (Object.prototype.hasOwnProperty.call(value, "runId")) throw new Error("run-bound value must not provide runId");
  Object.defineProperty(value, "runId", { enumerable: true, value: run.runId });
  Object.defineProperty(value, boundContextIdentity, { value: run[runContextIdentity] });
  return Object.freeze(value as T & RunBoundV1);
}

export function assertRunBound(run: RunContextV1, value: unknown, label: string): asserts value is RunBoundV1 {
  if (
    !isRunContext(run) ||
    typeof value !== "object" ||
    value === null ||
    (value as RunBoundV1).runId !== run.runId ||
    !Object.prototype.hasOwnProperty.call(value, boundContextIdentity) ||
    (value as { [boundContextIdentity]?: object })[boundContextIdentity] !== run[runContextIdentity]
  ) {
    throw new Error(`${label} does not belong to the current run context`);
  }
}
