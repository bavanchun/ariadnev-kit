// `ariadnev audit` — per-file drift against the install receipt, and a scan of
// the executable scripts a kit ships. Real fs access lives here; the
// classification and scanning are pure modules under doctor/.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { auditReceipt, type AuditDeps, type AuditResult, type AuditStatus } from "../doctor/audit.js";
import { auditScripts, type ScriptsAuditResult } from "../doctor/audit-scripts.js";
import { getKitRoot } from "../kit/embedded-kit.js";
import { IGNORE_DIRS } from "../install/install-types.js";
import type { Receipt } from "../install/install-receipt.js";

// Bump when the `--json` envelope shape changes incompatibly.
export const AUDIT_PROTOCOL_VERSION = "1";

export interface AuditHandlerOpts {
  /** "kit" (default) audits installed files; "scripts" scans shipped scripts. */
  target: "kit" | "scripts";
  home: string;
  cwd: string;
  scope: "project" | "global";
  json?: boolean;
  /** Count untracked files as failures too. */
  strict?: boolean;
  /** Override kit source root (tests / packaging). */
  kitRoot?: string;
}

export interface AuditHandlerResult {
  output: string;
  exitCode: 0 | 1;
}

const realDeps: AuditDeps = {
  hashFile(abs) {
    try {
      // Streaming would only pay off for files far larger than a kit ships;
      // the whole tree is read in one pass either way.
      return createHash("sha256").update(readFileSync(abs)).digest("hex");
    } catch {
      return null;
    }
  },
  listFiles(abs) {
    try {
      return readdirSync(abs, { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => e.name);
    } catch {
      return [];
    }
  },
};

function readReceipt(root: string): Receipt | null {
  const path = join(root, ".ariadnev", "receipt.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Receipt;
  } catch {
    return null;
  }
}

const STATUS_ORDER: AuditStatus[] = ["missing", "modified", "untracked", "ok"];

function renderKit(result: AuditResult, strict: boolean): string {
  const lines = ["ariadnev audit"];
  const problems = result.entries.filter((e) => e.status !== "ok");
  if (result.entries.length === 0) {
    lines.push("  no install receipt found — nothing to audit");
    return lines.join("\n");
  }
  for (const status of STATUS_ORDER) {
    if (status === "ok") continue;
    for (const e of problems.filter((p) => p.status === status)) {
      lines.push(`  ${status.padEnd(9)} ${e.path}  (${e.providerId})`);
    }
  }
  const { ok, modified, missing, untracked } = result.counts;
  lines.push(`  ${ok} ok, ${modified} modified, ${missing} missing, ${untracked} untracked`);
  if (untracked > 0 && !strict) {
    lines.push("  untracked files are informational; --strict makes them fail");
  }
  if (!result.ok) lines.push('  remedy: "ariadnev install" to restore, or "ariadnev uninstall" to remove');
  return lines.join("\n");
}

function renderScripts(result: ScriptsAuditResult): string {
  const lines = ["ariadnev audit scripts"];
  for (const report of result.reports) {
    if (report.risks.length === 0) continue;
    lines.push(`  ${report.path}`);
    for (const risk of report.risks) {
      lines.push(`    ${risk.severity.padEnd(6)} ${risk.id.padEnd(22)} :${risk.line}  ${risk.excerpt}`);
    }
  }
  lines.push(
    `  ${result.reports.length} script(s) scanned, ${result.flagged} flagged ` +
      `(${result.counts.high} high, ${result.counts.medium} medium)`,
  );
  return lines.join("\n");
}

/** Every executable-ish script in the kit, with its content. */
function collectScripts(kitRoot: string): { path: string; content: string }[] {
  const exts = new Set([".sh", ".bash", ".zsh", ".py", ".js", ".mjs", ".cjs"]);
  const out: { path: string; content: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const dot = entry.name.lastIndexOf(".");
      const ext = dot === -1 ? "" : entry.name.slice(dot);
      // Extension-less files with the executable bit are scripts too — that is
      // how a hook or a helper usually ships.
      const executable = (statSync(abs).mode & 0o100) !== 0;
      if (!exts.has(ext) && !(ext === "" && executable)) continue;
      out.push({ path: relative(kitRoot, abs), content: readFileSync(abs, "utf8") });
    }
  };
  walk(kitRoot);
  return out;
}

export function runAudit(opts: AuditHandlerOpts): AuditHandlerResult {
  if (opts.target === "scripts") {
    const kitRoot = opts.kitRoot ?? getKitRoot(dirname(fileURLToPath(import.meta.url)));
    const result = auditScripts(collectScripts(kitRoot));
    // Risky constructs in a script that ships are a fact to surface, not a
    // broken install — they only fail the run under --strict.
    const failed = opts.strict && result.flagged > 0;
    const output = opts.json
      ? JSON.stringify({ protocol_version: AUDIT_PROTOCOL_VERSION, target: "scripts", ...result }, null, 2)
      : renderScripts(result);
    return { output, exitCode: failed ? 1 : 0 };
  }

  const root = opts.scope === "global" ? opts.home : opts.cwd;
  const result = auditReceipt(readReceipt(root), realDeps, {
    home: opts.home,
    cwd: opts.cwd,
    strict: opts.strict,
  });
  const output = opts.json
    ? JSON.stringify({ protocol_version: AUDIT_PROTOCOL_VERSION, target: "kit", ...result }, null, 2)
    : renderKit(result, !!opts.strict);
  return { output, exitCode: result.ok ? 0 : 1 };
}
