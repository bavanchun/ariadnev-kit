// The lock's tests come before the lock, because every way this goes wrong
// produces a lock that reports success and protects nothing — and a test suite
// that only exercises the synchronous, single-root, well-formed case passes
// against all of them.
//
// Each `describe` below names one of those ways.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { buildProgram } from "../index.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LOCK_AGE_CEILING_MS,
  lockPathFor,
  releaseLifecycleLock,
  runUnlock,
  withLifecycleLock,
} from "./lifecycle-lock.js";
import { EXIT } from "../cli/exit-codes.js";

let sandbox: string;
let rootA: string;
let rootB: string;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "ariadnev-lock-"));
  rootA = join(sandbox, "a");
  rootB = join(sandbox, "b");
  mkdirSync(rootA, { recursive: true });
  mkdirSync(rootB, { recursive: true });
});
afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

/** Plant a lock file directly, the way a foreign process would leave one. */
function plant(root: string, body: unknown): string {
  const path = lockPathFor(root);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, typeof body === "string" ? body : JSON.stringify(body));
  return path;
}

const live = (extra: Record<string, unknown> = {}) => ({
  pid: process.pid,
  startedAt: new Date().toISOString(),
  command: "install",
  ...extra,
});

describe("holding the lock across an await", () => {
  /**
   * A synchronous wrapper around an async body returns a pending promise and
   * runs its `finally` immediately, releasing the lock microseconds in and
   * leaving the longest-running command — the one actually worth locking —
   * completely unguarded. This is the case that makes the wrapper async.
   */
  it("keeps the lock file present until the awaited work finishes", async () => {
    let observedMidFlight = false;
    await withLifecycleLock([rootA], "install", async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      observedMidFlight = existsSync(lockPathFor(rootA));
    });
    expect(observedMidFlight, "the lock must still be held inside the await").toBe(true);
    expect(existsSync(lockPathFor(rootA))).toBe(false);
  });

  it("releases the lock when the wrapped command throws", async () => {
    await expect(
      withLifecycleLock([rootA], "install", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(existsSync(lockPathFor(rootA))).toBe(false);
  });
});

describe("the roots a command actually writes", () => {
  /**
   * The case the design's first draft missed. Codex resolves to `ctx.home` at
   * every scope, so `av install` in two different project directories takes two
   * different scope locks and both write `~/.agents/skills/av-*`. With the heal
   * in place one deletes while the other writes. Locking every root the plan
   * targets — not the scope root — is what makes them contend.
   */
  it("makes two different project roots contend when both also write home", async () => {
    const home = join(sandbox, "home");
    mkdirSync(home, { recursive: true });

    await withLifecycleLock([rootA, home], "install", async () => {
      await expect(withLifecycleLock([rootB, home], "install", async () => "ran")).rejects.toMatchObject({
        exitCode: EXIT.unavailable,
      });
    });
    // Both are free again once the first finishes.
    await expect(withLifecycleLock([rootB, home], "install", async () => "ran")).resolves.toBe("ran");
  });

  it("takes every root or none, leaving nothing half-locked", async () => {
    plant(rootB, live());
    await expect(withLifecycleLock([rootA, rootB], "install", async () => "ran")).rejects.toMatchObject({
      exitCode: EXIT.unavailable,
    });
    expect(existsSync(lockPathFor(rootA)), "the root it did get must be given back").toBe(false);
  });

  it("locks a root only once when it appears twice", async () => {
    await expect(withLifecycleLock([rootA, rootA], "install", async () => "ran")).resolves.toBe("ran");
  });
});

describe("a lock file left by someone else", () => {
  it("fails fast with exit 3 and touches nothing while a live process holds it", async () => {
    plant(rootA, live());
    let bodyRan = false;
    await expect(
      withLifecycleLock([rootA], "install", async () => {
        bodyRan = true;
      }),
    ).rejects.toMatchObject({ exitCode: EXIT.unavailable });
    expect(bodyRan).toBe(false);
  });

  it("recovers a lock whose pid is dead", async () => {
    // 0x7FFFFFFF is above every platform's pid ceiling, so nothing owns it.
    plant(rootA, { pid: 0x7fffffff, startedAt: new Date().toISOString(), command: "install" });
    await expect(withLifecycleLock([rootA], "install", async () => "ran")).resolves.toBe("ran");
  });

  /**
   * Reported, never stolen. An earlier design silently overrode a lock past the
   * ceiling whose pid was provably alive — so a slow download or a paused
   * interactive install would let a second process start a concurrent binary
   * replace. That is the lock causing the corruption it exists to prevent.
   */
  it("reports a live lock past the age ceiling instead of stealing it", async () => {
    plant(rootA, live({ startedAt: new Date(Date.now() - LOCK_AGE_CEILING_MS - 60_000).toISOString() }));
    const err = await withLifecycleLock([rootA], "install", async () => "ran").catch((e: unknown) => e as Error);
    expect((err as unknown as { exitCode?: number }).exitCode).toBe(EXIT.unavailable);
    expect((err as Error).message).toMatch(/held for/);
    expect((err as Error).message).toContain("ariadnev unlock");
    expect(existsSync(lockPathFor(rootA)), "a lock it refused must survive").toBe(true);
  });
});

describe("the lock file is untrusted input", () => {
  // For project scope it lives at `<cwd>/.ariadnev/locks/`, inside a repository,
  // so it can be committed. Both staleness checks read attacker-chosen values.
  const hostile: [string, unknown][] = [
    // `process.kill(1, 0)` succeeds for anyone, so this is never stale — it
    // would brick every mutating command in that directory, permanently.
    ["pid 1, which always looks alive", { pid: 1, startedAt: new Date().toISOString() }],
    // These throw ERR_INVALID_ARG_TYPE / ERR_OUT_OF_RANGE, not ESRCH. An
    // ESRCH-only handler lets them escape as a stack trace.
    ["a pid that is not a number", { pid: "x", startedAt: new Date().toISOString() }],
    ["a pid too large for a signal", { pid: 1e400, startedAt: new Date().toISOString() }],
    // A negative pid targets a process *group*.
    ["a negative pid", { pid: -1, startedAt: new Date().toISOString() }],
    ["a fractional pid", { pid: 12.5, startedAt: new Date().toISOString() }],
    // Never exceeds any ceiling, so an age check alone can never clear it.
    ["a startedAt in the future", { pid: 1, startedAt: new Date(Date.now() + 86_400_000).toISOString() }],
    ["an unparseable startedAt", { pid: 1, startedAt: "whenever" }],
    ["no startedAt at all", { pid: 1 }],
    ["malformed JSON", "{not json"],
    ["an empty file", ""],
    ["a JSON array", [1, 2, 3]],
    ["null", null],
  ];

  for (const [name, body] of hostile) {
    it(`treats ${name} as stale rather than letting it through`, async () => {
      plant(rootA, body);
      await expect(withLifecycleLock([rootA], "install", async () => "ran")).resolves.toBe("ran");
    });
  }

  it("keeps a live lock held by this process, which is the one shape that is real", async () => {
    plant(rootA, live());
    await expect(withLifecycleLock([rootA], "install", async () => "ran")).rejects.toMatchObject({
      exitCode: EXIT.unavailable,
    });
  });
});

describe("what the lock records", () => {
  it("names the pid and the command, so the report can be specific", async () => {
    await withLifecycleLock([rootA], "uninstall", async () => {
      const body = JSON.parse(readFileSync(lockPathFor(rootA), "utf8")) as { pid: number; command: string };
      expect(body.pid).toBe(process.pid);
      expect(body.command).toBe("uninstall");
    });
  });
});

describe("av unlock", () => {
  it("clears a lock and says what it cleared", () => {
    plant(rootA, live());
    const result = runUnlock({ roots: [rootA] });
    expect(result.exitCode).toBe(EXIT.ok);
    expect(result.output).toContain("removed");
    expect(existsSync(lockPathFor(rootA))).toBe(false);
  });

  it("is not an error when there is nothing to clear", () => {
    const result = runUnlock({ roots: [rootA] });
    expect(result.exitCode).toBe(EXIT.ok);
    expect(result.output).toContain("no lock");
  });

  it("emits the envelope under --json", () => {
    plant(rootA, live());
    const parsed = JSON.parse(runUnlock({ roots: [rootA], json: true }).output) as { kind: string };
    expect(parsed.kind).toBe("unlock.clear");
  });
});

describe("releaseLifecycleLock", () => {
  it("does not remove a lock this process does not hold", () => {
    plant(rootA, { pid: 4242, startedAt: new Date().toISOString(), command: "install" });
    releaseLifecycleLock([rootA]);
    expect(existsSync(lockPathFor(rootA)), "another process's lock is not ours to drop").toBe(true);
  });
});

describe("a real command against a held lock", () => {
  /**
   * The unit tests above prove the primitive. This proves it is wired to the
   * command that needs it — the failure mode for the whole phase is a lock that
   * works perfectly and is never taken. Driven through the real Commander tree,
   * so the wiring under test is the wiring that ships.
   */
  // `from: "user"` means argv holds only the user's words — no node, no script.
  // `exitOverride` makes Commander throw instead of calling `process.exit`,
  // which vitest refuses.
  const run = (argv: string[]) => {
    const program = buildProgram();
    program.exitOverride();
    for (const cmd of program.commands) cmd.exitOverride();
    return program.parseAsync(argv, { from: "user" });
  };

  function sandboxRoots(): { home: string; cwd: string } {
    const home = join(sandbox, "home");
    const cwd = join(sandbox, "proj");
    mkdirSync(home, { recursive: true });
    mkdirSync(cwd, { recursive: true });
    return { home, cwd };
  }

  it("refuses install with exit 3 and writes nothing", async () => {
    const { home, cwd } = sandboxRoots();
    plant(cwd, live());

    const err = await run([
      "--home", home, "--cwd", cwd, "--yes",
      "install", "--provider", "claude-code",
    ]).then(() => null, (e: unknown) => e as Error);

    expect((err as unknown as { exitCode?: number })?.exitCode).toBe(EXIT.unavailable);
    expect(err?.message).toContain("another ariadnev command is running");
    expect(existsSync(join(cwd, ".ariadnev", "receipt.json")), "nothing may be written").toBe(false);
    expect(existsSync(join(cwd, ".claude")), "nothing may be written").toBe(false);
  }, 60_000);

  // `--dry-run` writes nothing, so blocking it would only take away the command
  // someone runs to find out what an install would do.
  it("lets --dry-run through a held lock", async () => {
    const { home, cwd } = sandboxRoots();
    plant(cwd, live());

    await expect(
      run(["--home", home, "--cwd", cwd, "--yes", "--dry-run", "install", "--provider", "claude-code"]),
    ).resolves.toBeDefined();
    expect(existsSync(join(cwd, ".ariadnev", "receipt.json"))).toBe(false);
  }, 60_000);

  // Read-only commands must stay usable during an install — they are what
  // someone reaches for to find out what is going on.
  it("lets a read-only command through a held lock", async () => {
    const { home, cwd } = sandboxRoots();
    plant(cwd, live());
    await expect(run(["--home", home, "--cwd", cwd, "list", "--json"])).resolves.toBeDefined();
  }, 60_000);
});
