// Reading side of `parity-manifest.json` — the committed record of the upstream
// 2.14.0 command surface and what this project decided to do about each name.
//
// The manifest is written by `scripts/capture-upstream-surface.mjs`, which needs
// the upstream binary and therefore never runs in CI. Everything here reads what
// is committed, so the gates below work on a machine that has never seen it.
//
// The manifest deliberately carries NO upstream prose — no summaries, no product
// name, no binary name. `check-brand-drift.mjs` fails on any of those anywhere
// under `packages/`, and the classification notes are ours to write anyway:
// they record a decision, not a description.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export type ParityStatus = "in-scope" | "excluded";

export interface ParityCommand {
  /** The upstream name, which is also the name `av` must expose when in scope. */
  readonly name: string;
  readonly group: string;
  readonly subcommands: readonly string[];
  readonly status: ParityStatus;
  /** The `av` command this maps onto. `null` when excluded. */
  readonly target: string | null;
  /** The plan phase that closes it, when one owns it. */
  readonly phase: number | null;
  readonly note: string;
}

export interface ParityManifest {
  readonly schemaVersion: number;
  readonly upstreamVersion: string;
  readonly capturedAt: string;
  /** Wall-clock seconds of the CI gate when this phase measured it. */
  readonly ciBaselineSeconds: number | null;
  readonly commands: readonly ParityCommand[];
}

const REPO_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..", "..");

export function manifestPath(root: string = REPO_ROOT): string {
  return join(root, "parity-manifest.json");
}

export function readParityManifest(root: string = REPO_ROOT): ParityManifest {
  return JSON.parse(readFileSync(manifestPath(root), "utf8")) as ParityManifest;
}

export function inScope(manifest: ParityManifest): readonly ParityCommand[] {
  return manifest.commands.filter((command) => command.status === "in-scope");
}

export function excluded(manifest: ParityManifest): readonly ParityCommand[] {
  return manifest.commands.filter((command) => command.status === "excluded");
}

/**
 * In-scope names with no command of that name on the live surface.
 *
 * Measured against Commander rather than stored, so it cannot go stale: the
 * manifest records the decision, the program records the fact, and the gap
 * between them is what the ratchet watches.
 */
export function missingCommands(manifest: ParityManifest, registered: Iterable<string>): string[] {
  const live = new Set(registered);
  return inScope(manifest)
    .filter((command) => command.target !== null && !live.has(command.target))
    .map((command) => command.target as string)
    .sort();
}
