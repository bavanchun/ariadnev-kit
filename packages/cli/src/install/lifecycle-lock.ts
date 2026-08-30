// An advisory lock so two mutating commands cannot interleave.
//
// The threat is one person racing themselves — two terminals, or a shell script
// that does not wait. Small, and worth having because the losing outcome is a
// half-written provider tree that no receipt describes.
//
// `fs.openSync(path, "wx")` is the primitive: atomic create-if-absent, and
// portable. `flock()` is not, without a native dependency this cannot take —
// the CLI ships as one Bun-compiled binary for five targets including
// windows-x64. (`src/skill-env/lockfile.ts` is unrelated despite the name: it
// is a PEP-508 dependency pin.)

import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { EXIT, UnavailableError } from "../cli/exit-codes.js";
import { jsonEnvelope } from "../cli/json-envelope.js";

/**
 * How long a lock may be held before the age is worth mentioning.
 *
 * Only ever used to make the message specific. A lock past this age whose owner
 * is alive is still refused, never broken.
 */
export const LOCK_AGE_CEILING_MS = 15 * 60 * 1000;

export const UNLOCK_SCHEMA_VERSION = 1;

export function lockPathFor(root: string): string {
  return join(resolve(root), ".ariadnev", "locks", "lifecycle.lock");
}

interface LockBody {
  pid: number;
  startedAt: string;
  command: string;
}

/**
 * The owner recorded in a lock file, or `null` when the file cannot be believed.
 *
 * For project scope the file sits at `<cwd>/.ariadnev/locks/`, inside whatever
 * repository was cloned, so every field here is attacker-chosen. `null` means
 * "treat as stale" — the alternative, trusting it, hands anyone who can commit
 * a file the ability to brick every mutating command in that directory.
 */
function readOwner(path: string): LockBody | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const { pid, startedAt, command } = parsed as Record<string, unknown>;
  // A pid must be a whole positive number that a signal can name. `-1` targets a
  // process *group*; `1e400` is `Infinity`; `"x"` is not a number at all. Node
  // throws `ERR_INVALID_ARG_TYPE`/`ERR_OUT_OF_RANGE` for those rather than
  // `ESRCH`, so a handler that only catches `ESRCH` lets them out as a crash.
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) return null;
  // Pid 1 is init/launchd on every platform this ships to, so it is never an
  // ariadnev process — but `process.kill(1, 0)` answers EPERM for an ordinary
  // user, which reads as alive. A lock naming it would never go stale and would
  // brick every mutating command in that directory, permanently.
  //
  // This is the limit of a pid-based check, and it is worth stating plainly: a
  // lock naming any *other* live pid is equally unfalsifiable. Two things keep
  // that from mattering — `.ariadnev/` is gitignored, so committing one takes a
  // deliberate `git add -f`, and `ariadnev unlock` clears it in one command.
  if (pid === 1) return null;
  if (typeof startedAt !== "string") return null;
  const started = Date.parse(startedAt);
  // A future timestamp never exceeds any ceiling, so an age check alone could
  // never clear it.
  if (Number.isNaN(started) || started > Date.now()) return null;
  return { pid, startedAt, command: typeof command === "string" ? command : "unknown" };
}

/** True when `pid` names a process that exists and this user may signal. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means it exists and belongs to someone else — alive. Anything else,
    // including the argument errors a hostile pid produces, is not a live owner.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function heldMessage(root: string, owner: LockBody): string {
  const minutes = Math.round((Date.now() - Date.parse(owner.startedAt)) / 60_000);
  const age = minutes >= 1 ? ` held for ${minutes}m` : " just started";
  return (
    `another ariadnev command is running: ${owner.command}${age} by pid ${owner.pid} (${root})\n` +
    "  wait for it to finish, or run `ariadnev unlock` if you are sure it is gone"
  );
}

/**
 * Take one lock, or throw.
 *
 * A stale lock — one whose file cannot be believed, or whose owner is gone — is
 * removed and the create retried exactly once. A lock whose owner is alive is
 * refused whatever its age: an earlier design broke those past a ceiling, which
 * would let a second process start a concurrent binary replace behind a slow
 * download. That is the lock causing the corruption it exists to prevent.
 */
function acquireOne(root: string, command: string): void {
  const path = lockPathFor(root);
  mkdirSync(dirname(path), { recursive: true });
  const body = JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), command });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(path, "wx");
      writeSync(fd, body);
      closeSync(fd);
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
    const owner = readOwner(path);
    if (owner !== null && alive(owner.pid)) throw new UnavailableError(heldMessage(root, owner));
    // Unbelievable, or owned by a process that is gone.
    rmSync(path, { force: true });
  }
  // Lost the retry to a third process that took it in between. Refusing is
  // right: something else is demonstrably active here.
  throw new UnavailableError(`could not take the ariadnev lock at ${path} — another command took it first`);
}

/** Drop the locks this process holds. Never removes one belonging to someone else. */
export function releaseLifecycleLock(roots: string[]): void {
  for (const root of roots) {
    const path = lockPathFor(root);
    const owner = readOwner(path);
    if (owner !== null && owner.pid !== process.pid) continue;
    rmSync(path, { force: true });
  }
}

/**
 * Run `fn` holding a lock on every root it will write.
 *
 * **Async on purpose.** Two of the wrapped command bodies are `async`; a
 * synchronous wrapper around one returns a pending promise and runs its
 * `finally` immediately, releasing the lock microseconds in and leaving the
 * longest-running command unguarded.
 *
 * `roots` is every physical root the resolved plan targets, not the scope root.
 * Codex resolves to `ctx.home` at every scope, so two project installs in
 * different directories both write `~/.agents/skills` — locking the scope root
 * alone would let them run concurrently, one healing while the other writes.
 */
export async function withLifecycleLock<T>(
  roots: string[],
  command: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  const unique = [...new Set(roots.map((root) => resolve(root)))].sort();
  const taken: string[] = [];
  try {
    for (const root of unique) {
      acquireOne(root, command);
      taken.push(root);
    }
  } catch (err) {
    // All or nothing. A half-taken set would leave a lock nobody releases.
    releaseLifecycleLock(taken);
    throw err;
  }
  try {
    return await fn();
  } finally {
    releaseLifecycleLock(unique);
  }
}

/**
 * The roots a mutating command must lock.
 *
 * Both, always — not the scope root. Codex resolves to `ctx.home` at every
 * scope, so a *project* install writes home paths; `install-execute.ts` sets
 * `allowedRoots = [home, cwd]` for exactly that reason. Two project installs in
 * different directories would otherwise take two different locks and both write
 * `~/.agents/skills`, one healing while the other writes.
 *
 * Deriving the set from a resolved plan would be tighter, and would mean
 * planning twice to find out. Taking both is never wrong; the cost is a rare
 * false contention between two ariadnev commands running at once, which is the
 * situation this exists for.
 */
export function lifecycleRoots(ctx: { home: string; cwd: string }): string[] {
  return [ctx.home, ctx.cwd];
}

/**
 * The extra roots a purge needs: every registered project it will visit.
 *
 * `lifecycleRoots` is `[home, cwd]`, which is exactly right for a command that
 * writes inside its own scope. Purge writes inside other people's projects, and
 * a lock that does not name them serializes nothing there — two purges, or a
 * purge and an `av install` in one of those directories, would run straight
 * through each other. Same reasoning that gave `update` `executableRoot`.
 */
export function projectRoots(dirs: readonly string[]): string[] {
  return [...new Set(dirs.map((dir) => resolve(dir)))];
}

/**
 * The extra root `update` needs: it replaces `process.execPath`, one file shared
 * by every project and outside every scope root. Two `av update` runs in
 * different directories are otherwise entirely unserialized.
 */
export function executableRoot(execPath: string): string {
  return dirname(execPath);
}

export interface UnlockOpts {
  roots: string[];
  json?: boolean;
}

/**
 * The escape hatch. Refusing rather than stealing means a leaked lock needs a
 * deliberate command to clear, and this is it — reported precisely enough that
 * the user can tell a leak from a command still running.
 */
export function runUnlock(opts: UnlockOpts): { output: string; exitCode: typeof EXIT.ok } {
  const removed: { root: string; pid: number | null; command: string | null }[] = [];
  for (const root of [...new Set(opts.roots.map((r) => resolve(r)))].sort()) {
    const path = lockPathFor(root);
    if (!existsSync(path)) continue;
    const owner = readOwner(path);
    removed.push({ root, pid: owner?.pid ?? null, command: owner?.command ?? null });
    rmSync(path, { force: true });
  }
  if (opts.json) {
    return { output: jsonEnvelope(UNLOCK_SCHEMA_VERSION, "unlock.clear", { removed }), exitCode: EXIT.ok };
  }
  if (removed.length === 0) return { output: "ariadnev unlock — no lock to clear", exitCode: EXIT.ok };
  const lines = [`ariadnev unlock — removed ${removed.length} lock(s)`];
  for (const entry of removed) {
    lines.push(`  ${entry.root}${entry.pid === null ? "" : `  (was ${entry.command}, pid ${entry.pid})`}`);
  }
  return { output: lines.join("\n"), exitCode: EXIT.ok };
}
