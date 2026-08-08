import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import process from "node:process";
import type { BehavioralLauncher, BehavioralLaunchResult } from "./behavioral-runner.js";

const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
const DEFAULT_TERMINATION_GRACE_MS = 1_000;
const SAFE_ENVIRONMENT_KEYS = [
  "PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "ComSpec", "COMSPEC", "WINDIR",
  "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL", "LC_CTYPE", "TZ", "NO_COLOR",
] as const;
const CREDENTIAL_ENVIRONMENT_KEYS = new Set(["CODEX_HOME"]);

export type BehavioralCredentialEnvironment = "CODEX_HOME";

export interface BehavioralProcessOptions {
  executable: string;
  args?: string[];
  sourceEnvironment?: NodeJS.ProcessEnv;
  credentialEnvironment?: BehavioralCredentialEnvironment[];
  runnerHome?: string;
  maxOutputBytes?: number;
  terminationGraceMs?: number;
}

export function createBehavioralProcessEnvironment(
  source: NodeJS.ProcessEnv,
  credentialEnvironment: readonly string[] = [],
): NodeJS.ProcessEnv {
  const selected = new Set<string>(SAFE_ENVIRONMENT_KEYS);
  for (const key of credentialEnvironment) {
    if (!CREDENTIAL_ENVIRONMENT_KEYS.has(key)) throw new Error(`behavioral credential environment is unsupported: ${key}`);
    selected.add(key);
  }
  const environment: NodeJS.ProcessEnv = {};
  for (const key of selected) {
    const value = source[key];
    if (typeof value === "string") environment[key] = value;
  }
  return environment;
}

export function windowsTreeKillArgs(pid: number, force: boolean): string[] {
  return ["/PID", String(pid), "/T", ...(force ? ["/F"] : [])];
}

function signalTree(child: ChildProcessWithoutNullStreams, force: boolean): void {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", windowsTreeKillArgs(child.pid, force), { stdio: "ignore", windowsHide: true });
    return;
  }
  process.kill(-child.pid, force ? "SIGKILL" : "SIGTERM");
}

function signalTreeBestEffort(child: ChildProcessWithoutNullStreams, force: boolean): void {
  try {
    signalTree(child, force);
  } catch {
    try {
      child.kill(force ? "SIGKILL" : "SIGTERM");
    } catch {
      // The process exited between the group signal and direct fallback.
    }
  }
}

export function createBehavioralProcessLauncher(options: BehavioralProcessOptions): BehavioralLauncher {
  if (!options.executable.trim()) throw new Error("behavioral executable is required");
  const maxBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new Error("maxOutputBytes must be a positive integer");
  const terminationGraceMs = options.terminationGraceMs ?? DEFAULT_TERMINATION_GRACE_MS;
  if (!Number.isInteger(terminationGraceMs) || terminationGraceMs < 1) {
    throw new Error("terminationGraceMs must be a positive integer");
  }
  const environment = createBehavioralProcessEnvironment(
    options.sourceEnvironment ?? process.env,
    options.credentialEnvironment,
  );
  let runnerHome: string | undefined;
  if (options.runnerHome !== undefined) {
    if (!isAbsolute(options.runnerHome)) throw new Error("behavioral runner home must be absolute");
    runnerHome = realpathSync(options.runnerHome);
    if (!statSync(runnerHome).isDirectory()) throw new Error("behavioral runner home must be a directory");
    const ambientHome = options.sourceEnvironment?.HOME ?? options.sourceEnvironment?.USERPROFILE
      ?? process.env.HOME ?? process.env.USERPROFILE;
    if (ambientHome && existsSync(ambientHome) && realpathSync(ambientHome) === runnerHome) {
      throw new Error("behavioral runner home must not be the ambient user home");
    }
    if (!existsSync(join(runnerHome, ".vcskill", "receipt.json"))) {
      throw new Error("behavioral runner home must contain a vcskill install receipt");
    }
  }
  return {
    launch(input, signal): Promise<BehavioralLaunchResult> {
      if (signal.aborted) return Promise.resolve({ kind: "crashed", signal: "SIGTERM" });
      return new Promise((resolve) => {
        const child = spawn(options.executable, options.args ?? [], {
          cwd: input.workspaceRoot,
          env: {
            ...environment,
            HOME: runnerHome ?? input.workspaceRoot,
            USERPROFILE: runnerHome ?? input.workspaceRoot,
          },
          detached: process.platform !== "win32",
          stdio: ["pipe", "pipe", "pipe"],
          shell: false,
        });
        const output: Buffer[] = [];
        let bytes = 0;
        let malformed = false;
        let settled = false;
        let terminating = false;
        let graceElapsed = false;
        let closedResult: BehavioralLaunchResult | undefined;
        let hardStop: ReturnType<typeof setTimeout> | undefined;
        const done = (result: BehavioralLaunchResult) => {
          if (settled) return;
          settled = true;
          if (hardStop) clearTimeout(hardStop);
          signal.removeEventListener("abort", abort);
          resolve(result);
        };
        const terminate = () => {
          if (terminating) return;
          terminating = true;
          signalTreeBestEffort(child, false);
          hardStop = setTimeout(() => {
            graceElapsed = true;
            signalTreeBestEffort(child, true);
            if (closedResult) done(closedResult);
          }, terminationGraceMs);
        };
        const settleAfterCleanup = (result: BehavioralLaunchResult) => {
          if (terminating && !graceElapsed) {
            closedResult = result;
            return;
          }
          if (!terminating) signalTreeBestEffort(child, true);
          done(result);
        };
        const abort = () => terminate();
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
        child.stdout.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > maxBytes) {
            malformed = true;
            terminate();
          } else output.push(chunk);
        });
        child.stderr.resume();
        child.once("error", (error: NodeJS.ErrnoException) => {
          settleAfterCleanup(error.code === "ENOENT" ? { kind: "unavailable" } : { kind: "crashed" });
        });
        child.once("close", (code, childSignal) => {
          if (malformed) settleAfterCleanup({ kind: "malformed" });
          else if (code === 0) settleAfterCleanup({ kind: "completed", output: Buffer.concat(output).toString("utf8") });
          else settleAfterCleanup({
            kind: "crashed",
            ...(typeof code === "number" && code >= 0 ? { exitCode: code } : {}),
            ...(childSignal ? { signal: childSignal } : {}),
          });
        });
        child.stdin.on("error", () => undefined);
        child.stdin.end(input.prompt);
      });
    },
  };
}
