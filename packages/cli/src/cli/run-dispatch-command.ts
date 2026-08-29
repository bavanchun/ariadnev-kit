// `av run <kit>/<skill>` — hand one skill to a coding agent and stream it.
//
// The three pieces underneath are separately testable and separately tested:
// `resolve-skill-ref` turns the argument into a directory, `adapter-invocation`
// turns a target into an argv, and `spawn-stream` owns the process. This file
// is the wiring, and it stays thin on purpose — everything here that could hold
// a bug is one of those three, where the tests are.

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { recordActivity } from "../activity/emit.js";
import { getKitRoot } from "../kit/embedded-kit.js";
import { isProviderId } from "../providers/index.js";
import type { ProviderId } from "../providers/spec-verified.js";
import { DEFAULT_TARGET, invocationFor } from "../dispatch/adapter-invocation.js";
import { parseSkillRef, resolveSkill, type ResolveDeps } from "../dispatch/resolve-skill-ref.js";
import { spawnStreaming } from "../dispatch/spawn-stream.js";
import { EXIT, UnavailableError, UsageError } from "./exit-codes.js";
import { jsonEnvelope } from "./json-envelope.js";

export const DISPATCH_SCHEMA_VERSION = 1;

/** The kit compiled into this binary. Its name is the kit's directory name. */
export const EMBEDDED_KIT_NAME = "ariadnev";

export interface DispatchOpts {
  /** The `<kit>/<skill>` positional. */
  ref: string;
  /** Everything after it, passed through to the skill. */
  args: string[];
  target?: string;
  /** `--timeout 30s | 2m | 500ms`. Absent or zero disables it. */
  timeout?: string;
  kitsDir?: string;
  cwd: string;
  home: string;
  json?: boolean;
  /** Injected by tests; production passes the real streams. */
  stdout?: (chunk: string) => void;
  stderr?: (chunk: string) => void;
  signal?: AbortSignal;
}

export interface DispatchResult {
  exitCode: number;
  /** The machine envelope, when `--json` asked for one. */
  output: string;
}

const DURATION = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/;

const UNIT_MS: Record<string, number> = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 };

/**
 * Parse `30s`, `2m`, `500ms`, or a bare number of seconds.
 *
 * A bare number means seconds rather than milliseconds because upstream's flag
 * is a Go duration and every example in its help is written in seconds or
 * minutes. Reading `--timeout 30` as 30ms would kill every run instantly, which
 * is a worse failure than the ambiguity is worth.
 */
export function parseTimeout(raw: string | undefined): number {
  if (raw === undefined || raw === "") return 0;
  const match = DURATION.exec(raw.trim());
  if (!match) throw new UsageError(`invalid --timeout ${JSON.stringify(raw)}: use a duration like 30s, 2m or 500ms`);
  return Math.round(Number(match[1]) * UNIT_MS[match[2] ?? "s"]);
}

/** `--kits-dir`, else `$ARIADNEV_KITS_DIR`, else `./kits`. */
export function kitsDirFor(opts: { cwd: string; kitsDir?: string }, env: NodeJS.ProcessEnv): string {
  return opts.kitsDir ?? env.ARIADNEV_KITS_DIR ?? join(opts.cwd, "kits");
}

function listDirs(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return [];
  }
}

function dirExists(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function resolveTarget(raw: string | undefined): ProviderId {
  const target = raw ?? DEFAULT_TARGET;
  if (!isProviderId(target)) {
    throw new UsageError(`unknown --target ${JSON.stringify(target)}`);
  }
  return target;
}

/**
 * The filesystem side of skill resolution.
 *
 * Exported because `av watch` dispatches skills too, and a second copy of this
 * object would be a second answer to "where do kits live" — the kind of drift
 * that shows up as one command finding a skill the other cannot.
 */
export function realResolveDeps(cwd: string, kitsDir: string): ResolveDeps {
  return {
    kitsDir,
    embedded: { name: EMBEDDED_KIT_NAME, root: getKitRoot(cwd) },
    dirExists,
    fileExists: (p) => existsSync(p),
    listKits: () => listDirs(kitsDir),
    listSkills: (kitRoot) => listDirs(join(kitRoot, "skills")),
  };
}

export async function runDispatch(opts: DispatchOpts, env: NodeJS.ProcessEnv = process.env): Promise<DispatchResult> {
  const ref = parseSkillRef(opts.ref);
  const target = resolveTarget(opts.target);
  const kitsDir = kitsDirFor(opts, env);

  const skill = resolveSkill(ref, realResolveDeps(opts.cwd, kitsDir));

  const invocation = invocationFor(target, skill, opts.args);
  const timeoutMs = parseTimeout(opts.timeout);

  // Recorded before the spawn, so a run that never returns still left a trace
  // of having started. That is the whole reason a started event exists
  // separately from a completed one.
  recordActivity(opts.home, "dispatch.started", {
    runtime: target,
    kit: ref.kit,
    skill: ref.skill,
  });

  const startedAt = Date.now();
  // `--json` promises NDJSON on stdout, so the child's own chatter cannot go
  // there: it would interleave with the envelope and break every parser. It
  // goes to stderr instead, where a human still sees it.
  const passthrough = opts.json ? (opts.stderr ?? ((c: string) => process.stderr.write(c))) : undefined;

  let outcome;
  try {
    outcome = await spawnStreaming({
      binary: invocation.binary,
      args: invocation.args,
      cwd: opts.cwd,
      env,
      timeoutMs,
      onStdout: passthrough ?? opts.stdout ?? ((c) => process.stdout.write(c)),
      onStderr: passthrough ?? opts.stderr ?? ((c) => process.stderr.write(c)),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
  } catch (error) {
    // The binary could not be started at all. That is an environment fact, not
    // a failed run, and it is the one case where naming the missing program is
    // the entire useful content of the error.
    recordActivity(opts.home, "dispatch.completed", {
      runtime: target,
      kit: ref.kit,
      skill: ref.skill,
      status: "failed",
      durationMs: Date.now() - startedAt,
    });
    throw new UnavailableError(
      `cannot dispatch to ${target}: ${invocation.binary} is not on PATH (${(error as Error).message})`,
    );
  }

  const durationMs = Date.now() - startedAt;
  const status = outcome.forced ?? (outcome.exitCode === EXIT.ok ? "ok" : "failed");
  recordActivity(opts.home, "dispatch.completed", {
    runtime: target,
    kit: ref.kit,
    skill: ref.skill,
    status,
    durationMs,
  });

  // The shared envelope, not a private one. `json-envelope.ts` records that
  // dispatch was deliberately left out of the legacy carve-out list: `run`
  // inherited the harness's name, not its frozen JSON shape.
  const output = opts.json
    ? jsonEnvelope(DISPATCH_SCHEMA_VERSION, "dispatch.result", {
        kit: ref.kit,
        skill: ref.skill,
        target,
        source: skill.source,
        exit_code: outcome.exitCode,
        status,
        escalated: outcome.escalated,
        duration_ms: durationMs,
      })
    : "";

  return { exitCode: outcome.exitCode, output };
}
