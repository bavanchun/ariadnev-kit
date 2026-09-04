// Pure planner for `ariadnev doctor --fix`: works out which applied hook bindings
// have drifted out of a provider's hook config and produces the merged content
// to write it back. No fs here — the caller reads the config, backs up, and
// writes atomically.

import type { Receipt } from "../install/install-receipt.js";
import { mergeHooksConfig, type HookBinding } from "../install/hook-settings-merge.js";
import { makeResolver } from "../providers/resolver.js";
import { isProviderId } from "../providers/index.js";
import { hasBindingCommand } from "./diagnose.js";

export interface HookRepairDeps {
  readHooksConfig(absPath: string): string | null;
}

export interface HookRepairOpts {
  home: string;
  cwd: string;
}

export interface HookRepair {
  providerId: string;
  /** The provider's own hook-binding registry — not a shared constant. */
  configPath: string;
  /** Bindings that were missing and will be re-added. */
  added: HookBinding[];
  /** Full config content to write. */
  nextContent: string;
}

/**
 * One repair per provider whose applied bindings drifted out of its hook config.
 * Providers already in sync (or with no applied bindings) are omitted. A missing
 * config file is treated as empty → all applied bindings are re-added.
 *
 * Both the path and the merger come from the provider being repaired. Writing
 * one provider's bindings into another's config is the failure this replaced:
 * every provider shared one hardcoded `.claude/settings.json`, so repairing a
 * second provider edited Claude Code's config with commands Claude Code never
 * installed.
 */
export function planHookRepair(
  receipt: Receipt | null,
  deps: HookRepairDeps,
  opts: HookRepairOpts,
): HookRepair[] {
  if (!receipt) return [];
  const repairs: HookRepair[] = [];

  for (const [providerId, install] of Object.entries(receipt.installs)) {
    if (!install || !isProviderId(providerId)) continue;
    const applied = install.hookBindings.filter((b) => b.applied);
    if (applied.length === 0) continue;

    const resolver = makeResolver(providerId);
    const ctx = { home: opts.home, cwd: opts.cwd, scope: install.scope };
    const configPath = resolver.hooksConfigTarget(ctx);
    // No registry means the bindings never reached a file, so there is nothing
    // for them to have drifted out of.
    if (configPath === null || resolver.hooksConfigFormat === null) continue;

    const existing = deps.readHooksConfig(configPath) ?? "";
    const missing = applied.filter((b) => !hasBindingCommand(resolver.hooksConfigFormat!, existing, b.event, b.command));
    if (missing.length === 0) continue;

    const added: HookBinding[] = missing.map((b) => ({ event: b.event, matcher: b.matcher, command: b.command }));
    repairs.push({
      providerId,
      configPath,
      added,
      // The full applied set, not just the missing ones: a merger that rebuilds
      // its own groups from the bindings it is given would drop the entries that
      // are still there if handed only the gaps.
      nextContent: mergeHooksConfig(
        resolver.hooksConfigFormat,
        existing,
        applied.map(({ event, matcher, command }) => ({ event, matcher, command })),
        resolver.hooksTarget(ctx),
      ),
    });
  }

  return repairs;
}
