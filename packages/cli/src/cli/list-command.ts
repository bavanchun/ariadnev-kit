import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { loadKit, resolveKitRoot } from "../kit/load-kit.js";
import { getResolver, PROVIDER_IDS } from "../providers/index.js";
import type { Scope } from "../providers/resolver.js";

export interface ListHandlerOpts {
  scope: Scope;
  home: string;
  cwd: string;
  kitRoot?: string;
}

/** Render kit contents and, per provider, whether the skill target exists. */
export function runList(opts: ListHandlerOpts): string {
  const kitRoot = opts.kitRoot ?? resolveKitRoot(dirname(fileURLToPath(import.meta.url)));
  const kit = loadKit(kitRoot);
  const lines: string[] = ["vcskill kit:"];
  lines.push(`  skills:   ${kit.skills.map((s) => s.name).join(", ") || "(none)"}`);
  lines.push(`  agents:   ${kit.agents.map((a) => a.name).join(", ") || "(none)"}`);
  lines.push(`  commands: ${kit.commands.map((c) => c.name).join(", ") || "(none)"}`);
  lines.push(`  rules:    ${kit.rules.map((r) => r.name).join(", ") || "(none)"}`);
  lines.push("");
  lines.push(`install state (${opts.scope}):`);
  const ctx = { home: opts.home, cwd: opts.cwd, scope: opts.scope };
  for (const id of PROVIDER_IDS) {
    const r = getResolver(id);
    const first = kit.skills[0];
    const target = first ? r.targetFor(first, ctx) : null;
    const state = target ? (existsSync(target) ? "installed" : "not installed") : "(unsupported/unverified)";
    const flags: string[] = [];
    if (!r.supports.agent) flags.push("no-agents");
    if (!r.supports.command) flags.push("no-commands");
    lines.push(`  ${id.padEnd(12)} ${state}${flags.length ? `  [${flags.join(",")}]` : ""}`);
  }
  return lines.join("\n");
}
