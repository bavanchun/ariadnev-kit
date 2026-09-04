// Pure health-check core for `ariadnev doctor`. Reads a parsed receipt +
// injected fs/spawn adapters, returns findings — no fs/spawn calls happen
// here directly, so this is fully unit-testable without a real install.
import { fromPortablePath, receiptVersion, toPortablePath, type Receipt, type ReceiptInstall } from "../install/install-receipt.js";
import type { HealRemoval } from "../install/install-heal.js";
import { makeResolver, type ProviderResolver, type Scope } from "../providers/resolver.js";
import { isProviderId } from "../providers/index.js";
import { HOOK_RUNTIME_MARKER_FILE, hookRuntimeMarkerPath, isHookRuntimeMarkerValid } from "../install/hook-runtime-marker.js";

// Tri-state (plus warning). `pass`/`skip` are informational rows; only `fail`
// affects the exit code (see deriveStatus). `warning` surfaces but never fails.
export type FindingLevel = "pass" | "skip" | "warning" | "fail";

export interface ProviderFinding {
  providerId: string;
  level: FindingLevel;
  message: string;
  /** Exact command that resolves the finding, e.g. "ariadnev doctor --fix". */
  remedy?: string;
  /** Health-score deduction (0–100 scale). Only fail/warning carry weight. */
  weight?: number;
}

export type DoctorStatus = "healthy" | "degraded" | "not-installed";

export interface DiagnoseDeps {
  fileExists(absPath: string): boolean;
  /** Whether an install directory exists; separate from a receipt-file check. */
  dirExists(absPath: string): boolean;
  /** List direct entries in a directory; null when it is missing or unreadable. */
  listDir(absPath: string): string[] | null;
  /**
   * Read a provider's hook-binding registry at the given absolute path; null if
   * missing/unreadable. Which file that is comes from the provider, not from
   * here — claude-code's settings.json and codex's hooks.json are both read
   * through this one adapter.
   */
  readHooksConfig(absPath: string): string | null;
  /** Spawn-check a hook file; true if it exits 0 against an empty stdin payload. */
  hookExecutable(absPath: string): boolean;
  /** Read the hook runtime marker at the given absolute path; null if missing/unreadable. */
  readHookRuntimeMarker(absPath: string): string | null;
}

export interface DiagnoseOpts {
  home: string;
  cwd: string;
  currentVersion: string;
  /** Legacy files recorded by an interrupted heal journal. */
  pendingHealRemovals?: HealRemoval[];
}

/**
 * The portable prefix every file in one provider's hooks tree starts with.
 *
 * Receipt paths are portable, so the absolute tree the resolver returns is
 * converted back rather than the other way round. A literal here would answer
 * for claude-code no matter which provider is being diagnosed, which is how a
 * second provider's hooks end up judged against the first one's tree.
 */
function hooksPrefix(resolver: ProviderResolver, scope: Scope, opts: DiagnoseOpts): string {
  const abs = resolver.hooksTarget({ home: opts.home, cwd: opts.cwd, scope });
  return `${toPortablePath(abs, opts.home, opts.cwd)}/`;
}

function isHookFile(path: string, prefix: string): boolean {
  return path.startsWith(prefix) && path.endsWith(".cjs") && !path.includes("_lib/");
}

function isHookRuntimeMarker(path: string, prefix: string): boolean {
  return path.startsWith(prefix) && path.endsWith(HOOK_RUNTIME_MARKER_FILE);
}

// A hook install without its runtime marker is the failure nothing else
// reports: every hook still loads and exits 0, and the session-state family
// simply never writes. Presence and shape are checked here rather than in the
// receipt loop so an install whose receipt predates the marker is caught too.
function hookRuntimeMarkerFinding(
  providerId: string,
  resolver: ProviderResolver,
  install: ReceiptInstall,
  deps: DiagnoseDeps,
  opts: DiagnoseOpts,
): ProviderFinding | null {
  const prefix = hooksPrefix(resolver, install.scope, opts);
  if (!install.files.some((f) => isHookFile(f.path, prefix))) return null;
  const abs = hookRuntimeMarkerPath(resolver.hooksTarget({ home: opts.home, cwd: opts.cwd, scope: install.scope }));
  const shown = toPortablePath(abs, opts.home, opts.cwd);
  const text = deps.readHookRuntimeMarker(abs);
  if (text === null) {
    return {
      providerId,
      level: "fail",
      weight: 8,
      remedy: "ariadnev install",
      message: `hook runtime marker missing: ${shown} — session-state hooks stay silent without it`,
    };
  }
  if (!isHookRuntimeMarkerValid(text, providerId)) {
    return {
      providerId,
      level: "fail",
      weight: 8,
      remedy: "ariadnev install",
      message: `hook runtime marker does not name ${providerId}: ${shown}`,
    };
  }
  return null;
}

function legacySkillDirs(removals: HealRemoval[], opts: DiagnoseOpts): string[] {
  const dirs = new Set<string>();
  for (const file of removals) {
    if (!file.path.endsWith("/SKILL.md")) continue;
    const path = fromPortablePath(file.path, opts.home, opts.cwd);
    const dir = path.slice(0, -"/SKILL.md".length);
    const name = dir.slice(dir.lastIndexOf("/") + 1);
    if (!name.startsWith("av-")) dirs.add(dir);
  }
  return [...dirs];
}

/**
 * Whether a binding is still registered in a provider's hook config.
 *
 * Format-agnostic on purpose: claude-code's settings.json and codex's hooks.json
 * spell an event the same way — `hooks.<Event>` holding groups of
 * `{type, command}` handlers — so the drift question has one answer for both.
 * Only the *write* differs, which is why merging dispatches on format and this
 * does not.
 */
export function hasBindingCommand(hooksConfigJson: string, event: string, command: string): boolean {
  try {
    const parsed = JSON.parse(hooksConfigJson) as { hooks?: Record<string, unknown> };
    const groups = parsed.hooks?.[event];
    return JSON.stringify(groups ?? "").includes(JSON.stringify(command));
  } catch {
    return false;
  }
}

/** Diagnose every provider recorded in the receipt; [] when receipt is null/empty. */
export function diagnose(receipt: Receipt | null, deps: DiagnoseDeps, opts: DiagnoseOpts): ProviderFinding[] {
  if (!receipt) return [];
  const findings: ProviderFinding[] = [];

  for (const dir of legacySkillDirs(opts.pendingHealRemovals ?? [], opts)) {
    const name = dir.slice(dir.lastIndexOf("/") + 1);
    const prefixedDir = `${dir.slice(0, -name.length)}av-${name}`;
    if (!deps.dirExists(prefixedDir)) continue;
    const entries = deps.listDir(dir);
    if (entries !== null && entries.length > 0) {
      findings.push({
        providerId: "heal",
        level: "fail",
        weight: 10,
        remedy: "ariadnev install",
        message: `legacy skill directory remains from this receipt: ${dir}`,
      });
    }
  }

  for (const [providerId, install] of Object.entries(receipt.installs)) {
    if (!install) continue;
    // A receipt written by an older build can name a provider this one dropped.
    // Reporting it as unknown beats crashing the whole health check on it.
    if (!isProviderId(providerId)) {
      findings.push({ providerId, level: "skip", message: "unknown provider in receipt — nothing to verify" });
      continue;
    }
    const resolver = makeResolver(providerId);
    const prefix = hooksPrefix(resolver, install.scope, opts);

    const applied = install.hookBindings.filter((b) => b.applied);
    // Nothing recorded to verify → an informational skip, not a green pass.
    if (install.files.length === 0 && applied.length === 0) {
      findings.push({ providerId, level: "skip", message: "nothing to verify (no files or hook bindings recorded)" });
      continue;
    }

    const before = findings.length;

    for (const file of install.files) {
      // The marker check below owns this file, so it is one row, not two.
      if (isHookRuntimeMarker(file.path, prefix)) continue;
      const abs = fromPortablePath(file.path, opts.home, opts.cwd);
      if (!deps.fileExists(abs)) {
        findings.push({ providerId, level: "fail", weight: 10, remedy: "ariadnev install", message: `missing file: ${file.path}` });
        continue;
      }
      if (isHookFile(file.path, prefix) && !deps.hookExecutable(abs)) {
        findings.push({ providerId, level: "fail", weight: 8, remedy: "ariadnev install", message: `hook failed to execute: ${file.path}` });
      }
    }

    const marker = hookRuntimeMarkerFinding(providerId, resolver, install, deps, opts);
    if (marker) findings.push(marker);

    // Each provider is asked about its own registry. A provider that discovers
    // hooks by directory has none, and there is no file whose absence could mean
    // anything — checking one anyway would read whichever provider's config was
    // hardcoded and report this provider on somebody else's file.
    const configAbs = applied.length > 0 ? resolver.hooksConfigTarget({ home: opts.home, cwd: opts.cwd, scope: install.scope }) : null;
    if (configAbs !== null) {
      const shownConfig = toPortablePath(configAbs, opts.home, opts.cwd);
      const hooksConfigJson = deps.readHooksConfig(configAbs);
      if (hooksConfigJson === null) {
        findings.push({
          providerId,
          level: "fail",
          weight: 10,
          remedy: "ariadnev doctor --fix",
          message: `${shownConfig} missing but hook bindings were applied at install time`,
        });
      } else {
        for (const b of applied) {
          if (!hasBindingCommand(hooksConfigJson, b.event, b.command)) {
            findings.push({
              providerId,
              level: "fail",
              weight: 10,
              remedy: "ariadnev doctor --fix",
              message: `hook binding removed from ${shownConfig}: ${b.event} -> ${b.command}`,
            });
          }
        }
      }
    }

    const recordedVersion = receiptVersion(receipt);
    if (install.timestamp && recordedVersion !== opts.currentVersion) {
      findings.push({
        providerId,
        level: "warning",
        weight: 5,
        remedy: "ariadnev update",
        message: `receipt recorded version ${recordedVersion ?? "(none)"}, running ${opts.currentVersion} — consider "ariadnev update"`,
      });
    }

    // No problem row added for this provider → a green pass line.
    if (findings.length === before) {
      findings.push({ providerId, level: "pass", message: `${install.files.length} file(s) present, bindings intact` });
    }
  }

  return findings;
}

/** Roll findings + receipt presence up into one overall status. Only `fail`
 * findings degrade — pass/skip/warning never do, preserving the exit contract. */
export function deriveStatus(receipt: Receipt | null, findings: ProviderFinding[]): DoctorStatus {
  if (!receipt || Object.keys(receipt.installs).length === 0) return "not-installed";
  return findings.some((f) => f.level === "fail") ? "degraded" : "healthy";
}
