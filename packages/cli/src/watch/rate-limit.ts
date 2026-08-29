// The cap on how often this machine will spawn a coding agent for a stranger.
//
// ENFORCED HERE, BEFORE THE DISPATCH — not by GitHub, and not by the agent. A
// limit that lives on the remote API is a limit on requests, not on what runs
// locally, and the cost being bounded is model spend and shell access on the
// maintainer's machine. ADR 0018 lists this among the mitigations that hold
// whatever the model decides, which is only true if the check happens before
// anything is spawned.
//
// A sliding window rather than a fixed hour: a fixed hour lets an attacker file
// `2 × max` issues across a boundary and have them all answered within minutes.

import { UsageError } from "../cli/exit-codes.js";

/** Conservative by intent. Upstream's examples use 5; this is the floor of that. */
export const DEFAULT_MAX_PER_HOUR = 3;
const WINDOW_MS = 60 * 60 * 1000;

export function parseMaxPerHour(raw: string | number | undefined): number {
  if (raw === undefined) return DEFAULT_MAX_PER_HOUR;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new UsageError(`--max-per-hour must be a non-negative integer, got ${JSON.stringify(raw)}`);
  }
  return value;
}

export interface RateVerdict {
  readonly allowed: boolean;
  readonly used: number;
  readonly max: number;
  /** When the oldest response in the window falls out of it. Null when allowed. */
  readonly retryAt: string | null;
}

/**
 * Whether one more dispatch is permitted right now.
 *
 * Unparseable timestamps are counted as *inside* the window rather than
 * discarded. Dropping them would make a corrupted state file into a way to reset
 * the limit, and a rate limit that a bad write can lift is not a rate limit.
 */
export function checkRate(responseTimes: readonly string[], max: number, now: Date): RateVerdict {
  const floor = now.getTime() - WINDOW_MS;
  const inWindow = responseTimes.filter((stamp) => {
    const at = Date.parse(stamp);
    return Number.isNaN(at) || at >= floor;
  });
  if (inWindow.length < max) {
    return { allowed: true, used: inWindow.length, max, retryAt: null };
  }
  const oldest = inWindow
    .map((stamp) => Date.parse(stamp))
    .filter((at) => !Number.isNaN(at))
    .sort((a, b) => a - b)[0];
  return {
    allowed: false,
    used: inWindow.length,
    max,
    retryAt: oldest === undefined ? null : new Date(oldest + WINDOW_MS).toISOString(),
  };
}

/** Drop timestamps that have aged out, so the file does not grow without bound. */
export function pruneResponseTimes(responseTimes: readonly string[], now: Date): string[] {
  const floor = now.getTime() - WINDOW_MS;
  return responseTimes.filter((stamp) => {
    const at = Date.parse(stamp);
    return Number.isNaN(at) || at >= floor;
  });
}
