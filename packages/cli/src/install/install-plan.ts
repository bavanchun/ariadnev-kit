import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Kit } from "../kit/kit-types.js";
import type { ProviderResolver, ResolverCtx } from "../providers/resolver.js";
import { mapCommand } from "../adapt/command-map.js";
import { buildRulesBlock } from "./agents-md.js";
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
      ops.push({ action: "write", kind: "skill", name: skill.name, dest: join(dir, f.rel), content: f.content });
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

function planRules(kit: Kit, r: ProviderResolver, ctx: ResolverCtx): InstallOp[] {
  if (kit.rules.length === 0) return [];
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

/** Pure: build the full op plan for one provider. Reads sources, writes nothing. */
export function planInstall(kit: Kit, r: ProviderResolver, ctx: ResolverCtx): InstallOp[] {
  const ops: InstallOp[] = [
    ...planSkills(kit, r, ctx),
    ...planAgents(kit, r, ctx),
    ...planCommands(kit, r, ctx),
    ...planRules(kit, r, ctx),
  ];
  if (kit.scriptsDir && r.supports.scripts) {
    ops.push(...planDirTree(kit.scriptsDir, r.scriptsTarget(ctx), r.id, "scripts"));
  }
  if (kit.envExample && r.supports.env) {
    ops.push({ action: "write", kind: "env", name: ".env.example", dest: r.envTarget(ctx), content: readFileSync(kit.envExample, "utf8") });
  }
  return ops;
}
