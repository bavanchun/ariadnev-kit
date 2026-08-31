// Install receipt: pure builder for the ownership record doctor/uninstall/
// update all read instead of guessing. No fs here — the caller reads the
// prior receipt JSON and writes the returned string.
import { createHash } from "node:crypto";
import { resolveSharedDestinations } from "./shared-destinations.js";
import { relative, isAbsolute, join } from "node:path";
import type { ProviderId } from "../providers/spec-verified.js";
import type { ProviderInstallResult } from "./install-types.js";

export const RECEIPT_SCHEMA_VERSION = 2;

// Schema 1 receipts were written before the rename and record the CLI version
// under the pre-rename key. They still describe files that exist on disk, so
// uninstall and doctor must keep reading them rather than refusing.
export const SUPPORTED_RECEIPT_SCHEMA_VERSIONS = [1, 2];

/** CLI version recorded in a receipt, accepting the pre-rename key. */
export function receiptVersion(receipt: Pick<Receipt, "ariadnevVersion" | "vcskillVersion">): string | null { // brand-drift-allow: names the pre-rename key it reads
  return receipt.ariadnevVersion ?? receipt.vcskillVersion ?? null; // brand-drift-allow: key written by pre-rename installs
}

export interface ReceiptFile {
  /** Portable path: "~/…" (home-relative), plain relative (cwd-relative), or absolute. */
  path: string;
  sha256: string;
}

export interface ReceiptHookBinding {
  event: string;
  matcher?: string;
  command: string;
  /** false when the settings.json merge was declined/non-interactive. */
  applied: boolean;
}

export interface ReceiptSkip {
  kind: string;
  name: string;
  reason: string;
}

/**
 * Which skills this install put on disk. Recorded even when everything was
 * installed, because "all" today and "all" after the kit grows are different
 * sets — an update has to know what the user actually had, not re-derive it
 * from the current kit.
 */
export interface ReceiptSkillSelection {
  /** "all" until selective install lands; then "selected". */
  mode: "all" | "selected";
  /** Skill names, as authored in the kit. */
  skills: string[];
  selectedCount: number;
  /** Skills the kit offered at install time. */
  totalCount: number;
}

export interface ReceiptInstall {
  timestamp: string;
  scope: "project" | "global";
  files: ReceiptFile[];
  agentsMdManaged: boolean;
  hookBindings: ReceiptHookBinding[];
  skipped: ReceiptSkip[];
  /** Absent in receipts written before selection was recorded. */
  skillSelection?: ReceiptSkillSelection;
}

export interface Receipt {
  schemaVersion: number;
  /** Absent in a schema-1 receipt, which used the pre-rename key below. */
  ariadnevVersion?: string;
  /** Only ever read, never written. Use `receiptVersion()` instead of either key. */
  vcskillVersion?: string; // brand-drift-allow: key written by pre-rename installs
  installs: Partial<Record<ProviderId, ReceiptInstall>>;
}

export interface ProviderResultForReceipt {
  providerId: ProviderId;
  scope: "project" | "global";
  /** Whether the user confirmed the settings.json hook-binding merge. */
  applyHookSettings: boolean;
  result: ProviderInstallResult;
  skillSelection: ReceiptSkillSelection;
}

export interface BuildReceiptMeta {
  ariadnevVersion: string;
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

// Hash the bytes, not a decoded string: two different binary assets both
// decode to the same run of replacement characters, so a string hash cannot
// tell them apart and drift detection would miss the difference.
function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function buildInstall(
  entry: ProviderResultForReceipt,
  meta: BuildReceiptMeta,
  /**
   * sha256 of the bytes actually left on disk, per absolute path. Several
   * providers can write one file; the last one wins, and the record has to
   * describe the winner or the next install reports the loser's files as edited
   * by the user. See `shared-destinations.ts`.
   */
  canonical: Map<string, string>,
): ReceiptInstall {
  const files = new Map<string, ReceiptFile>();
  let agentsMdManaged = false;
  const hookBindings: ReceiptHookBinding[] = [];

  for (const op of entry.result.ops) {
    if (op.action === "write") {
      const path = toPortablePath(op.dest, meta.home, meta.cwd);
      // `canonical` over `op.content`: the receipt answers "is this file still
      // the one we wrote", which is a question about the file. Hashing what this
      // provider intended describes bytes that a later provider may have
      // replaced.
      files.set(path, { path, sha256: canonical.get(op.dest) ?? sha256(op.content) });
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
    skillSelection: entry.skillSelection,
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
    : { schemaVersion: RECEIPT_SCHEMA_VERSION, ariadnevVersion: meta.ariadnevVersion, installs: {} };

  const receipt: Receipt = {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    ariadnevVersion: meta.ariadnevVersion,
    installs: { ...prev.installs },
  };

  // Computed across every entry before any record is built: a provider's record
  // depends on what the providers after it wrote, so no record can be finished
  // until the whole run is known.
  const { canonical } = resolveSharedDestinations(
    entries.map((entry) => {
      // A skipped write never reached the disk, so it never overwrote anything
      // and must not claim to be what is there. `SkipOp.path` is what makes this
      // knowable — before it, a skip named only its artifact.
      const skipped = new Set(entry.result.skipped.flatMap((s) => (s.path ? [s.path] : [])));
      return {
        providerId: entry.providerId,
        writes: entry.result.ops.flatMap((op) =>
          op.action === "write" && !skipped.has(op.dest) ? [{ path: op.dest, content: op.content }] : [],
        ),
      };
    }),
  );

  for (const entry of entries) {
    receipt.installs[entry.providerId] = buildInstall(entry, meta, canonical);
  }

  return `${JSON.stringify(receipt, null, 2)}\n`;
}
