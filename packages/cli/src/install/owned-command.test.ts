// A command that points into our install directory has to be recognised as ours
// on every platform, not just the one the tests happen to run on.

import { describe, expect, it } from "vitest";
import { win32, posix } from "node:path";
import { commandOwnedBy } from "./owned-command.js";

const posixDir = posix.join("/home/u/.codex/hooks", "av");
const winDir = win32.join("C:\\Users\\u\\.codex\\hooks", "av");

/** How install-plan.ts builds a hook command: the path is JSON-encoded. */
const planned = (dir: string, file: string, ...args: string[]): string =>
  [`node ${JSON.stringify(`${dir}${dir.includes("\\") ? "\\" : "/"}${file}`)}`, ...args].join(" ");

describe("recognising a command as one we installed", () => {
  it("matches a posix command built by the install plan", () => {
    expect(commandOwnedBy(planned(posixDir, "session-init.cjs"), posixDir)).toBe(true);
  });

  it("matches a windows command, whose separators the encoding doubled", () => {
    // `C:\Users\u\.codex\hooks\av` never appears literally in
    // `node "C:\\Users\\u\\.codex\\hooks\\av\\session-init.cjs"`, so comparing
    // the directory as spelled would call our own hook a stranger's.
    const command = planned(winDir, "session-init.cjs");
    expect(command).not.toContain(winDir);
    expect(commandOwnedBy(command, winDir)).toBe(true);
  });

  it("still matches when the command carries arguments after the path", () => {
    expect(commandOwnedBy(planned(winDir, "av-statusline.cjs", "--padding", "0"), winDir)).toBe(true);
  });

  it("matches a path written by hand, without the encoding", () => {
    expect(commandOwnedBy(`node ${winDir}\\session-init.cjs`, winDir)).toBe(true);
  });

  it("does not claim another tool's command", () => {
    expect(commandOwnedBy('/bin/sh "/home/u/.orca/agent-hooks/codex-hook.sh"', posixDir)).toBe(false);
    expect(commandOwnedBy(planned(win32.join("C:\\Users\\u\\.codex\\hooks", "orca"), "x.cjs"), winDir)).toBe(false);
  });

  it("claims nothing at all when the owned directory is empty", () => {
    // Every string contains "", so the permissive answer here would make an
    // uninstall delete three other tools' hooks out of a shared file.
    expect(commandOwnedBy('node "/anything"', "")).toBe(false);
  });
});
