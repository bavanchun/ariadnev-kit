import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isDerived } from "../storage/operational-paths.js";
import {
  clearDaemonRecord,
  pidfilePath,
  processAlive,
  readDaemonRecord,
  writeDaemonRecord,
  type DaemonRecord,
} from "./daemon-state.js";

const dirs: string[] = [];
const mk = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-api-state-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const record = (over: Partial<DaemonRecord> = {}): DaemonRecord => ({
  pid: 4242,
  port: 8767,
  bind: "127.0.0.1",
  startedAt: "2026-08-29T04:00:00.000Z",
  version: "1.3.0",
  ...over,
});

describe("where the record lives", () => {
  it("is authoritative, not derived — nothing can rebuild a running daemon", () => {
    // If it sat under `derived/`, `av analytics delete` would remove the only
    // record of a process that is still listening.
    const home = mk();
    expect(isDerived(home, pidfilePath(home))).toBe(false);
    expect(pidfilePath(home)).toMatch(/operational[/\\]api[/\\]api\.pid$/);
  });
});

describe("writing and reading the record", () => {
  it("round-trips every field the lifecycle needs to prove identity", () => {
    const home = mk();
    writeDaemonRecord(home, record());
    expect(readDaemonRecord(home)).toEqual(record());
  });

  it("keeps the file private — it names a port a token may be guarding", () => {
    if (process.platform === "win32") return;
    const home = mk();
    writeDaemonRecord(home, record());
    expect(statSync(pidfilePath(home)).mode & 0o777).toBe(0o600);
  });

  it("reports nothing when no daemon has ever run here", () => {
    expect(readDaemonRecord(mk())).toBeNull();
  });

  it("treats an unparseable file as absent rather than crashing the command", () => {
    const home = mk();
    writeDaemonRecord(home, record());
    writeFileSync(pidfilePath(home), "{ not json");
    expect(readDaemonRecord(home)).toBeNull();
  });

  it("treats a truncated write as absent, not as a daemon to signal", () => {
    // Power lost mid-start: valid JSON, no pid. Trusting it would mean either
    // reporting a daemon that is not there or signalling `undefined`.
    const home = mk();
    writeDaemonRecord(home, record());
    writeFileSync(pidfilePath(home), `{"port":8767}`);
    expect(readDaemonRecord(home)).toBeNull();
  });

  it("overwrites rather than appending, so the newest daemon is the record", () => {
    const home = mk();
    writeDaemonRecord(home, record({ pid: 1 }));
    writeDaemonRecord(home, record({ pid: 2 }));
    expect(readDaemonRecord(home)?.pid).toBe(2);
    expect(JSON.parse(readFileSync(pidfilePath(home), "utf8"))).toBeTruthy();
  });

  it("clears without complaining when there is nothing to clear", () => {
    const home = mk();
    expect(() => clearDaemonRecord(home)).not.toThrow();
    writeDaemonRecord(home, record());
    clearDaemonRecord(home);
    expect(readDaemonRecord(home)).toBeNull();
  });
});

describe("deciding whether a pid is alive", () => {
  it("says yes for this very process", () => {
    expect(processAlive(process.pid)).toBe(true);
  });

  it("says no for a pid nothing can be running under", () => {
    // Kernel pid_max makes this unassignable on every platform the CLI targets.
    expect(processAlive(0x7fff_fffe)).toBe(false);
  });
});
