// One sweep of a watched repository: the order the gates run in.
//
// The order is the design. Read it top to bottom in `sweepOnce` and it is the
// same list ADR 0018 calls structural, in the sequence that makes each one
// load-bearing:
//
//   already answered?      → skip          (the dedup set)
//   rate budget spent?     → stop the pass (before anything is spawned)
//   claim the issue        → write first   (a crash loses a reply, never doubles one)
//   frame as untrusted     → nonce-fenced  (advisory, and known to be)
//   dispatch               → the agent runs
//   allowlisted AND --yes? → post          (otherwise the draft is only shown)
//
// The rate check sits before the claim so a refused issue is not marked answered;
// the claim sits before the dispatch so a crash during the dispatch cannot
// produce a second reply. Those two facts are what the crash test asserts.

import { checkRate, pruneResponseTimes, type RateVerdict } from "./rate-limit.js";
import { framePrompt, type IssueRef } from "./respond.js";
import { claimIssue, readState, writeState, repoSlug, type RepoRef, type WatchState } from "./state.js";

export interface DispatchOutcome {
  readonly ok: boolean;
  readonly output: string;
}

/** Runs the framed prompt through a coding agent. Injected so tests spawn nothing. */
export type DispatchFn = (prompt: string) => Promise<DispatchOutcome>;

/** Posts a comment. Absent in dry-run, which is how dry-run cannot post. */
export type PostFn = (issue: number, body: string) => void;

export type IssueDisposition =
  | "answered"
  | "drafted"
  | "already-answered"
  | "rate-limited"
  | "dispatch-failed";

export interface IssueResult {
  readonly issue: number;
  readonly title: string;
  readonly disposition: IssueDisposition;
  /** What the agent produced. Present for `answered` and `drafted`. */
  readonly draft?: string;
  readonly nonce?: string;
}

export interface SweepResult {
  readonly repo: string;
  readonly posting: boolean;
  readonly considered: number;
  readonly results: readonly IssueResult[];
  readonly rate: RateVerdict;
}

export interface SweepOptions {
  readonly home: string;
  readonly ref: RepoRef;
  readonly issues: readonly IssueRef[];
  readonly skillRef: string;
  readonly maxPerHour: number;
  /** False keeps this a preview: the agent still runs, nothing is posted. */
  readonly posting: boolean;
  readonly dispatch: DispatchFn;
  /** Required when `posting`; its absence is what makes a preview safe. */
  readonly post?: PostFn;
  readonly now: () => Date;
}

export async function sweepOnce(opts: SweepOptions): Promise<SweepResult> {
  const results: IssueResult[] = [];
  let state = readState(opts.home, opts.ref);
  let rate = checkRate(state.responseTimes, opts.maxPerHour, opts.now());

  for (const issue of opts.issues) {
    if (state.responded.includes(issue.number)) {
      results.push({ issue: issue.number, title: issue.title, disposition: "already-answered" });
      continue;
    }

    rate = checkRate(state.responseTimes, opts.maxPerHour, opts.now());
    if (!rate.allowed) {
      // Reported per issue rather than silently ending the loop: "nothing
      // happened" and "the budget ran out" look identical otherwise.
      results.push({ issue: issue.number, title: issue.title, disposition: "rate-limited" });
      continue;
    }

    // Claimed BEFORE the dispatch. Everything after this point may crash without
    // producing a duplicate; the cost is that a crash here loses one reply.
    if (!claimIssue(opts.home, opts.ref, issue.number, opts.now())) {
      results.push({ issue: issue.number, title: issue.title, disposition: "already-answered" });
      continue;
    }
    state = readState(opts.home, opts.ref);

    const framed = framePrompt(issue, opts.skillRef);
    const outcome = await opts.dispatch(framed.prompt);
    if (!outcome.ok) {
      results.push({ issue: issue.number, title: issue.title, disposition: "dispatch-failed", nonce: framed.nonce });
      continue;
    }

    if (opts.posting && opts.post) {
      opts.post(issue.number, outcome.output);
      results.push({ issue: issue.number, title: issue.title, disposition: "answered", draft: outcome.output, nonce: framed.nonce });
    } else {
      results.push({ issue: issue.number, title: issue.title, disposition: "drafted", draft: outcome.output, nonce: framed.nonce });
    }
  }

  // Housekeeping, not bookkeeping: aged-out timestamps would otherwise grow the
  // file forever. The answered set is never pruned — that is the dedup guarantee.
  const now = opts.now();
  const pruned: WatchState = {
    ...state,
    responseTimes: pruneResponseTimes(state.responseTimes, now),
    lastSeenIssue: Math.max(state.lastSeenIssue, ...opts.issues.map((i) => i.number), 0),
    updatedAt: now.toISOString(),
  };
  writeState(opts.home, opts.ref, pruned);

  return {
    repo: repoSlug(opts.ref),
    posting: opts.posting,
    considered: opts.issues.length,
    results,
    rate: checkRate(pruned.responseTimes, opts.maxPerHour, now),
  };
}
