import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeDaemonRecord, type DaemonRecord } from "../api/daemon-state.js";
import type { LifecycleDeps } from "../api/daemon-lifecycle.js";
import { openerFor, runGui, type GuiOpts } from "./gui-command.js";

const dirs: string[] = [];
const mk = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-gui-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const record: DaemonRecord = {
  pid: 4242,
  port: 8767,
  bind: "127.0.0.1",
  startedAt: "2026-08-29T04:00:00.000Z",
  version: "1.3.0",
};

function opts(home: string, over: Partial<GuiOpts> = {}): GuiOpts {
  return { home, cwd: home, version: "1.3.0", env: {}, execPath: "/nowhere/av", argv: ["/nowhere/av"], ...over };
}

function deps(): LifecycleDeps {
  let clock = 0;
  return {
    probeHealth: () => Promise.resolve({ pid: 4242, version: "1.3.0", startedAt: "" }),
    sleep: (ms) => {
      clock += ms;
      return Promise.resolve();
    },
    signal: () => true,
    alive: () => true,
    now: () => clock,
  };
}

describe("picking the platform's opener", () => {
  it("uses each platform's own command", () => {
    expect(openerFor("darwin")).toEqual({ command: "open", args: [] });
    expect(openerFor("linux")).toEqual({ command: "xdg-open", args: [] });
  });

  it("passes an empty title to Windows `start`, or the URL becomes one", () => {
    // `cmd /c start "http://…"` opens a console window titled with the URL and
    // navigates nowhere. The empty string is the title argument.
    expect(openerFor("win32")).toEqual({ command: "cmd", args: ["/c", "start", ""] });
  });
});

describe("av gui", () => {
  it("opens the daemon's own URL once the daemon is up", async () => {
    const home = mk();
    writeDaemonRecord(home, record);
    const opened: string[] = [];
    const result = await runGui(opts(home), deps(), (url) => {
      opened.push(url);
      return true;
    });
    expect(opened).toEqual(["http://127.0.0.1:8767/"]);
    expect(result.output).toMatch(/opening http:\/\/127\.0\.0\.1:8767\//);
  });

  it("does not start a second daemon just because a dashboard was asked for", async () => {
    const home = mk();
    writeDaemonRecord(home, record);
    const result = await runGui(opts(home), deps(), () => true);
    expect(result.output).toMatch(/already running/);
  });

  it("prints the URL and launches nothing under --no-open", async () => {
    const home = mk();
    writeDaemonRecord(home, record);
    let launched = false;
    const result = await runGui(opts(home, { noOpen: true }), deps(), () => (launched = true));
    expect(launched).toBe(false);
    expect(result.output).toMatch(/dashboard at http:\/\/127\.0\.0\.1:8767\//);
  });

  it("still gives the user the URL when there is no browser to launch", async () => {
    // A headless box is the expected case, not an error. What must never happen
    // is the command claiming success and leaving nothing to click.
    const home = mk();
    writeDaemonRecord(home, record);
    const result = await runGui(opts(home), deps(), () => false);
    expect(result.output).toMatch(/dashboard at http:\/\/127\.0\.0\.1:8767\//);
    expect(result.output).toMatch(/no browser opener on this system/);
  });

  it("reports the URL and whether it opened, in JSON", async () => {
    const home = mk();
    writeDaemonRecord(home, record);
    const result = await runGui(opts(home, { json: true }), deps(), () => true);
    expect(JSON.parse(result.output)).toMatchObject({
      kind: "gui.open",
      data: { url: "http://127.0.0.1:8767/", opened: true, running: true },
    });
  });

  it("points at no download endpoint — ariadnev operates none", async () => {
    // Upstream's `gui`, built without assets, tells the user to fetch a desktop
    // app from a vendor site. Reproducing that here would ship a dead link as a
    // success path.
    const home = mk();
    writeDaemonRecord(home, record);
    const result = await runGui(opts(home), deps(), () => true);
    expect(result.output).not.toMatch(/download|\.app|https:\/\/(?!127)/i);
  });
});
