// Install receipt: pure builder for the ownership record doctor/uninstall/
// update all read instead of guessing. No fs here — the caller reads the
// prior receipt JSON and writes the returned string.
import { createHash } from "node:crypto";
import { relative, isAbsolute, join } from "node:path";
import type { ProviderId } from "../providers/spec-verified.js";
import type { ProviderInstallResult } from "./install-types.js";

export const RECEIPT_SCHEMA_VERSION = 1;

export interface ReceiptFile {
  /** Portable path: "~/…" (home-relative), plain relative (cwd-relative), or absolute. */
  path: string;
  sha256: string;
}

export interface ReceiptHookBinding {
  event: string;
  command: string;
  /** false when the settings.json merge was declined/non-interactive. */
  applied: boolean;
}

export interface ReceiptSkip {
  kind: string;
  name: string;
  reason: string;
}

export interface ReceiptInstall {
  timestamp: string;
  scope: "project" | "global";
  files: ReceiptFile[];
  agentsMdManaged: boolean;
  hookBindings: ReceiptHookBinding[];
  skipped: ReceiptSkip[];
}

export interface Receipt {
  schemaVersion: number;
  vcskillVersion: string;
  installs: Partial<Record<ProviderId, ReceiptInstall>>;
}

export interface ProviderResultForReceipt {
  providerId: ProviderId;
  scope: "project" | "global";
  /** Whether the user confirmed the settings.json hook-binding merge. */
  applyHookSettings: boolean;
  result: ProviderInstallResult;
}

export interface BuildReceiptMeta {
  vcskillVersion: string;
  timestamp: string;
  home: string;
  cwd: string;
}

/** cwd-relative plain, home-relative "~/…", else absolute — portable across machines. */
export function toPortablePath(dest: string, home: string, cwd: string): string {
  // Check cwd first: for project scope, cwd usually nests under home, and the
  // project-relative path is the more meaningful (and shorter) one to record.
  const relCwd = relative(cwd, dest);
  if (relCwd !== "" && !relCwd.startsWith("..") && !isAbsolute(relCwd)) {
    return relCwd;
  }
  const relHome = relative(home, dest);
  if (relHome !== "" && !relHome.startsWith("..") && !isAbsolute(relHome)) {
    return join("~", relHome);
  }
  return dest;
}

/** Inverse of toPortablePath. */
export function fromPortablePath(p: string, home: string, cwd: string): string {
  if (p.startsWith("~/") || p === "~") {
    return join(home, p.slice(1));
  }
  if (isAbsolute(p)) return p;
  return join(cwd, p);
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function buildInstall(entry: ProviderResultForReceipt, meta: BuildReceiptMeta): ReceiptInstall {
  const files = new Map<string, ReceiptFile>();
  let agentsMdManaged = false;
  const hookBindings: ReceiptHookBinding[] = [];

  for (const op of entry.result.ops) {
    if (op.action === "write") {
      const path = toPortablePath(op.dest, meta.home, meta.cwd);
      files.set(path, { path, sha256: sha256(op.content) });
    } else if (op.action === "agents-md") {
      agentsMdManaged = true;
    } else if (op.action === "hook-settings") {
      for (const b of op.bindings) {
        hookBindings.push({ ...b, applied: entry.applyHookSettings });
      }
    }
  }

  return {
    timestamp: meta.timestamp,
    scope: entry.scope,
    files: [...files.values()],
    agentsMdManaged,
    hookBindings,
    skipped: entry.result.skipped.map((s) => ({ kind: s.kind, name: s.name, reason: s.reason })),
  };
}

/**
 * Merge new provider install results into the previous receipt JSON. Each
 * provider's record is replaced wholesale (idempotent re-install, no growth);
 * other providers' records are preserved untouched. Throws on unparseable
 * prior JSON rather than silently discarding it.
 */
export function buildReceipt(
  prevJson: string,
  entries: ProviderResultForReceipt[],
  meta: BuildReceiptMeta,
): string {
  const prev: Receipt = prevJson.trim().length
    ? (JSON.parse(prevJson) as Receipt)
    : { schemaVersion: RECEIPT_SCHEMA_VERSION, vcskillVersion: meta.vcskillVersion, installs: {} };

  const receipt: Receipt = {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    vcskillVersion: meta.vcskillVersion,
    installs: { ...prev.installs },
  };

  for (const entry of entries) {
    receipt.installs[entry.providerId] = buildInstall(entry, meta);
  }

  return `${JSON.stringify(receipt, null, 2)}\n`;
}
