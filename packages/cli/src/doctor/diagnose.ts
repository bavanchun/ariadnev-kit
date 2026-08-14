// Pure health-check core for `ariadnev doctor`. Reads a parsed receipt +
// injected fs/spawn adapters, returns findings — no fs/spawn calls happen
// here directly, so this is fully unit-testable without a real install.
import { fromPortablePath, receiptVersion, type Receipt } from "../install/install-receipt.js";

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
  /** Read `.claude/settings.json` at the given absolute path; null if missing/unreadable. */
  readSettingsJson(absPath: string): string | null;
  /** Spawn-check a hook file; true if it exits 0 against an empty stdin payload. */
  hookExecutable(absPath: string): boolean;
}

export interface DiagnoseOpts {
  home: string;
  cwd: string;
  currentVersion: string;
}

function isHookFile(path: string): boolean {
  return path.includes(".claude/hooks/av/") && path.endsWith(".cjs") && !path.includes("_lib/");
}

function settingsPathFor(scope: "project" | "global", home: string, cwd: string): string {
  const root = scope === "global" ? home : cwd;
  return `${root}/.claude/settings.json`;
}

export function hasBindingCommand(settingsJson: string, event: string, command: string): boolean {
  try {
    const parsed = JSON.parse(settingsJson) as { hooks?: Record<string, unknown> };
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

  for (const [providerId, install] of Object.entries(receipt.installs)) {
    if (!install) continue;

    const applied = install.hookBindings.filter((b) => b.applied);
    // Nothing recorded to verify → an informational skip, not a green pass.
    if (install.files.length === 0 && applied.length === 0) {
      findings.push({ providerId, level: "skip", message: "nothing to verify (no files or hook bindings recorded)" });
      continue;
    }

    const before = findings.length;

    for (const file of install.files) {
      const abs = fromPortablePath(file.path, opts.home, opts.cwd);
      if (!deps.fileExists(abs)) {
        findings.push({ providerId, level: "fail", weight: 10, remedy: "ariadnev install", message: `missing file: ${file.path}` });
        continue;
      }
      if (isHookFile(file.path) && !deps.hookExecutable(abs)) {
        findings.push({ providerId, level: "fail", weight: 8, remedy: "ariadnev install", message: `hook failed to execute: ${file.path}` });
      }
    }

    if (applied.length > 0) {
      const settingsAbs = settingsPathFor(install.scope, opts.home, opts.cwd);
      const settingsJson = deps.readSettingsJson(settingsAbs);
      if (settingsJson === null) {
        findings.push({
          providerId,
          level: "fail",
          weight: 10,
          remedy: "ariadnev doctor --fix",
          message: "settings.json missing but hook bindings were applied at install time",
        });
      } else {
        for (const b of applied) {
          if (!hasBindingCommand(settingsJson, b.event, b.command)) {
            findings.push({
              providerId,
              level: "fail",
              weight: 10,
              remedy: "ariadnev doctor --fix",
              message: `hook binding removed from settings.json: ${b.event} -> ${b.command}`,
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
