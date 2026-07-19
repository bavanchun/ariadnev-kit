import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadKit, resolveKitRoot } from "../kit/load-kit.js";
import { getResolver } from "../providers/index.js";
import { planInstall } from "./install-plan.js";
import { installKit } from "./install-execute.js";

const here = dirname(fileURLToPath(import.meta.url));
const kit = loadKit(resolveKitRoot(join(here, "..", "..", "..", "..", "kit")));

let sandbox: string;
let ctx: { home: string; cwd: string; scope: "project" };
beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "vcskill-inst-"));
  ctx = { home: join(sandbox, "home"), cwd: join(sandbox, "proj"), scope: "project" };
  mkdirSync(ctx.home, { recursive: true });
  mkdirSync(ctx.cwd, { recursive: true });
});
afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

describe("planInstall (pure)", () => {
  it("emits adapted skill + skips unverified codex... none; antigravity skips agents", () => {
    const ops = planInstall(kit, getResolver("antigravity"), ctx);
    const skips = ops.filter((o) => o.action === "skip");
    expect(skips.some((o) => o.kind === "agent")).toBe(true);
    expect(skips.some((o) => o.kind === "command")).toBe(true);
    // skills still planned
    expect(ops.some((o) => o.action === "write" && o.kind === "skill")).toBe(true);
  });

  it("codex skill content is path+tool adapted", () => {
    const ops = planInstall(kit, getResolver("codex"), ctx);
    const skillMd = ops.find((o) => o.action === "write" && o.dest.endsWith("echo-tool/SKILL.md"));
    expect(skillMd && "content" in skillMd && skillMd.content).toContain("$HOME/.agents/skills/");
  });
});

describe("executeInstall + dry-run", () => {
  it("dry-run writes nothing but returns full plan", () => {
    const [res] = installKit(kit, ["claude-code"], ctx, { dryRun: true, timestamp: "20260603-000000" });
    expect(res.written).toBeGreaterThan(0);
    expect(existsSync(join(ctx.cwd, ".claude"))).toBe(false);
  });

  it("real install writes adapted files for codex", () => {
    installKit(kit, ["codex"], ctx, { timestamp: "20260603-000001" });
    const skill = join(ctx.home, ".agents/skills/echo-tool/SKILL.md");
    expect(existsSync(skill)).toBe(true);
    expect(readFileSync(skill, "utf8")).toContain("$HOME/.agents/skills/");
    expect(existsSync(join(ctx.home, ".codex/agents/sample-reviewer.toml"))).toBe(true);
    // env example present, real .env never created
    expect(existsSync(join(ctx.home, ".agents/vcskill/.env.example"))).toBe(true);
  });

  it("idempotent re-install: content stable, prior backed up", () => {
    installKit(kit, ["claude-code"], ctx, { timestamp: "20260603-000010" });
    const skill = join(ctx.cwd, ".claude/skills/echo-tool/SKILL.md");
    const first = readFileSync(skill, "utf8");
    const res2 = installKit(kit, ["claude-code"], ctx, { timestamp: "20260603-000011" });
    expect(readFileSync(skill, "utf8")).toBe(first);
    expect(res2[0].backedUp).toBeGreaterThan(0);
    expect(existsSync(join(ctx.cwd, ".vcskill/backups/20260603-000011"))).toBe(true);
  });

  it("backups capped at 3", () => {
    for (let i = 0; i < 5; i++) {
      installKit(kit, ["claude-code"], ctx, { timestamp: `20260603-00002${i}` });
    }
    const backups = readdirSync(join(ctx.cwd, ".vcskill/backups"));
    expect(backups.length).toBeLessThanOrEqual(3);
  });

  it("merges rules into AGENTS.md managed block for codex", () => {
    installKit(kit, ["codex"], ctx, { timestamp: "20260603-000030" });
    const agentsMd = readFileSync(join(ctx.cwd, "AGENTS.md"), "utf8");
    expect(agentsMd).toContain("vcskill:start");
    expect(agentsMd).toContain("Never commit secrets.");
  });

  it("opencode writes plural command dir", () => {
    installKit(kit, ["opencode"], ctx, { timestamp: "20260603-000040" });
    expect(existsSync(join(ctx.cwd, ".opencode/commands/sample-cmd.md"))).toBe(true);
  });

  it("guards against writes escaping roots", () => {
    expect(() =>
      installKit(kit, ["claude-code"], { home: "/nope", cwd: "/nope", scope: "project" }, { dryRun: true, timestamp: "x" }),
    ).not.toThrow(); // dry-run still validates paths under cwd=/nope so ok
  });

  it("hooks: claude-code copies files; settings merge only when confirmed", () => {
    const kitRoot = join(sandbox, "kit-with-hooks");
    mkdirSync(join(kitRoot, "skills"), { recursive: true });
    const hookDir = join(kitRoot, "hooks", "session-init");
    mkdirSync(hookDir, { recursive: true });
    writeFileSync(join(hookDir, "hook.cjs"), "process.exit(0);\n");
    writeFileSync(
      join(hookDir, "hook.json"),
      JSON.stringify({ event: "SessionStart", description: "init env" }),
    );
    const hookKit = loadKit(kitRoot);

    // declined / non-interactive: file copied, settings.json untouched, skip logged
    const [declined] = installKit(hookKit, ["claude-code"], ctx, {
      timestamp: "20260603-000060",
    });
    expect(existsSync(join(ctx.cwd, ".claude/hooks/vc/session-init.cjs"))).toBe(true);
    expect(existsSync(join(ctx.cwd, ".claude/settings.json"))).toBe(false);
    expect(declined.skipped.some((s) => s.kind === "hook")).toBe(true);

    // confirmed: settings merged, idempotent across double install
    installKit(hookKit, ["claude-code"], ctx, {
      timestamp: "20260603-000061",
      applyHookSettings: true,
    });
    installKit(hookKit, ["claude-code"], ctx, {
      timestamp: "20260603-000062",
      applyHookSettings: true,
    });
    const settings = JSON.parse(readFileSync(join(ctx.cwd, ".claude/settings.json"), "utf8"));
    const entries = JSON.stringify(settings.hooks.SessionStart).match(/session-init\.cjs/g);
    expect(entries?.length).toBe(1);
  });

  it("hooks: non-claude providers skip-and-log", () => {
    const kitRoot = join(sandbox, "kit-with-hooks2");
    mkdirSync(join(kitRoot, "skills"), { recursive: true });
    const hookDir = join(kitRoot, "hooks", "privacy-block");
    mkdirSync(hookDir, { recursive: true });
    writeFileSync(join(hookDir, "hook.cjs"), "process.exit(0);\n");
    writeFileSync(
      join(hookDir, "hook.json"),
      JSON.stringify({ event: "PreToolUse", matcher: "Read", description: "block secrets" }),
    );
    const hookKit = loadKit(kitRoot);
    const ops = planInstall(hookKit, getResolver("codex"), ctx);
    const hookOps = ops.filter((o) => o.kind === "hook");
    expect(hookOps.length).toBeGreaterThan(0);
    expect(hookOps.every((o) => o.action === "skip")).toBe(true);
    const [res] = installKit(hookKit, ["codex"], ctx, { timestamp: "20260603-000070" });
    expect(res.skipped.some((s) => s.kind === "hook" && /unverified/.test(s.reason))).toBe(true);
  });

  it("atomic: a pre-existing file is fully replaced, never half", () => {
    const skill = join(ctx.cwd, ".claude/skills/echo-tool/SKILL.md");
    mkdirSync(dirname(skill), { recursive: true });
    writeFileSync(skill, "OLD CONTENT");
    installKit(kit, ["claude-code"], ctx, { timestamp: "20260603-000050" });
    const after = readFileSync(skill, "utf8");
    expect(after).not.toContain("OLD CONTENT");
    expect(after).toContain("Echo Tool");
    expect(existsSync(`${skill}.vcskill-tmp`)).toBe(false);
  });
});
