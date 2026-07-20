// Pure health-check core for `vcskill doctor`. Reads a parsed receipt +
// injected fs/spawn adapters, returns findings — no fs/spawn calls happen
// here directly, so this is fully unit-testable without a real install.
import { fromPortablePath, type Receipt } from "../install/install-receipt.js";

export type FindingLevel = "error" | "warning";

export interface ProviderFinding {
  providerId: string;
  level: FindingLevel;
  message: string;
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
  return path.includes(".claude/hooks/vc/") && path.endsWith(".cjs") && !path.includes("_lib/");
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

    for (const file of install.files) {
      const abs = fromPortablePath(file.path, opts.home, opts.cwd);
      if (!deps.fileExists(abs)) {
        findings.push({ providerId, level: "error", message: `missing file: ${file.path}` });
        continue;
      }
      if (isHookFile(file.path) && !deps.hookExecutable(abs)) {
        findings.push({ providerId, level: "error", message: `hook failed to execute: ${file.path}` });
      }
    }

    const applied = install.hookBindings.filter((b) => b.applied);
    if (applied.length > 0) {
      const settingsAbs = settingsPathFor(install.scope, opts.home, opts.cwd);
      const settingsJson = deps.readSettingsJson(settingsAbs);
      if (settingsJson === null) {
        findings.push({
          providerId,
          level: "error",
          message: "settings.json missing but hook bindings were applied at install time",
        });
      } else {
        for (const b of applied) {
          if (!hasBindingCommand(settingsJson, b.event, b.command)) {
            findings.push({
              providerId,
              level: "error",
              message: `hook binding removed from settings.json: ${b.event} -> ${b.command}`,
            });
          }
        }
      }
    }

    if (install.timestamp && receipt.vcskillVersion !== opts.currentVersion) {
      findings.push({
        providerId,
        level: "warning",
        message: `receipt recorded vcskillVersion ${receipt.vcskillVersion}, running ${opts.currentVersion} — consider "vcskill update"`,
      });
    }
  }

  return findings;
}

/** Roll findings + receipt presence up into one overall status. */
export function deriveStatus(receipt: Receipt | null, findings: ProviderFinding[]): DoctorStatus {
  if (!receipt || Object.keys(receipt.installs).length === 0) return "not-installed";
  return findings.some((f) => f.level === "error") ? "degraded" : "healthy";
}
