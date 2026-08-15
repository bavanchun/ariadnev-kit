import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Kit } from "../kit/kit-types.js";
import type { ProviderResolver, ResolverCtx } from "../providers/resolver.js";
import { mapCommand } from "../adapt/command-map.js";
import { CLAUDE_HOOKS_DIR, CLAUDE_SETTINGS_FILE } from "../adapt/paths.js";
import { isVerified } from "../providers/spec-verified.js";
import { buildRulesBlock } from "./agents-md.js";
import type { HookBinding } from "./hook-settings-merge.js";
import { compareBindings, hookBindingSpecs } from "../kit/hook-bindings.js";
import type { HookBindingSpec } from "../kit/kit-types.js";
import { agentContent, adaptText, skillFiles } from "./artifact-content.js";
import { IGNORE_DIRS, IGNORE_FILES, isTextFile, type InstallOp } from "./install-types.js";

function skip(kind: InstallOp["kind"], name: string, reason: string): InstallOp {
  return { action: "skip", kind, name, reason };
}

function planSkills(kit: Kit, r: ProviderResolver, ctx: ResolverCtx): InstallOp[] {
  const ops: InstallOp[] = [];
  for (const skill of kit.skills) {
    const dir = r.targetFor(skill, ctx);
    if (!dir) {
      ops.push(skip("skill", skill.name, "unverified"));
      continue;
    }
    for (const f of skillFiles(skill, r.id)) {
      ops.push({ action: "write", kind: "skill", name: skill.name, dest: join(dir, f.rel), content: f.content, mode: f.mode });
    }
  }
  return ops;
}

function planAgents(kit: Kit, r: ProviderResolver, ctx: ResolverCtx): InstallOp[] {
  return kit.agents.map((agent): InstallOp => {
    if (!r.supports.agent) return skip("agent", agent.name, `unsupported/unverified (${r.id})`);
    let dest = r.targetFor(agent, ctx)!;
    if (r.id === "cursor") dest = join(dest, "AGENT.md"); // shim dir → file
    return { action: "write", kind: "agent", name: agent.name, dest, content: agentContent(agent, r.id) };
  });
}

function planCommands(kit: Kit, r: ProviderResolver, ctx: ResolverCtx): InstallOp[] {
  return kit.commands.map((cmd): InstallOp => {
    if (!r.supports.command) return skip("command", cmd.name, `unsupported/unverified (${r.id})`);
    return { action: "write", kind: "command", name: cmd.name, dest: r.targetFor(cmd, ctx)!, content: mapCommand(cmd, r.id).content };
  });
}

// Output styles are plain Markdown the provider reads verbatim — no adaptation.
function planOutputStyles(kit: Kit, r: ProviderResolver, ctx: ResolverCtx): InstallOp[] {
  return kit.outputStyles.map((style): InstallOp => {
    if (!r.supports.outputStyle) return skip("outputStyle", style.name, `unsupported/unverified (${r.id})`);
    return { action: "write", kind: "outputStyle", name: style.name, dest: r.targetFor(style, ctx)!, content: style.raw };
  });
}

function planRules(kit: Kit, r: ProviderResolver, ctx: ResolverCtx): InstallOp[] {
  if (kit.rules.length === 0) return [];
  // This gate was missing while every provider happened to have rules
  // verified, so the `!` below asserted away a null that could not yet occur.
  // The moment one provider's rules cell lost its evidence, that null reached
  // the path guard as a crash instead of a skip.
  if (!r.supports.rules) {
    return kit.rules.map((rule) => skip("rules", rule.name, `unsupported/unverified (${r.id})`));
  }
  if (r.rulesMode === "agents-md") {
    const dest = join(r.agentsMdRoot(ctx), "AGENTS.md");
    return [{ action: "agents-md", kind: "rules", name: "AGENTS.md", dest, block: buildRulesBlock(kit.rules) }];
  }
  return kit.rules.map((rule): InstallOp => {
    const dest = r.targetFor(rule, ctx)!;
    return { action: "write", kind: "rules", name: rule.name, dest, content: adaptText(rule.body, r.id) };
  });
}

function planDirTree(srcDir: string, destDir: string, providerId: ProviderResolver["id"], kind: InstallOp["kind"]): InstallOp[] {
  const ops: InstallOp[] = [];
  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir)) {
      if (IGNORE_FILES.has(entry)) continue;
      const abs = join(dir, entry);
      if (statSync(abs).isDirectory()) {
        if (!IGNORE_DIRS.has(entry)) walk(abs, join(rel, entry));
        continue;
      }
      const raw = readFileSync(abs, "utf8");
      const content = isTextFile(entry) ? adaptText(raw, providerId) : raw;
      ops.push({ action: "write", kind, name: entry, dest: join(destDir, rel, entry), content });
    }
  };
  walk(srcDir, "");
  return ops;
}

// Hooks are a Claude Code event contract — providers with an unverified
// (provider, hook) cell get skip ops, never guessed paths.
function planHooks(kit: Kit, r: ProviderResolver, ctx: ResolverCtx): InstallOp[] {
  if (kit.hooks.length === 0) return [];
  if (!isVerified(r.id, "hook")) {
    return kit.hooks.map((h) => skip("hook", h.name, `unsupported/unverified (${r.id})`));
  }
  const base = ctx.scope === "global" ? ctx.home : ctx.cwd;
  const ops: InstallOp[] = [];
  // Bindings are collected across every hook first, then ordered: within one
  // event the sequence is a contract (a guardrail before the gate that reads its
  // result), and hook discovery order is alphabetical, which is not it.
  const collected: { spec: HookBindingSpec; name: string; dest: string }[] = [];
  for (const hook of kit.hooks) {
    const dest = join(base, CLAUDE_HOOKS_DIR, `${hook.name}.cjs`);
    ops.push({
      action: "write",
      kind: "hook",
      name: hook.name,
      dest,
      content: readFileSync(hook.file, "utf8"),
    });
    for (const spec of hookBindingSpecs(hook.manifest)) {
      collected.push({ spec, name: hook.name, dest });
    }
  }
  collected.sort(compareBindings);
  const bindings: HookBinding[] = collected.map(({ spec, dest }) => ({
    event: spec.event,
    ...(spec.matcher ? { matcher: spec.matcher } : {}),
    command: [`node ${JSON.stringify(dest)}`, ...(spec.args ?? [])].join(" "),
  }));
  // Shared helpers required by hook bodies at runtime.
  const libDir = join(kit.root, "hooks", "_lib");
  if (existsSync(libDir)) {
    ops.push(...planDirTree(libDir, join(base, CLAUDE_HOOKS_DIR, "_lib"), r.id, "hook"));
  }
  // The statusline is not a hook — it is a command the provider runs to draw a
  // bar — but it lives in the same owned directory and loads the same `_lib`,
  // so it is written here rather than through a parallel tree of its own.
  if (kit.statusline) {
    if (!isVerified(r.id, "statusline")) {
      ops.push(skip("statusline", "av-statusline.cjs", `unsupported/unverified (${r.id})`));
    } else {
      const dest = join(base, CLAUDE_HOOKS_DIR, "av-statusline.cjs");
      ops.push({
        action: "write",
        kind: "statusline",
        name: "av-statusline.cjs",
        dest,
        content: readFileSync(kit.statusline, "utf8"),
      });
      ops.push({
        action: "statusline-settings",
        kind: "statusline",
        name: "settings.json",
        dest: join(base, CLAUDE_SETTINGS_FILE),
        command: `node ${JSON.stringify(dest)}`,
        ownedDir: join(base, CLAUDE_HOOKS_DIR),
      });
    }
  }

  ops.push({
    action: "hook-settings",
    kind: "hook",
    name: "settings.json",
    dest: join(base, CLAUDE_SETTINGS_FILE),
    bindings,
  });
  return ops;
}

/** Pure: build the full op plan for one provider. Reads sources, writes nothing. */
export function planInstall(kit: Kit, r: ProviderResolver, ctx: ResolverCtx): InstallOp[] {
  const ops: InstallOp[] = [
    ...planSkills(kit, r, ctx),
    ...planAgents(kit, r, ctx),
    ...planCommands(kit, r, ctx),
    ...planOutputStyles(kit, r, ctx),
    ...planRules(kit, r, ctx),
    ...planHooks(kit, r, ctx),
  ];
  if (kit.scriptsDir && r.supports.scripts) {
    ops.push(...planDirTree(kit.scriptsDir, r.scriptsTarget(ctx), r.id, "scripts"));
  }
  if (kit.envExample && r.supports.env) {
    ops.push({ action: "write", kind: "env", name: ".env.example", dest: r.envTarget(ctx), content: readFileSync(kit.envExample, "utf8") });
  }
  return ops;
}
