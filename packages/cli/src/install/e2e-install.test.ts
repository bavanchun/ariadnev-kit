// End-to-end install and uninstall, against a temporary tree.
//
// Why this exists: the provider evidence in `spec-verified.ts` is a snapshot,
// taken once, by hand, before the hook engine changed binding order, before the
// statusline added a settings key, and before adapter artifacts were written at
// all. Nothing re-checked the matrix after those. This does — not by asking a
// provider to read the files (that is the manual, dated work the evidence table
// records), but by proving ariadnev writes exactly what it claims it writes, and
// then takes all of it back.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { loadKit, resolveKitRoot } from "../kit/load-kit.js";
import { installKit } from "./install-execute.js";
import { fromPortablePath, type Receipt } from "./install-receipt.js";
import { planUninstall } from "../uninstall/uninstall-plan.js";
import { executeUninstall } from "../uninstall/uninstall-execute.js";
import { MATRIX_PROVIDERS } from "../providers/provider-matrix.js";
import { isVerified, type ProviderId } from "../providers/spec-verified.js";
import { targetPathFor } from "../providers/resolver.js";
import { adapterDir } from "../adapters/write-adapter-artifacts.js";

const kitRoot = resolveKitRoot(process.cwd());
const kit = loadKit(kitRoot);

/** Providers with at least one verified cell — the ones an install can serve. */
const INSTALLABLE = MATRIX_PROVIDERS.filter(
  (provider) => provider !== "test-provider" && isVerified(provider, "skill"),
);

let sandbox: string;
let ctx: { home: string; cwd: string; scope: "project" };

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "ariadnev-e2e-"));
  mkdirSync(join(sandbox, "home"), { recursive: true });
  mkdirSync(join(sandbox, "project"), { recursive: true });
  ctx = { home: join(sandbox, "home"), cwd: join(sandbox, "project"), scope: "project" };
});
afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

function readReceipt(): Receipt {
  return JSON.parse(readFileSync(join(ctx.cwd, ".ariadnev", "receipt.json"), "utf8")) as Receipt;
}

const uninstallDeps = {
  fileExists: (path: string) => existsSync(path),
  readFileContent: (path: string) => readFileSync(path),
};

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("install writes what the receipt claims", () => {
  it.each(INSTALLABLE)("%s: every recorded file exists with the recorded hash", (provider) => {
    installKit(kit, [provider], ctx, { timestamp: "20260815-120000", applyHookSettings: true });
    const install = readReceipt().installs[provider as ProviderId];
    expect(install, `${provider} has no receipt entry`).toBeDefined();
    expect(install!.files.length).toBeGreaterThan(0);

    const wrong: string[] = [];
    for (const file of install!.files) {
      const abs = fromPortablePath(file.path, ctx.home, ctx.cwd);
      if (!existsSync(abs)) wrong.push(`${file.path}: missing`);
      else if (sha256(abs) !== file.sha256) wrong.push(`${file.path}: hash differs`);
    }
    expect(wrong).toEqual([]);
  });

  it.each(INSTALLABLE)("%s: every file it wrote sits under a path the matrix declares", (provider) => {
    installKit(kit, [provider], ctx, { timestamp: "20260815-120000", applyHookSettings: true });
    const install = readReceipt().installs[provider as ProviderId]!;

    // The declared roots, straight from the same resolver the installer uses,
    // with the trailing `*` (the artifact name) trimmed off.
    const declared = (["skill", "agent", "command", "rules", "scripts", "env", "hook", "outputStyle", "statusline"] as const)
      .map((kind) => targetPathFor(provider as ProviderId, kind, ctx))
      .filter((path): path is string => path !== null)
      .map((path) => path.replace(/\/?\*.*$/, "").replace(/\/AGENTS\.md$/, "").replace(/\/+$/, ""));

    const stray = install.files
      .map((file) => fromPortablePath(file.path, ctx.home, ctx.cwd))
      .filter((abs) => !declared.some((root) => abs === root || abs.startsWith(`${root}/`)));
    expect(stray, "files written outside every declared target root").toEqual([]);
  });
});

describe("hook bindings survive the round trip in order", () => {
  it("claude-code: settings.json lists each event's hooks in the declared order", () => {
    // Order is a contract — a guardrail has to run before the gate that reads
    // its result — and nothing else in the install would notice it changing.
    installKit(kit, ["claude-code"], ctx, { timestamp: "20260815-120000", applyHookSettings: true });
    const settings = JSON.parse(readFileSync(join(ctx.cwd, ".claude", "settings.json"), "utf8")) as {
      hooks: Record<string, { hooks: { command: string }[] }[]>;
    };
    const order = (event: string): string[] =>
      (settings.hooks[event] ?? []).flatMap((group) =>
        group.hooks.map((entry) => (entry.command.match(/hooks\/av\/([a-z-]+)\.cjs/) ?? [])[1]),
      );

    expect(order("UserPromptSubmit")).toEqual([
      "secret-output-guardrail",
      "simplify-gate",
      "dev-rules-reminder",
      "usage-quota-cache-refresh",
    ]);
    expect(order("PreToolUse")).toEqual(["descriptive-name", "privacy-block", "scout-block"]);
    expect(order("Stop")).toEqual(["cook-after-plan-reminder", "session-state", "usage-quota-cache-refresh"]);
    expect(Object.keys(settings.hooks).sort()).toEqual([
      "PostToolUse", "PreCompact", "PreToolUse", "SessionStart",
      "Stop", "SubagentStart", "SubagentStop", "UserPromptSubmit",
    ]);
  });

  it("claude-code: every bound hook file is on disk and loads", () => {
    installKit(kit, ["claude-code"], ctx, { timestamp: "20260815-120000", applyHookSettings: true });
    const settings = JSON.parse(readFileSync(join(ctx.cwd, ".claude", "settings.json"), "utf8")) as {
      hooks: Record<string, { hooks: { command: string }[] }[]>;
    };
    const missing: string[] = [];
    for (const groups of Object.values(settings.hooks)) {
      for (const group of groups) {
        for (const entry of group.hooks) {
          const path = (entry.command.match(/"([^"]+)"/) ?? [])[1];
          if (!path || !existsSync(path)) missing.push(entry.command);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("claude-code: the statusline is installed and pointed at", () => {
    installKit(kit, ["claude-code"], ctx, { timestamp: "20260815-120000", applyHookSettings: true });
    const settings = JSON.parse(readFileSync(join(ctx.cwd, ".claude", "settings.json"), "utf8")) as {
      statusLine?: { command?: string };
    };
    const path = (settings.statusLine?.command?.match(/"([^"]+)"/) ?? [])[1];
    expect(path, "settings.json has no statusLine").toBeTruthy();
    expect(existsSync(path!)).toBe(true);
  });
});

describe("shipped scripts arrive with the mode they have in the kit", () => {
  it("claude-code: install neither adds nor drops an executable bit", () => {
    // Upstream ships these non-executable and documents running them as
    // `bash …/install.sh`, so demanding +x would assert something that was never
    // true. What matters is that the installer does not change the mode: adding
    // +x to a downloaded script is a change nobody asked for, and dropping one
    // would break a script that relies on it.
    installKit(kit, ["claude-code"], ctx, { timestamp: "20260815-120000", applyHookSettings: true });
    const install = readReceipt().installs["claude-code"]!;
    const shellScripts = install.files.filter((file) => file.path.endsWith(".sh"));
    expect(shellScripts.length, "the kit ships shell scripts").toBeGreaterThan(0);

    const changed: string[] = [];
    for (const file of shellScripts) {
      const installed = fromPortablePath(file.path, ctx.home, ctx.cwd);
      const source = join(kitRoot, "skills", installed.slice(installed.indexOf("/skills/") + "/skills/".length));
      if (!existsSync(source)) continue;
      const sourceExecutable = (statSync(source).mode & 0o100) !== 0;
      const installedExecutable = (statSync(installed).mode & 0o100) !== 0;
      if (sourceExecutable !== installedExecutable) changed.push(file.path);
    }
    expect(changed, "files whose executable bit changed during install").toEqual([]);
  });
});

describe("adapter artifacts follow the install", () => {
  it("claude-code: the projection is written and matches the receipt's file count", () => {
    installKit(kit, ["claude-code"], ctx, { timestamp: "20260815-120000", applyHookSettings: true });
    const dir = adapterDir("claude-code", ctx.home);
    expect(readdirSync(dir).sort()).toEqual([
      "claude-code-ownership.json",
      "install-manifest.json",
      "native-hook-expectations.json",
      "native-skill-hashes.json",
      "native-skill-paths.json",
    ]);
    const manifest = JSON.parse(readFileSync(join(dir, "install-manifest.json"), "utf8")) as { files: unknown[] };
    expect(manifest.files.length).toBe(readReceipt().installs["claude-code"]!.files.length);
  });
});

describe("uninstall takes back everything it put down", () => {
  it.each(INSTALLABLE)("%s: no recorded file survives, and settings return to clean", (provider) => {
    installKit(kit, [provider], ctx, { timestamp: "20260815-120000", applyHookSettings: true });
    const install = readReceipt().installs[provider as ProviderId]!;
    const paths = install.files.map((file) => fromPortablePath(file.path, ctx.home, ctx.cwd));

    const plan = planUninstall(readReceipt(), provider as ProviderId, ctx.home, ctx.cwd, uninstallDeps);
    executeUninstall(plan, {
      dryRun: false,
      allowedRoots: [ctx.home, ctx.cwd],
      backupRoot: join(ctx.cwd, ".ariadnev", "backups", "uninstall"),
      scopeRoot: ctx.cwd,
    });

    const survivors = paths.filter((path) => existsSync(path));
    expect(survivors, "files the uninstall left behind").toEqual([]);
  });

  it("claude-code: settings.json keeps nothing of ours", () => {
    installKit(kit, ["claude-code"], ctx, { timestamp: "20260815-120000", applyHookSettings: true });
    const plan = planUninstall(readReceipt(), "claude-code", ctx.home, ctx.cwd, uninstallDeps);
    executeUninstall(plan, {
      dryRun: false,
      allowedRoots: [ctx.home, ctx.cwd],
      backupRoot: join(ctx.cwd, ".ariadnev", "backups", "uninstall"),
      scopeRoot: ctx.cwd,
    });
    const settingsPath = join(ctx.cwd, ".claude", "settings.json");
    const settings = existsSync(settingsPath) ? readFileSync(settingsPath, "utf8") : "{}";
    expect(settings).not.toContain("hooks/av/");
  });

  it("keeps a file the user edited after install rather than deleting their work", () => {
    installKit(kit, ["claude-code"], ctx, { timestamp: "20260815-120000", applyHookSettings: true });
    const edited = fromPortablePath(readReceipt().installs["claude-code"]!.files[0].path, ctx.home, ctx.cwd);
    writeFileSync(edited, "# mine now\n");

    const plan = planUninstall(readReceipt(), "claude-code", ctx.home, ctx.cwd, uninstallDeps);
    executeUninstall(plan, {
      dryRun: false,
      allowedRoots: [ctx.home, ctx.cwd],
      backupRoot: join(ctx.cwd, ".ariadnev", "backups", "uninstall"),
      scopeRoot: ctx.cwd,
    });
    expect(existsSync(edited), `${relative(ctx.cwd, edited)} was edited and should have been preserved`).toBe(true);
    expect(readFileSync(edited, "utf8")).toBe("# mine now\n");
  });
});
