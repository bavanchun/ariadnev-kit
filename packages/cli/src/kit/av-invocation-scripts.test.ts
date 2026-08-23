import { describe, it, expect } from "vitest";
import { lintScriptAvInvocations } from "./av-invocation-scripts.js";
import type { CommandNode, CommandSurface } from "./av-invocation-lint.js";

function node(spec: { flags?: string[]; subs?: Record<string, Parameters<typeof node>[0]> }): CommandNode {
  return {
    flags: new Set([...(spec.flags ?? []), "--help", "-h"]),
    valueFlags: new Set(),
    subcommands: new Map(Object.entries(spec.subs ?? {}).map(([name, sub]) => [name, node(sub)])),
  };
}

const surface: CommandSurface = node({
  subs: {
    config: { subs: { prefs: { flags: ["--json"] } } },
    plan: { subs: { list: { flags: ["--json"] }, show: { flags: ["--json"] } } },
  },
});

const lint = (source: string, file = "scripts/thing.cjs") =>
  lintScriptAvInvocations(source, surface, file).map((f) => `${f.severity}:${f.command} ${f.token}@${f.line}`);

describe("lintScriptAvInvocations — argv arrays", () => {
  it("catches the phantom the plans-kanban launcher spawns", () => {
    const source = [
      "const child = spawn(akBin(), [",
      "  'config',",
      "  'start',",
      "  '--port',",
      "  String(DEFAULT_PORT)",
      "]);",
    ].join("\n");
    expect(lint(source)).toEqual(["error:av config start@1"]);
  });

  it("catches a string binary in the same position", () => {
    expect(lint(`execFile("av", ["plan", "create"]);`)).toEqual(["error:av plan create@1"]);
  });

  it("catches an env-supplied binary path", () => {
    expect(lint(`spawnSync(process.env.ARIADNEV_CLI, ['config', 'stop']);`)).toEqual(["error:av config stop@1"]);
  });

  it("accepts a registered path", () => {
    expect(lint(`spawnSync(akBin(), ['plan', 'list', '--json']);`)).toEqual([]);
  });

  it("warns on an unregistered flag", () => {
    expect(lint(`spawnSync(akBin(), ['plan', 'show', '--linked-pr']);`)).toEqual([
      "warning:av plan show --linked-pr@1",
    ]);
  });

  it("leaves another program's argv alone", () => {
    expect(lint(`spawn('git', ['config', 'start']);`)).toEqual([]);
    expect(lint(`spawn(ffmpegBin(), ['config', 'start']);`)).toEqual([]);
  });

  it("catches a helper wrapper named for the binary", () => {
    expect(lint(`const result = runAK(['config', 'status', '--json']);`)).toEqual(["error:av config status@1"]);
  });

  it("leaves a helper not named for the binary alone", () => {
    expect(lint(`saveAll(['config', 'start']);`)).toEqual([]);
  });
});

describe("lintScriptAvInvocations — command strings", () => {
  it("catches a shell string that starts with the binary", () => {
    expect(lint(`execSync("av config start --no-open");`)).toEqual(["error:av config start@1"]);
  });

  it("catches the npx spelling", () => {
    expect(lint(`execSync('npx ariadnev config start');`)).toEqual(["error:av config start@1"]);
  });

  it("leaves a message that merely mentions the binary alone", () => {
    expect(lint("console.error(`[plans-kanban] av not found; install the ariadnev CLI`);")).toEqual([]);
  });

  it("leaves an argument that happens to be the project name alone", () => {
    expect(lint(`run('create ariadnev test-multi --prefix feat --json');`)).toEqual([]);
  });
});

describe("lintScriptAvInvocations — shell files", () => {
  it("reads a bare command line", () => {
    expect(lint("#!/usr/bin/env bash\nav config start --port 3456\n", "scripts/open.sh")).toEqual([
      "error:av config start@2",
    ]);
  });

  it("reads a command after a shell operator", () => {
    expect(lint("av plan list --json | jq . && av plan sync\n", "scripts/open.sh")).toEqual(["error:av plan sync@1"]);
  });

  it("ignores a comment", () => {
    expect(lint("# av config start is gone\n", "scripts/open.sh")).toEqual([]);
  });

  it("does not apply the shell-line rule to a javascript file", () => {
    expect(lint("av config start\n")).toEqual([]);
  });
});

describe("lintScriptAvInvocations — one finding per site", () => {
  it("does not report a string command twice", () => {
    expect(lint("av config start\n", "scripts/open.sh").length).toBe(1);
    expect(lint(`'av config start'\n`, "scripts/open.sh").length).toBe(1);
  });
});
