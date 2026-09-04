import { fileURLToPath } from "node:url";
import { jsonEnvelope } from "./json-envelope.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  inspectCodexHooks,
  renderLegacyWrapperNotice,
  type CodexHooksSource,
} from "../install/codex-legacy-wrapper.js";
import { loadKit } from "../kit/load-kit.js";
import { getKitRoot } from "../kit/embedded-kit.js";
import { installKit } from "../install/install-execute.js";
import { isProviderId, type ProviderId } from "../providers/index.js";
import type { ProviderInstallResult } from "../install/install-types.js";
import { mergeHooksConfig, renderHookSettingsSnippet } from "../install/hook-settings-merge.js";
import { renderSummary } from "./render-summary.js";
import { renderSharedSummary } from "../install/shared-writes.js";
import { hasVerifiedTargets } from "../providers/index.js";
import type { HealReport } from "../install/install-heal.js";

export interface InstallHandlerOpts {
  providers: string[];
  scope: "project" | "global";
  dryRun: boolean;
  home: string;
  cwd: string;
  /** Override kit source root (tests / packaging). */
  kitRoot?: string;
  /** Injected backup timestamp. */
  timestamp: string;
  /** User confirmed merging hook bindings into settings.json (prompt result). */
  applyHookSettings?: boolean;
  /** Installed ariadnev package version, recorded in the receipt. */
  ariadnevVersion?: string;
  /** Overwrite files the user has edited since the last install. */
  force?: boolean;
  json?: boolean;
}

export const INSTALL_SCHEMA_VERSION = 1;

export interface InstallHandlerResult {
  results: ProviderInstallResult[];
  summary: string;
}

function validateProviders(providers: string[]): ProviderId[] {
  if (providers.length === 0) throw new Error("no providers selected");
  const bad = providers.filter((p) => !isProviderId(p));
  if (bad.length) throw new Error(`unknown provider(s): ${bad.join(", ")}`);
  return providers as ProviderId[];
}

/**
 * What the install removed because this build no longer writes it there, and
 * what it deliberately did not.
 *
 * Silence here would be the wrong default: a heal deletes files from the user's
 * home directory, and a directory it could not clear is something only they can
 * resolve.
 */
function renderHealSummary(heal: HealReport): string {
  const lines: string[] = [];
  if (heal.removed.length > 0) {
    lines.push(`  removed ${heal.removed.length} file(s) this build no longer installs (backed up)`);
  }
  if (heal.wouldRemove.length > 0) {
    lines.push(`  would remove ${heal.wouldRemove.length} file(s) this build no longer installs (a real run backs them up first)`);
  }
  for (const entry of heal.preserved) {
    lines.push(`  kept ${entry.path} — ${entry.reason}`);
  }
  for (const dir of heal.survivingDirs) {
    lines.push(`  ${dir} still holds files no install recorded — review and remove it by hand`);
  }
  return lines.length > 0 ? `\n${lines.join("\n")}` : "";
}

/**
 * The providers in this run that can install nothing at all.
 *
 * A provider with no verified cell is not a failure — the evidence ladder says
 * skip rather than guess a path — but "written=0 skipped=156" at the end of a
 * long run reads as a breakage, and it arrives after the user has already
 * waited for it. Naming it up front makes it a stated outcome.
 */
function renderNoTargetWarning(providers: ProviderId[]): string {
  const empty = providers.filter((id) => !hasVerifiedTargets(id));
  if (empty.length === 0) return "";
  return `\n\n  ${empty.join(", ")}: no verified install target — nothing was written for ${
    empty.length === 1 ? "it" : "them"
  }.\n  Every artifact is skipped until that provider's layout can be observed rather than guessed.`;
}

/**
 * The Codex hook files this install shares with whatever else the user runs.
 *
 * Two locations, both observed carrying live trust entries at the same time:
 * the user-global file, and the one that arrives inside a cloned repository.
 * The docs list further layers — `config.toml [hooks]`, plugin bundles, an
 * enterprise `requirements.toml` — and they are deliberately absent: nothing
 * there was observed on disk, and reading a file we cannot confirm exists would
 * turn "not found" into a claim of cleanliness.
 *
 * The contents are parsed, never executed. `<repo>/.codex/hooks.json` arrives
 * with any clone, so running a command out of it to see what it does would mean
 * `av install` executing code from that clone.
 */
function codexHooksSources(home: string, cwd: string): CodexHooksSource[] {
  const sources: CodexHooksSource[] = [];
  for (const path of [join(home, ".codex", "hooks.json"), join(cwd, ".codex", "hooks.json")]) {
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      continue; // absent, or unreadable — either way there is nothing to report
    }
    try {
      sources.push({ path, contents: JSON.parse(raw) as unknown });
    } catch {
      // Unparseable is Codex's own error to raise against its own file. Guessing
      // at what the bytes meant would put a diagnosis in the user's hands that
      // the runtime does not agree with.
    }
  }
  return sources;
}

/**
 * What is still between a written Codex hook and a running one.
 *
 * Hooks that are on disk will still do nothing at all until the user approves
 * each one in Codex's TUI. There is no CLI subcommand that grants that, so an
 * install that stays silent here reads as a working install that silently does
 * nothing. The legacy-wrapper report rides along because it is the other thing
 * invisible in a file list: a stale wrapper in the same shared file turns a
 * clean deny into `Hook failed`.
 *
 * Whether the merge actually happened has to come from the caller. Declining it
 * leaves the op in the result exactly as accepting it does, and the summary
 * goes on to print the block for the user to paste — so reading registration
 * off the op's presence puts two contradictory sentences about one file in
 * front of them, with the false one first.
 */
export function renderCodexHookNotices(
  results: ProviderInstallResult[],
  home: string,
  cwd: string,
  applied: boolean,
): string {
  const codex = results.find((r) => r.provider === "codex");
  const merge = codex?.ops.find((op) => op.action === "hook-settings");
  if (!merge || merge.action !== "hook-settings") return "";

  const parts = [
    [
      applied
        ? `  codex: hooks are registered in ${merge.dest}, and stay untrusted until you approve them.`
        : `  codex: nothing was written to ${merge.dest} — the block below is yours to paste in,\n  and the hooks stay untrusted until you approve them.`,
      "  Run `/hooks` inside Codex to review and trust each one — no CLI subcommand does it.",
      "  `--dangerously-bypass-hook-trust` is a flag you pass to Codex per session, not something",
      "  an install can set on your behalf.",
    ].join("\n"),
  ];
  const legacy = renderLegacyWrapperNotice(
    inspectCodexHooks(codexHooksSources(home, cwd), merge.ownedDir),
  );
  if (legacy !== "") parts.push(legacy);
  return `\n\n${parts.join("\n\n")}`;
}

/** Pure-ish handler: resolves providers, loads kit, installs, returns summary. */
export function runInstall(opts: InstallHandlerOpts): InstallHandlerResult {
  const providers = validateProviders(opts.providers);
  const kitRoot = opts.kitRoot ?? getKitRoot(dirname(fileURLToPath(import.meta.url)));
  const kit = loadKit(kitRoot);
  const { results, heal, shared } = installKit(
    kit,
    providers,
    { home: opts.home, cwd: opts.cwd, scope: opts.scope },
    {
      dryRun: opts.dryRun,
      timestamp: opts.timestamp,
      applyHookSettings: opts.applyHookSettings,
      ariadnevVersion: opts.ariadnevVersion,
      force: opts.force,
    },
  );
  if (opts.json) {
    return {
      results,
      summary: jsonEnvelope(INSTALL_SCHEMA_VERSION, "install.run", {
        dryRun: opts.dryRun,
        scope: opts.scope,
        providers: results.map((r) => ({
          provider: r.provider,
          written: r.written,
          backedUp: r.backedUp,
          skipped: r.skipped.map((s) => ({ kind: s.kind, name: s.name, reason: s.reason })),
        })),
        heal,
        shared,
      }),
    };
  }
  let summary = renderSummary(results, opts.dryRun);
  summary += renderNoTargetWarning(providers);
  // Resolved before the write, then reported. Two providers sharing a
  // destination is a legitimate configuration — the roots are shared by design
  // — but which one's adaptation ends up in the file is not something to leave
  // to the order they happen to run in.
  summary += renderSharedSummary(shared).join("\n");
  summary += renderHealSummary(heal);
  summary += renderCodexHookNotices(results, opts.home, opts.cwd, opts.applyHookSettings === true);
  if (!opts.applyHookSettings) {
    // Merge declined or non-interactive: hand the user the exact block instead.
    const hookOp = results
      .flatMap((r) => r.ops)
      .find((o) => o.action === "hook-settings");
    if (hookOp && hookOp.action === "hook-settings") {
      // The same bindings render differently per registry — codex groups by
      // (event, matcher) and omits an absent matcher where the settings.json
      // merger writes `*` — so the block the user pastes comes from the same
      // dispatcher the write path uses, against an empty file.
      const merged = mergeHooksConfig(hookOp.format, "", hookOp.bindings, hookOp.ownedDir);
      summary += `\n\n${renderHookSettingsSnippet(merged, hookOp.dest)}`;
    }
  }
  return { results, summary };
}
