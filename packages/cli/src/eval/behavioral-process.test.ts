import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createBehavioralProcessEnvironment,
  createBehavioralProcessLauncher,
  windowsTreeKillArgs,
} from "./behavioral-process.js";

const roots: string[] = [];
function workspace() {
  const root = mkdtempSync(join(tmpdir(), "vcskill-process-"));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("createBehavioralProcessLauncher", () => {
  it("uses Windows tree termination arguments", () => {
    expect(windowsTreeKillArgs(42, false)).toEqual(["/PID", "42", "/T"]);
    expect(windowsTreeKillArgs(42, true)).toEqual(["/PID", "42", "/T", "/F"]);
  });

  it("passes only portable bootstrap variables and explicitly selected provider credentials", async () => {
    const root = workspace();
    const launcher = createBehavioralProcessLauncher({
      executable: process.execPath,
      args: ["-e", "process.stdout.write(JSON.stringify(process.env))"],
      sourceEnvironment: {
        PATH: process.env.PATH,
        CODEX_HOME: "/isolated/codex",
        GH_TOKEN: "must-not-leak",
        OPENAI_API_KEY: "must-not-leak",
        NODE_OPTIONS: "--require=/must-not-run.cjs",
      },
      credentialEnvironment: ["CODEX_HOME"],
    });
    const result = await launcher.launch({ prompt: "", workspaceRoot: root }, new AbortController().signal);
    expect(result.kind).toBe("completed");
    const environment = JSON.parse(result.kind === "completed" ? String(result.output) : "{}") as NodeJS.ProcessEnv;
    expect(environment).toMatchObject({ HOME: root, USERPROFILE: root, CODEX_HOME: "/isolated/codex" });
    expect(environment).not.toHaveProperty("GH_TOKEN");
    expect(environment).not.toHaveProperty("OPENAI_API_KEY");
    expect(environment).not.toHaveProperty("NODE_OPTIONS");
  });

  it("rejects unreviewed credential environment keys", () => {
    expect(() => createBehavioralProcessEnvironment({ GH_TOKEN: "secret" }, ["GH_TOKEN"]))
      .toThrow(/unsupported/);
  });

  it("uses only an explicit receipt-backed isolated runner home", async () => {
    const ambient = workspace();
    const isolated = workspace();
    const work = workspace();
    mkdirSync(join(isolated, ".vcskill"), { recursive: true });
    writeFileSync(join(isolated, ".vcskill", "receipt.json"), "{}");
    const launcher = createBehavioralProcessLauncher({
      executable: process.execPath,
      args: ["-e", "process.stdout.write(String(process.env.HOME))"],
      sourceEnvironment: { HOME: ambient },
      runnerHome: isolated,
    });
    await expect(launcher.launch({ prompt: "", workspaceRoot: work }, new AbortController().signal))
      .resolves.toEqual({ kind: "completed", output: realpathSync(isolated) });
    expect(() => createBehavioralProcessLauncher({
      executable: process.execPath,
      sourceEnvironment: { HOME: ambient },
      runnerHome: ambient,
    })).toThrow(/ambient user home/);
    expect(() => createBehavioralProcessLauncher({
      executable: process.execPath,
      runnerHome: work,
    })).toThrow(/install receipt/);
  });

  it("feeds the prompt on stdin without a shell", async () => {
    const launcher = createBehavioralProcessLauncher({
      executable: process.execPath,
      args: ["-e", "process.stdin.pipe(process.stdout)"],
    });
    await expect(launcher.launch({ prompt: "hello", workspaceRoot: workspace() }, new AbortController().signal))
      .resolves.toEqual({ kind: "completed", output: "hello" });
  });

  it("distinguishes an unavailable executable and a non-zero exit", async () => {
    const unavailable = createBehavioralProcessLauncher({ executable: "vcskill-command-that-does-not-exist" });
    const crashed = createBehavioralProcessLauncher({ executable: process.execPath, args: ["-e", "process.exit(7)"] });
    await expect(unavailable.launch({ prompt: "", workspaceRoot: workspace() }, new AbortController().signal))
      .resolves.toEqual({ kind: "unavailable" });
    await expect(crashed.launch({ prompt: "", workspaceRoot: workspace() }, new AbortController().signal))
      .resolves.toEqual({ kind: "crashed", exitCode: 7 });
  });

  it("bounds output and reports malformed data", async () => {
    const launcher = createBehavioralProcessLauncher({
      executable: process.execPath,
      args: ["-e", "process.stdout.write('x'.repeat(1000))"],
      maxOutputBytes: 10,
    });
    await expect(launcher.launch({ prompt: "", workspaceRoot: workspace() }, new AbortController().signal))
      .resolves.toEqual({ kind: "malformed" });
  });

  it("terminates the whole process group on cancellation", async () => {
    const controller = new AbortController();
    const root = workspace();
    const launcher = createBehavioralProcessLauncher({
      executable: process.execPath,
      args: ["-e", [
        "const {spawn}=require('node:child_process')",
        "const {writeFileSync}=require('node:fs')",
        "const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'})",
        "writeFileSync('grandchild.pid',String(child.pid))",
        "setInterval(()=>{},1000)",
      ].join(";")],
    });
    const pending = launcher.launch({ prompt: "", workspaceRoot: root }, controller.signal);
    for (let attempt = 0; attempt < 100 && !existsSync(join(root, "grandchild.pid")); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const pid = Number(readFileSync(join(root, "grandchild.pid"), "utf8"));
    controller.abort();
    const result = await pending;
    expect(result.kind).toBe("crashed");
    expect(result.kind === "crashed" && result.signal).toMatch(/SIGTERM|SIGKILL/);
    expect(() => process.kill(pid, 0)).toThrow();
  });
});
