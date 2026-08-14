// Per-file forensics for `ariadnev audit`. The receipt already records a
// SHA256 for every file the installer wrote, so this needs no state of its own:
// it compares what is on disk against that record and classifies the
// difference. Pure — the caller injects the hashing and directory reads.
//
// Distinct from doctor/diagnose.ts on purpose: doctor answers "is the install
// still sound" from cheap existence checks and rolls findings up per provider;
// this answers "which file exactly drifted" and emits one row per file.
import { dirname } from "node:path";
import { fromPortablePath, toPortablePath, type Receipt } from "../install/install-receipt.js";

export type AuditStatus = "ok" | "modified" | "missing" | "untracked";

export interface AuditEntry {
  providerId: string;
  /** Portable path, matching how the receipt records it. */
  path: string;
  status: AuditStatus;
}

export interface AuditDeps {
  /** sha256 hex of the file, or null when it is absent or unreadable. */
  hashFile(abs: string): string | null;
  /** Names of the files directly inside a directory; [] when it is missing. */
  listFiles(abs: string): string[];
}

export interface AuditOpts {
  home: string;
  cwd: string;
  /** Count untracked files as a failure too. */
  strict?: boolean;
}

export interface AuditResult {
  entries: AuditEntry[];
  counts: Record<AuditStatus, number>;
  /** False when the run should exit non-zero. */
  ok: boolean;
}

/**
 * Files that live inside a directory we own but are not ours. `settings.json`
 * is merged into rather than written, and editors/providers drop their own
 * local variants beside it; calling those untracked would make audit cry wolf
 * on a perfectly healthy install.
 */
const SHARED_FILES = new Set(["settings.json", "settings.local.json", "AGENTS.md", "CLAUDE.md", ".DS_Store"]);

function classify(recordedHash: string, actualHash: string | null): AuditStatus {
  if (actualHash === null) return "missing";
  return actualHash === recordedHash ? "ok" : "modified";
}

export function auditReceipt(receipt: Receipt | null, deps: AuditDeps, opts: AuditOpts): AuditResult {
  const entries: AuditEntry[] = [];

  for (const [providerId, install] of Object.entries(receipt?.installs ?? {})) {
    if (!install) continue;
    // Each provider's own recorded scope decides the root, the same rule
    // uninstall follows — audit must judge what was installed, not what the
    // current invocation happens to be scoped to.
    const root = install.scope === "global" ? opts.home : opts.cwd;
    const tracked = new Set<string>();
    const ownedDirs = new Set<string>();

    for (const file of install.files) {
      const abs = fromPortablePath(file.path, opts.home, root);
      tracked.add(abs);
      ownedDirs.add(dirname(abs));
      entries.push({ providerId, path: file.path, status: classify(file.sha256, deps.hashFile(abs)) });
    }

    for (const dir of ownedDirs) {
      for (const name of deps.listFiles(dir)) {
        const abs = `${dir}/${name}`;
        if (tracked.has(abs) || SHARED_FILES.has(name)) continue;
        entries.push({ providerId, path: toPortablePath(abs, opts.home, root), status: "untracked" });
      }
    }
  }

  const counts: Record<AuditStatus, number> = { ok: 0, modified: 0, missing: 0, untracked: 0 };
  for (const e of entries) counts[e.status]++;

  const failed = counts.modified + counts.missing + (opts.strict ? counts.untracked : 0);
  return { entries, counts, ok: failed === 0 };
}
