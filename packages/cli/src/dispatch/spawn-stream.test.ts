import { describe, expect, it } from "vitest";
import { groupAlive, spawnStreaming, type SpawnOutcome } from "./spawn-stream.js";

/**
 * Run a snippet of Node as the "adapter".
 *
 * A real interpreter rather than a fake, because every property under test here
 * is a property of an actual OS process: a stub that resolves a promise proves
 * nothing about whether a signal was delivered.
 */
function run(
  source: string,
  overrides: Partial<Parameters<typeof spawnStreaming>[0]> = {},
): { done: Promise<SpawnOutcome>; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  const done = spawnStreaming({
    binary: process.execPath,
    args: ["-e", source],
    cwd: process.cwd(),
    env: { ...process.env },
    timeoutMs: 0,
    graceMs: 250,
    onStdout: (chunk) => out.push(chunk),
    onStderr: (chunk) => err.push(chunk),
    ...overrides,
  });
  return { done, out, err };
}

/** Wait until `predicate` holds, or fail the test after `limitMs`. */
async function until(predicate: () => boolean, limitMs = 4000): Promise<void> {
  const deadline = Date.now() + limitMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("condition never held");
}

describe("streaming a dispatched process", () => {
  it("forwards stdout before the child exits", async () => {
    // The property is that output appears while the process is still running.
    // Asserting only on the collected output at the end would pass just as
    // happily against an implementation that buffered everything.
    const { done, out } = run("process.stdout.write('early\\n'); setTimeout(() => {}, 1500)");
    await until(() => out.join("").includes("early"));
    expect(out.join("")).toContain("early");
    await done;
  });

  it("keeps stdout and stderr apart", async () => {
    const { done, out, err } = run("process.stdout.write('O'); process.stderr.write('E')");
    await done;
    expect(out.join("")).toBe("O");
    expect(err.join("")).toBe("E");
  });

  it("does not lose output written just before exit", async () => {
    // Resolving on `exit` rather than `close` drops this tail.
    const { done, out } = run("process.stdout.write('x'.repeat(60000)); process.exit(0)");
    await done;
    expect(out.join("")).toHaveLength(60000);
  });
});

describe("propagating the child's exit code", () => {
  it.each([0, 1, 2, 42])("returns %i", async (code) => {
    const { done } = run(`process.exit(${code})`);
    expect((await done).exitCode).toBe(code);
  });

  it("reports a failure rather than inventing a 128+n code for a signalled child", async () => {
    const { done } = run("process.kill(process.pid, 'SIGKILL')");
    const outcome = await done;
    expect(outcome.exitCode).toBe(1);
  });

  it("rejects when the binary does not exist, rather than reporting a failed run", async () => {
    await expect(run("", { binary: "/nonexistent/adapter-binary" }).done).rejects.toThrow();
  });
});

describe("SIGINT reaches the child", () => {
  it("ends the run and reports it as cancelled", async () => {
    const controller = new AbortController();
    const { done, out } = run("process.stdout.write('up\\n'); setInterval(() => {}, 1000)", {
      signal: controller.signal,
    });
    await until(() => out.join("").includes("up"));
    controller.abort();
    const outcome = await done;
    expect(outcome.forced).toBe("cancelled");
  });

  it("leaves no orphan, including a grandchild the adapter spawned", async () => {
    // A coding agent spawns shells and servers of its own. Signalling only the
    // agent leaves those running, which is the failure mode that matters.
    const controller = new AbortController();
    const source = `
      const { spawn } = require('node:child_process');
      const kid = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      process.stdout.write(String(kid.pid) + '\\n');
      setInterval(() => {}, 1000);
    `;
    const { done, out } = run(source, { signal: controller.signal });
    await until(() => out.join("").includes("\n"));
    const grandchild = Number(out.join("").trim());
    expect(Number.isInteger(grandchild)).toBe(true);

    controller.abort();
    await done;

    await until(() => {
      try {
        process.kill(grandchild, 0);
        return false;
      } catch {
        return true;
      }
    });
  });
});

describe("the timeout escalates rather than hoping", () => {
  it("ends a run that outlives its timeout", async () => {
    const { done } = run("setInterval(() => {}, 1000)", { timeoutMs: 150 });
    expect((await done).forced).toBe("timeout");
  });

  it("kills a child that traps SIGTERM and refuses to leave", async () => {
    // The whole reason the grace timer exists. Without escalation this hangs.
    const source = "process.on('SIGTERM', () => {}); process.stdout.write('armed\\n'); setInterval(() => {}, 1000)";
    const { done, out } = run(source, { timeoutMs: 150, graceMs: 200 });
    await until(() => out.join("").includes("armed"));
    const outcome = await done;
    expect(outcome.forced).toBe("timeout");
    expect(outcome.escalated, "the process ignored TERM and was not escalated to KILL").toBe(true);
  });

  it("leaves no orphan after escalating to KILL", async () => {
    // The SIGINT path and the timeout path tear down through the same code but
    // arrive by different routes, and only one of them can be exercised by the
    // other's test. A grandchild is what makes the assertion real.
    const source = `
      const { spawn } = require('node:child_process');
      const kid = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      process.stdout.write(String(kid.pid) + '\\n');
      process.on('SIGTERM', () => {});
      setInterval(() => {}, 1000);
    `;
    const { done, out } = run(source, { timeoutMs: 150, graceMs: 200 });
    await until(() => out.join("").includes("\n"));
    const grandchild = Number(out.join("").trim());

    expect((await done).escalated).toBe(true);
    await until(() => {
      try {
        process.kill(grandchild, 0);
        return false;
      } catch {
        return true;
      }
    });
  });

  it("treats a zero timeout as no timeout", async () => {
    const { done } = run("setTimeout(() => process.exit(7), 300)", { timeoutMs: 0 });
    expect((await done).forced).toBeNull();
  });

  it("does not force a run that finishes inside its timeout", async () => {
    const { done } = run("process.exit(3)", { timeoutMs: 5000 });
    const outcome = await done;
    expect(outcome.forced).toBeNull();
    expect(outcome.exitCode).toBe(3);
  });
});

describe("group liveness", () => {
  it("reports a dead group as dead", () => {
    // A pid that cannot exist. Used by the teardown path, so it has to be
    // total rather than throwing.
    expect(groupAlive(0x7fffffff)).toBe(false);
  });
});
