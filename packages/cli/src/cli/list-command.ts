import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { loadKit } from "../kit/load-kit.js";
import { getKitRoot } from "../kit/embedded-kit.js";
import { getResolver, PROVIDER_IDS } from "../providers/index.js";
import type { Scope } from "../providers/resolver.js";
import { coral, teal, faint, type StyleOpts } from "../ui/style.js";

export interface ListHandlerOpts {
  scope: Scope;
  home: string;
  cwd: string;
  kitRoot?: string;
  /** Branded coloring; false (default) is byte-identical to the plain form. */
  color?: boolean;
}

/** Render kit contents and, per provider, whether the skill target exists. */
export function runList(opts: ListHandlerOpts): string {
  const style: StyleOpts = { color: !!opts.color };
  const kitRoot = opts.kitRoot ?? getKitRoot(dirname(fileURLToPath(import.meta.url)));
  const kit = loadKit(kitRoot);
  const lines: string[] = [`${coral("ariadnev", style)} kit:`];
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
    const installed = target ? existsSync(target) : false;
    const rawState = target ? (installed ? "installed" : "not installed") : "(unsupported/unverified)";
    const state = installed ? teal(rawState, style) : faint(rawState, style);
    const flags: string[] = [];
    if (!r.supports.agent) flags.push("no-agents");
    if (!r.supports.command) flags.push("no-commands");
    lines.push(`  ${coral(id.padEnd(12), style)} ${state}${flags.length ? `  [${flags.join(",")}]` : ""}`);
  }
  return lines.join("\n");
}
