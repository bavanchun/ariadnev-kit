import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { loadKit } from "../kit/load-kit.js";
import { getKitRoot } from "../kit/embedded-kit.js";
import { getResolver, PROVIDER_IDS } from "../providers/index.js";
import type { Scope } from "../providers/resolver.js";
import { coral, teal, faint, type StyleOpts } from "../ui/style.js";
import { jsonEnvelope } from "./json-envelope.js";

export interface ListHandlerOpts {
  scope: Scope;
  home: string;
  cwd: string;
  kitRoot?: string;
  /** Branded coloring; false (default) is byte-identical to the plain form. */
  color?: boolean;
  json?: boolean;
}

export const LIST_SCHEMA_VERSION = 1;

/** `null` target means the provider has no verified skill path — nothing is written. */
export interface ProviderListState {
  provider: string;
  target: string | null;
  installed: boolean;
  supportsAgents: boolean;
  supportsCommands: boolean;
}

export interface ListData {
  scope: Scope;
  kit: { skills: string[]; agents: string[]; commands: string[]; rules: string[] };
  providers: ProviderListState[];
}

/**
 * What `list` knows, before any of it is turned into a line of text.
 *
 * The command used to build its strings directly, which left `--json` with
 * nothing to serialize but the rendering. Splitting the two is the only real
 * refactor in this batch, and it is what makes the text form and the machine
 * form provably the same answer rather than two computations of it.
 */
export function listData(opts: ListHandlerOpts): ListData {
  const kitRoot = opts.kitRoot ?? getKitRoot(dirname(fileURLToPath(import.meta.url)));
  const kit = loadKit(kitRoot);
  const ctx = { home: opts.home, cwd: opts.cwd, scope: opts.scope };
  const first = kit.skills[0];
  return {
    scope: opts.scope,
    kit: {
      skills: kit.skills.map((s) => s.name),
      agents: kit.agents.map((a) => a.name),
      commands: kit.commands.map((c) => c.name),
      rules: kit.rules.map((r) => r.name),
    },
    providers: PROVIDER_IDS.map((id) => {
      const r = getResolver(id);
      const target = first ? r.targetFor(first, ctx) : null;
      return {
        provider: id,
        target,
        installed: target ? existsSync(target) : false,
        supportsAgents: r.supports.agent,
        supportsCommands: r.supports.command,
      };
    }),
  };
}

/** Render kit contents and, per provider, whether the skill target exists. */
export function runList(opts: ListHandlerOpts): string {
  const data = listData(opts);
  if (opts.json) return jsonEnvelope(LIST_SCHEMA_VERSION, "list.kit", data);

  const style: StyleOpts = { color: !!opts.color };
  const lines: string[] = [`${coral("ariadnev", style)} kit:`];
  lines.push(`  skills:   ${data.kit.skills.join(", ") || "(none)"}`);
  lines.push(`  agents:   ${data.kit.agents.join(", ") || "(none)"}`);
  lines.push(`  commands: ${data.kit.commands.join(", ") || "(none)"}`);
  lines.push(`  rules:    ${data.kit.rules.join(", ") || "(none)"}`);
  lines.push("");
  lines.push(`install state (${data.scope}):`);
  for (const entry of data.providers) {
    const rawState = entry.target === null
      ? "(unsupported/unverified)"
      : entry.installed ? "installed" : "not installed";
    const state = entry.installed ? teal(rawState, style) : faint(rawState, style);
    const flags: string[] = [];
    if (!entry.supportsAgents) flags.push("no-agents");
    if (!entry.supportsCommands) flags.push("no-commands");
    lines.push(`  ${coral(entry.provider.padEnd(12), style)} ${state}${flags.length ? `  [${flags.join(",")}]` : ""}`);
  }
  return lines.join("\n");
}
