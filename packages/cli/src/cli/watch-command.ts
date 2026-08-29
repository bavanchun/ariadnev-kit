// `av watch dry-run | start | status | stop`.
//
// THE DEFAULT POSTURE IS PREVIEW, AND IT IS ENFORCED BY CONSTRUCTION RATHER THAN
// BY A FLAG CHECK. `sweepOnce` can only post when it is handed a `post`
// function, and a preview simply is not given one — so a future branch that
// forgets to test `posting` still cannot post, because there is nothing to call.
//
// `start` becomes a posting run only when BOTH are true: the caller passed
// `--yes`, and the repository is in the allowlist. `--yes` alone writes the
// repository to the allowlist and runs the sweep, which makes enabling it one
// deliberate act that leaves a durable, revocable record — see ADR 0018 and
// `allowlist.ts`. A command pasted from somewhere therefore also leaves that
// record, where `status` will show it.

import { spawn } from "node:child_process";
import { recordActivity } from "../activity/emit.js";
import { readDaemonRecord } from "../api/daemon-state.js";
import { selfInvocation } from "../api/daemon-lifecycle.js";
import { packageVersion } from "../version.js";
import { invocationFor, DEFAULT_TARGET } from "../dispatch/adapter-invocation.js";
import { parseSkillRef, resolveSkill } from "../dispatch/resolve-skill-ref.js";
import { kitsDirFor, realResolveDeps } from "./run-dispatch-command.js";
import { spawnStreaming } from "../dispatch/spawn-stream.js";
import { allow, clearWatcher, inspectWatcher, isAllowed, knownRepos, readAllowlist, recordWatcher, watchSlot } from "../watch/allowlist.js";
import { sweepOnce, type DispatchFn, type SweepResult } from "../watch/pass.js";
import { listIssues, postComment, realGh, type GhRunner } from "../watch/poll.js";
import { boundResponse } from "../watch/respond.js";
import { parseMaxPerHour } from "../watch/rate-limit.js";
import { parseRepo, readState, repoSlug, type RepoRef } from "../watch/state.js";
import { EXIT, UnavailableError } from "./exit-codes.js";
import { jsonEnvelope } from "./json-envelope.js";

export const WATCH_SCHEMA_VERSION = 1;
/** How often a detached watcher looks for new issues. */
export const WATCH_POLL_MS = 60_000;
/** The skill a watched issue is handed to. */
export const DEFAULT_WATCH_SKILL = "ariadnev/scout";

export interface WatchOpts {
  readonly home: string;
  readonly cwd: string;
  /** Detach and keep polling. `--yes` is still what decides posting. */
  readonly daemon?: boolean;
  /** Set on the detached child. Not a user-facing flag. */
  readonly foreground?: boolean;
  /** Ends a foreground daemon without a signal. Tests use it. */
  readonly stop?: AbortSignal;
  readonly repo?: string;
  readonly label?: string;
  readonly maxPerHour?: string;
  readonly skill?: string;
  readonly limit?: number;
  readonly json?: boolean;
  readonly yes?: boolean;
  readonly target?: string;
}

export interface WatchResult {
  readonly output: string;
  readonly exitCode: number;
}

function envelope(kind: string, data: unknown): string {
  return jsonEnvelope(WATCH_SCHEMA_VERSION, kind, data);
}

/**
 * The real dispatcher: resolve the skill once, then run the agent per issue.
 *
 * Built here rather than inside the sweep so a test can hand `sweepOnce` a
 * function that spawns nothing — the sweep's job is the ordering of the gates,
 * and it should be assertable without a coding agent on the machine.
 */
export function realDispatch(opts: WatchOpts): DispatchFn {
  const ref = parseSkillRef(opts.skill ?? DEFAULT_WATCH_SKILL);
  const skill = resolveSkill(ref, realResolveDeps(opts.cwd, kitsDirFor({ cwd: opts.cwd }, process.env)));
  const target = (opts.target ?? DEFAULT_TARGET) as Parameters<typeof invocationFor>[0];
  return async (prompt: string) => {
    const invocation = invocationFor(target, skill, []);
    let output = "";
    const outcome = await spawnStreaming({
      binary: invocation.binary,
      // The prompt replaces the dispatch-built one: it already carries the
      // "read this skill" instruction, ahead of the untrusted block.
      args: [...invocation.args.slice(0, -1), prompt],
      cwd: opts.cwd,
      env: process.env,
      timeoutMs: 10 * 60 * 1000,
      onStdout: (chunk) => (output += chunk),
      onStderr: () => undefined,
    });
    return { ok: outcome.exitCode === 0, output: boundResponse(output) };
  };
}

export interface WatchDeps {
  readonly gh: GhRunner;
  readonly dispatch: (opts: WatchOpts) => DispatchFn;
  readonly now: () => Date;
}

export function realWatchDeps(): WatchDeps {
  return { gh: realGh(), dispatch: realDispatch, now: () => new Date() };
}

function requireRepo(opts: WatchOpts): RepoRef {
  if (!opts.repo) throw new UnavailableError("av watch needs a repository: av watch dry-run owner/repo");
  return parseRepo(opts.repo);
}

async function sweep(opts: WatchOpts, deps: WatchDeps, ref: RepoRef, posting: boolean): Promise<SweepResult> {
  const issues = listIssues(deps.gh, ref, {
    ...(opts.label ? { label: opts.label } : {}),
    ...(opts.limit === undefined ? {} : { limit: opts.limit }),
  });
  return sweepOnce({
    home: opts.home,
    ref,
    issues,
    skillRef: opts.skill ?? DEFAULT_WATCH_SKILL,
    maxPerHour: parseMaxPerHour(opts.maxPerHour),
    posting,
    dispatch: deps.dispatch(opts),
    // The posting capability is handed over only on the posting path. A preview
    // has no way to post, rather than a rule saying it must not.
    ...(posting ? { post: (issue: number, body: string) => postComment(deps.gh, ref, issue, body) } : {}),
    now: deps.now,
  });
}

function renderSweep(result: SweepResult, allowlisted: boolean): string {
  const lines = [
    `watch ${result.repo} — ${result.posting ? "POSTING" : "preview (nothing was posted)"}`,
    `  ${result.considered} open issue(s) considered; ${result.rate.used}/${result.rate.max} responses used this hour`,
  ];
  for (const item of result.results) {
    lines.push(`  #${item.issue} ${item.disposition}  ${item.title}`);
  }
  if (!result.posting) {
    lines.push(
      allowlisted
        ? "  posting is allowed for this repository; run `av watch start <repo> --yes` to post"
        : "  to let this machine post replies here, run `av watch start <repo> --yes` (recorded in the allowlist, revocable)",
    );
  }
  return lines.join("\n");
}

export async function runWatchDryRun(opts: WatchOpts, deps: WatchDeps): Promise<WatchResult> {
  const ref = requireRepo(opts);
  const result = await sweep(opts, deps, ref, false);
  return {
    output: opts.json ? envelope("watch.dry-run", result) : renderSweep(result, isAllowed(opts.home, ref)),
    exitCode: EXIT.ok,
  };
}

export async function runWatchStart(opts: WatchOpts, deps: WatchDeps): Promise<WatchResult> {
  if (opts.foreground) return runWatchForeground(opts, deps);
  if (opts.daemon) return spawnWatcher(opts);
  const ref = requireRepo(opts);

  // One watcher per repository. Two would clobber each other's answered sets
  // through last-write-wins renames and both reply — see `allowlist.ts`.
  const running = inspectWatcher(opts.home, ref);
  if (running.state === "running") {
    throw new UnavailableError(
      `a watcher for ${repoSlug(ref)} is already running (pid ${running.record!.pid}). ` +
        `Two would answer the same issue twice; stop it with \`av watch stop ${repoSlug(ref)}\` first.`,
    );
  }

  if (!opts.yes) {
    const result = await sweep(opts, deps, ref, false);
    return {
      output: opts.json
        ? envelope("watch.start", { ...result, posted: false, reason: "no --yes: previewing" })
        : `${renderSweep(result, isAllowed(opts.home, ref))}\n  (no --yes, so this was a preview)`,
      exitCode: EXIT.ok,
    };
  }

  const added = allow(opts.home, ref);
  const result = await sweep(opts, deps, ref, true);
  recordActivity(opts.home, "watch.responded", { status: "ok" });
  const answered = result.results.filter((item) => item.disposition === "answered").length;
  return {
    output: opts.json
      ? envelope("watch.start", { ...result, allowlisted: true, newly_allowlisted: added })
      : [
          added ? `allowlisted ${repoSlug(ref)} for posting — remove it from the allowlist to revoke` : "",
          renderSweep(result, true),
          `  ${answered} reply/replies posted`,
        ]
          .filter(Boolean)
          .join("\n"),
    exitCode: EXIT.ok,
  };
}

export function runWatchStatus(opts: WatchOpts): WatchResult {
  const allowlist = readAllowlist(opts.home);
  const repos = opts.repo ? [repoSlug(parseRepo(opts.repo))] : knownRepos(opts.home);
  const watches = repos.map((slug) => {
    const ref = parseRepo(slug);
    const state = readState(opts.home, ref);
    const watcher = inspectWatcher(opts.home, ref);
    return {
      repo: slug,
      allowlisted: allowlist.includes(slug),
      daemon: watcher.state,
      pid: watcher.state === "running" ? watcher.record!.pid : null,
      last_seen_issue: state.lastSeenIssue,
      responded: state.responded.length,
      responses_this_hour: state.responseTimes.length,
      updated_at: state.updatedAt || null,
    };
  });

  if (opts.json) return { output: envelope("watch.status", { watches }), exitCode: EXIT.ok };
  if (watches.length === 0) {
    return { output: "watch: nothing watched — `av watch dry-run owner/repo` previews without posting", exitCode: EXIT.ok };
  }
  const lines = watches.map(
    (w) =>
      `  ${w.repo}  ${w.allowlisted ? "allowlisted" : "preview-only"}  daemon:${w.daemon}  ` +
      `answered:${w.responded}  last-seen:#${w.last_seen_issue}`,
  );
  return { output: ["watch:", ...lines].join("\n"), exitCode: EXIT.ok };
}

export function runWatchStop(opts: WatchOpts): WatchResult {
  const ref = requireRepo(opts);
  const watcher = inspectWatcher(opts.home, ref);
  if (watcher.record === null) {
    return { output: opts.json ? envelope("watch.stop", { result: "not-running" }) : `watch ${repoSlug(ref)}: not running`, exitCode: EXIT.ok };
  }
  if (watcher.state === "stopped") {
    clearWatcher(opts.home, ref);
    return {
      output: opts.json
        ? envelope("watch.stop", { result: "cleaned", pid: watcher.record.pid })
        : `watch ${repoSlug(ref)}: not running — removed a stale record for pid ${watcher.record.pid}`,
      exitCode: EXIT.ok,
    };
  }
  // Named before it is signalled. A watcher has no port to identify itself on,
  // so a recycled pid cannot be ruled out here the way `av api stop` rules it
  // out — printing the pid is what lets the operator notice.
  try {
    process.kill(watcher.record.pid, "SIGTERM");
  } catch {
    // Already gone between the check and the signal. The record still goes.
  }
  clearWatcher(opts.home, ref);
  recordActivity(opts.home, "watch.stopped", { status: "ok" });
  return {
    output: opts.json
      ? envelope("watch.stop", { result: "stopped", pid: watcher.record.pid })
      : `watch ${repoSlug(ref)}: stopped pid ${watcher.record.pid}`,
    exitCode: EXIT.ok,
  };
}


/**
 * Keep sweeping until something stops us — the body of a detached watcher.
 *
 * The pidfile is written after the first sweep is set up rather than before, for
 * the same reason `av api` writes its record after the bind: a record for a
 * watcher that is about to die of a bad repository is a record of nothing. It is
 * removed on the way out, so `status` does not report a watcher that stopped an
 * hour ago.
 *
 * Errors inside a sweep do not end the loop. A `gh` outage is a reason to try
 * again in a minute, not a reason for a watcher to disappear silently overnight.
 */
export async function runWatchForeground(opts: WatchOpts, deps: WatchDeps): Promise<WatchResult> {
  const ref = requireRepo(opts);
  const running = inspectWatcher(opts.home, ref);
  if (running.state === "running") {
    throw new UnavailableError(`a watcher for ${repoSlug(ref)} is already running (pid ${running.record!.pid})`);
  }
  if (opts.yes) allow(opts.home, ref);

  recordWatcher(opts.home, ref, {
    pid: process.pid,
    port: 0,
    bind: repoSlug(ref),
    startedAt: deps.now().toISOString(),
    version: packageVersion(),
  });
  if (!opts.json) {
    process.stderr.write(
      `watching ${repoSlug(ref)} every ${WATCH_POLL_MS / 1000}s — ${opts.yes ? "POSTING" : "preview only"} (pid ${process.pid})\n`,
    );
  }

  const done = shutdownSignal(opts.stop);
  try {
    while (!done.aborted) {
      try {
        await sweep(opts, deps, ref, opts.yes === true);
      } catch (error) {
        // Reported, never fatal. A watcher that vanishes on the first transient
        // `gh` failure is worse than one that retries.
        process.stderr.write(`watch ${repoSlug(ref)}: sweep failed — ${error instanceof Error ? error.message : String(error)}\n`);
      }
      if (done.aborted) break;
      await sleepUnless(WATCH_POLL_MS, done);
    }
  } finally {
    if (readDaemonRecord(opts.home, watchSlot(ref))?.pid === process.pid) clearWatcher(opts.home, ref);
    recordActivity(opts.home, "watch.stopped", { status: "ok" });
  }
  return { output: "", exitCode: EXIT.ok };
}

/** TERM and INT both arrive here in normal use: `watch stop` sends one, Ctrl-C the other. */
function shutdownSignal(external: AbortSignal | undefined): AbortSignal {
  const controller = new AbortController();
  const finish = (): void => controller.abort();
  process.once("SIGTERM", finish);
  process.once("SIGINT", finish);
  if (external) {
    if (external.aborted) finish();
    else external.addEventListener("abort", finish, { once: true });
  }
  return controller.signal;
}

function sleepUnless(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

/** The argv that re-runs this binary as a detached watcher. */
export function watchSpawnArgs(opts: WatchOpts, argv: readonly string[], execPath: string): string[] {
  const { prefix } = selfInvocation(execPath, argv);
  return [
    ...prefix,
    "--home", opts.home,
    "--cwd", opts.cwd,
    ...(opts.yes ? ["--yes"] : []),
    "watch", "start", opts.repo as string,
    "--foreground",
    ...(opts.label ? ["--label", opts.label] : []),
    ...(opts.maxPerHour ? ["--max-per-hour", opts.maxPerHour] : []),
    ...(opts.skill ? ["--skill", opts.skill] : []),
    ...(opts.target ? ["--target", opts.target] : []),
    ...(opts.limit === undefined ? [] : ["--limit", String(opts.limit)]),
  ];
}

/** Detach a watcher and report its pid, without waiting for its first sweep. */
export function spawnWatcher(opts: WatchOpts): WatchResult {
  const ref = requireRepo(opts);
  const running = inspectWatcher(opts.home, ref);
  if (running.state === "running") {
    throw new UnavailableError(`a watcher for ${repoSlug(ref)} is already running (pid ${running.record!.pid})`);
  }
  const child = spawn(process.execPath, watchSpawnArgs(opts, process.argv, process.execPath), {
    cwd: opts.cwd,
    env: process.env,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return {
    output: opts.json
      ? envelope("watch.start", { daemon: true, pid: child.pid ?? null, repo: repoSlug(ref), posting: opts.yes === true })
      : `watching ${repoSlug(ref)} in the background — pid ${child.pid}, ${opts.yes ? "POSTING" : "preview only"}. ` +
        `Stop it with \`av watch stop ${repoSlug(ref)}\`.`,
    exitCode: EXIT.ok,
  };
}
