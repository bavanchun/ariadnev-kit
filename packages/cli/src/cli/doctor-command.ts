import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import type { Receipt } from "../install/install-receipt.js";
import { diagnose, deriveStatus, type DiagnoseDeps, type DoctorStatus, type ProviderFinding } from "../doctor/diagnose.js";
import { loadKit, resolveKitRoot } from "../kit/load-kit.js";
import { packageVersion } from "../version.js";

export interface DoctorHandlerOpts {
  home: string;
  cwd: string;
  scope: "project" | "global";
  /** Override kit source root (tests / packaging). */
  kitRoot?: string;
}

export interface DoctorHandlerResult {
  status: DoctorStatus;
  exitCode: 0 | 1 | 2;
  summary: string;
}

function readReceipt(root: string): Receipt | null {
  const path = join(root, ".vcskill", "receipt.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Receipt;
  } catch {
    return null;
  }
}

function realDeps(): DiagnoseDeps {
  return {
    fileExists: (p) => existsSync(p),
    readSettingsJson: (p) => (existsSync(p) ? readFileSync(p, "utf8") : null),
    hookExecutable: (p) => {
      if (!existsSync(p)) return false;
      const res = spawnSync(process.execPath, [p], { input: "{}", encoding: "utf8", timeout: 5000 });
      return res.status === 0;
    },
  };
}

function kitLintFinding(kitRoot: string | undefined): ProviderFinding | null {
  try {
    const root = kitRoot ?? resolveKitRoot(dirname(fileURLToPath(import.meta.url)));
    loadKit(root);
    return null;
  } catch (err) {
    return { providerId: "kit", level: "error", message: `kit failed to load: ${String(err instanceof Error ? err.message : err)}` };
  }
}

export function renderDoctorSummary(status: DoctorStatus, findings: ProviderFinding[]): string {
  const lines: string[] = [`vcskill doctor — ${status}`];
  if (status === "not-installed") {
    lines.push("  no receipt found — run `vcskill install` first");
    return lines.join("\n");
  }
  if (findings.length === 0) {
    lines.push("  all checks passed");
    return lines.join("\n");
  }
  for (const f of findings) {
    lines.push(`  [${f.level}] ${f.providerId}: ${f.message}`);
  }
  return lines.join("\n");
}

/** Pure-ish handler: reads the receipt, diagnoses, renders a summary + exit code. */
export function runDoctor(opts: DoctorHandlerOpts): DoctorHandlerResult {
  const root = opts.scope === "global" ? opts.home : opts.cwd;
  const receipt = readReceipt(root);
  const findings = diagnose(receipt, realDeps(), {
    home: opts.home,
    cwd: opts.cwd,
    currentVersion: packageVersion(),
  });
  const kitFinding = kitLintFinding(opts.kitRoot);
  const allFindings = kitFinding ? [...findings, kitFinding] : findings;
  const status = deriveStatus(receipt, allFindings);
  const exitCode: 0 | 1 | 2 = status === "healthy" ? 0 : status === "degraded" ? 1 : 2;
  return { status, exitCode, summary: renderDoctorSummary(status, allFindings) };
}
