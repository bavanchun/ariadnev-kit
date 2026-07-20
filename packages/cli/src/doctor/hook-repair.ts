// Pure planner for `vcskill doctor --fix`: works out which applied hook bindings
// have drifted out of settings.json and produces the merged content to write it
// back. No fs here — the caller reads settings, backs up, and writes atomically.

import type { Receipt } from "../install/install-receipt.js";
import { mergeHookSettings, type HookBinding } from "../install/hook-settings-merge.js";
import { hasBindingCommand } from "./diagnose.js";

export interface HookRepairDeps {
  readSettingsJson(absPath: string): string | null;
}

export interface HookRepairOpts {
  home: string;
  cwd: string;
}

export interface HookRepair {
  providerId: string;
  settingsPath: string;
  /** Bindings that were missing and will be re-added. */
  added: HookBinding[];
  /** Full settings.json content to write. */
  nextContent: string;
}

function settingsPathFor(scope: "project" | "global", home: string, cwd: string): string {
  return `${scope === "global" ? home : cwd}/.claude/settings.json`;
}

/**
 * One repair per provider whose applied bindings drifted out of settings.json.
 * Providers already in sync (or with no applied bindings) are omitted. A missing
 * settings.json is treated as empty → all applied bindings are re-added.
 */
export function planHookRepair(
  receipt: Receipt | null,
  deps: HookRepairDeps,
  opts: HookRepairOpts,
): HookRepair[] {
  if (!receipt) return [];
  const repairs: HookRepair[] = [];

  for (const [providerId, install] of Object.entries(receipt.installs)) {
    if (!install) continue;
    const applied = install.hookBindings.filter((b) => b.applied);
    if (applied.length === 0) continue;

    const settingsPath = settingsPathFor(install.scope, opts.home, opts.cwd);
    const existing = deps.readSettingsJson(settingsPath) ?? "";
    const missing = applied.filter((b) => !hasBindingCommand(existing, b.event, b.command));
    if (missing.length === 0) continue;

    const added: HookBinding[] = missing.map((b) => ({ event: b.event, matcher: b.matcher, command: b.command }));
    repairs.push({ providerId, settingsPath, added, nextContent: mergeHookSettings(existing, added) });
  }

  return repairs;
}
