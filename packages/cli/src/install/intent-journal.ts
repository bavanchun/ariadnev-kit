// Crash boundary for install. The receipt is written once, after every file
// has landed, so a process killed at file 1200 of 1511 leaves 1200 files on
// disk and no record that they exist — `ariadnev uninstall` would then find
// nothing to do and the user could not clean up.
//
// The journal is the record that survives that window: the planned destinations
// are written *before* the first file, and the file is deleted the moment the
// receipt takes over. It is deliberately not a second ownership record — it
// holds no hashes and nothing reads it except crash recovery. If some other
// code path ever needs a fact from it, that fact belongs in the receipt.
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { atomicWrite } from "./fs-atomic.js";
import { toPortablePath } from "./install-receipt.js";
import type { InstallOp } from "./install-types.js";
import type { HealRemoval } from "./install-heal.js";
import type { ProviderId } from "../providers/spec-verified.js";

export const JOURNAL_SCHEMA_VERSION = 1;

/** How a planned destination was going to be written. */
export type JournalAction = "write" | "agents-md" | "hook-settings" | "statusline-settings";

export interface JournalEntry {
  /** Portable path, same grammar as the receipt's. */
  path: string;
  action: JournalAction;
}

export interface JournalProvider {
  provider: ProviderId;
  planned: JournalEntry[];
}

export interface InstallJournal {
  schemaVersion: number;
  timestamp: string;
  scope: "project" | "global";
  providers: JournalProvider[];
  /**
   * Files a heal is about to delete, written before the receipt and cleared
   * after the deletions.
   *
   * Between the receipt write and the last unlink, the receipt no longer
   * mentions these files and they are still on disk — the orphan state, reached
   * by being killed instead of by skipping the heal. This is what the next
   * install reads to finish the job. Absent in a journal from a run that healed
   * nothing.
   */
  healRemovals?: HealRemoval[];
}

export function journalPath(baseRoot: string): string {
  return join(baseRoot, ".ariadnev", "install-journal.json");
}

/** Destinations an op list is about to touch; skips carry no destination. */
export function plannedEntries(ops: InstallOp[], home: string, cwd: string): JournalEntry[] {
  const entries: JournalEntry[] = [];
  for (const op of ops) {
    if (op.action === "skip") continue;
    entries.push({ path: toPortablePath(op.dest, home, cwd), action: op.action });
  }
  return entries;
}

export function writeJournal(baseRoot: string, journal: InstallJournal): void {
  atomicWrite(journalPath(baseRoot), `${JSON.stringify(journal, null, 2)}\n`);
}

/** The journal left by an interrupted install, or null when none/unreadable. */
export function readJournal(baseRoot: string): InstallJournal | null {
  const p = journalPath(baseRoot);
  if (!existsSync(p)) return null;
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8")) as InstallJournal;
    // A journal from a future schema describes writes this build cannot reason
    // about; treating it as absent is safer than acting on a guess.
    if (parsed.schemaVersion !== JOURNAL_SCHEMA_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Called once the receipt is on disk — from here the receipt is the record. */
export function clearJournal(baseRoot: string): void {
  rmSync(journalPath(baseRoot), { force: true });
}
