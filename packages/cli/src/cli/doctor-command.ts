import { existsSync, readFileSync } from "node:fs";
import { jsonEnvelope } from "./json-envelope.js";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import type { Receipt } from "../install/install-receipt.js";
import { diagnose, deriveStatus, type DiagnoseDeps, type DoctorStatus, type ProviderFinding } from "../doctor/diagnose.js";
import { planHookRepair } from "../doctor/hook-repair.js";
import { atomicWrite } from "../install/fs-atomic.js";
import { backupPath, rotateBackups } from "../install/backup.js";
import { loadKit } from "../kit/load-kit.js";
import { getKitRoot } from "../kit/embedded-kit.js";
import { packageVersion } from "../version.js";
import { scoreAudit } from "../doctor/audit-score.js";
import { coral, teal, amber, faint, bar, symbols, type StyleOpts } from "../ui/style.js";
import { ed25519SelfTest } from "./update-signature.js";

export interface DoctorHandlerOpts {
  home: string;
  cwd: string;
  scope: "project" | "global";
  /** Re-merge any hook bindings that drifted out of settings.json. */
  fix?: boolean;
  /** With --fix, only report what would change; write nothing. */
  dryRun?: boolean;
  /** Timestamp for the backup dir when --fix writes (defaults to a literal). */
  timestamp?: string;
  /** Override kit source root (tests / packaging). */
  kitRoot?: string;
  /** Branded coloring; false (default) keeps output plain for pipes/tests. */
  color?: boolean;
  json?: boolean;
}

export const DOCTOR_SCHEMA_VERSION = 1;

export interface DoctorHandlerResult {
  status: DoctorStatus;
  exitCode: 0 | 1 | 2;
  summary: string;
}

function readReceipt(root: string): Receipt | null {
  const path = join(root, ".ariadnev", "receipt.json");
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
      // Hooks are Node .cjs scripts run by the host (Claude Code) with node — so
      // verify them with node, not process.execPath (which is the ariadnev binary
      // itself when running as a compiled single-file executable).
      const runtime = basename(process.execPath).toLowerCase().startsWith("node")
        ? process.execPath
        : "node";
      const res = spawnSync(runtime, [p], { input: "{}", encoding: "utf8", timeout: 5000 });
      // ENOENT (node not on PATH) → cannot verify; don't flag an existing hook as
      // broken. Any other non-zero exit is a real failure.
      if (res.error && (res.error as NodeJS.ErrnoException).code === "ENOENT") return true;
      return res.status === 0;
    },
  };
}

function kitLintFinding(kitRoot: string | undefined): ProviderFinding | null {
  try {
    const root = kitRoot ?? getKitRoot(dirname(fileURLToPath(import.meta.url)));
    loadKit(root);
    return null;
  } catch (err) {
    return { providerId: "kit", level: "fail", weight: 10, remedy: "ariadnev validate", message: `kit failed to load: ${String(err instanceof Error ? err.message : err)}` };
  }
}

function glyphFor(level: ProviderFinding["level"], opts: StyleOpts): string {
  switch (level) {
    case "pass": return teal(symbols.ok, opts);
    case "warning": return amber(symbols.warn, opts);
    case "fail": return coral(symbols.fail, opts);
    case "skip": return faint(symbols.skip, opts);
  }
}

/**
 * Whether this binary can verify a release signature at all.
 *
 * Stated on every run because fail-closed verification and a runtime with no
 * Ed25519 look identical from outside — both refuse every update — and the two
 * need completely different responses.
 */
function cryptoLine(opts: StyleOpts): string {
  return ed25519SelfTest()
    ? `  ${teal(symbols.ok, opts)} ed25519: available (release signatures can be verified)`
    : `  ${coral(symbols.fail, opts)} ed25519: UNAVAILABLE — \`ariadnev update\` cannot verify a release on this platform`;
}

export function renderDoctorSummary(
  status: DoctorStatus,
  findings: ProviderFinding[],
  opts: StyleOpts = { color: false },
): string {
  const head = `${coral("ariadnev", opts)} doctor — ${status}`;
  if (status === "not-installed") {
    // The crypto line belongs here too: it is a property of the binary, not of
    // the install, and someone diagnosing a platform problem has no receipt yet.
    return `${head}\n  no receipt found — run \`ariadnev install\` first\n${cryptoLine(opts)}`;
  }
  const { score } = scoreAudit(findings);
  const lines: string[] = [`${head}   ${faint("health", opts)} ${bar(score, opts)} ${score}`, cryptoLine(opts)];
  if (findings.length === 0) {
    lines.push(`  ${teal(symbols.ok, opts)} all checks passed`);
    return lines.join("\n");
  }
  for (const f of findings) {
    lines.push(`  ${glyphFor(f.level, opts)} ${f.providerId}: ${f.message}`);
    if (f.remedy) lines.push(faint(`      ↳ run  ${f.remedy}`, opts));
  }
  return lines.join("\n");
}

/** Re-merge drifted hook bindings back into settings.json, backing up first. */
function applyHookFix(receipt: Receipt | null, deps: DiagnoseDeps, root: string, opts: DoctorHandlerOpts): string[] {
  let repairs;
  try {
    repairs = planHookRepair(receipt, deps, { home: opts.home, cwd: opts.cwd });
  } catch (err) {
    // Corrupt settings.json → report instead of crashing the health-check.
    return [`  cannot auto-fix: settings.json is unparseable (${String(err instanceof Error ? err.message : err)})`];
  }
  if (repairs.length === 0) return [];
  const verb = opts.dryRun ? "would fix" : "fixed";
  const lines = repairs.map((r) => `  ${verb} ${r.added.length} hook binding(s) for ${r.providerId} → ${r.settingsPath}`);
  if (opts.dryRun) return lines;

  const backupsParent = join(root, ".ariadnev", "backups");
  const backupRoot = join(backupsParent, opts.timestamp ?? "doctor-fix");
  for (const r of repairs) {
    backupPath(r.settingsPath, backupRoot, "settings", root);
    atomicWrite(r.settingsPath, r.nextContent);
  }
  rotateBackups(backupsParent, 3);
  return lines;
}

/** Pure-ish handler: reads the receipt, optionally repairs, diagnoses, renders. */
export function runDoctor(opts: DoctorHandlerOpts): DoctorHandlerResult {
  const root = opts.scope === "global" ? opts.home : opts.cwd;
  const receipt = readReceipt(root);
  const deps = realDeps();

  // --fix runs BEFORE diagnose so the post-repair diagnosis reflects the fix.
  const fixLines = opts.fix ? applyHookFix(receipt, deps, root, opts) : [];

  const findings = diagnose(receipt, deps, {
    home: opts.home,
    cwd: opts.cwd,
    currentVersion: packageVersion(),
  });
  const kitFinding = kitLintFinding(opts.kitRoot);
  const allFindings = kitFinding ? [...findings, kitFinding] : findings;
  const status = deriveStatus(receipt, allFindings);
  const exitCode: 0 | 1 | 2 = status === "healthy" ? 0 : status === "degraded" ? 1 : 2;
  if (opts.json) {
    // `exitCode` is in the payload as well as the process status because
    // doctor's 0/1/2 mapping predates the shared exit table and is its own
    // contract — a machine reader should not have to know that.
    const data = { status, exitCode, findings: allFindings, ...(opts.fix ? { fixed: fixLines } : {}) };
    return { status, exitCode, summary: jsonEnvelope(DOCTOR_SCHEMA_VERSION, "doctor.diagnose", data) };
  }
  const summary = [renderDoctorSummary(status, allFindings, { color: !!opts.color }), ...fixLines].join("\n");
  return { status, exitCode, summary };
}
