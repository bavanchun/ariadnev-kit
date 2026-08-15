// Writes the generated adapter artifacts. Kept apart from the generator so the
// direction stays visible: everything upstream of this file is pure, and this is
// the only place bytes reach a disk.

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { atomicWrite } from "../install/fs-atomic.js";
import { fromPortablePath, type Receipt } from "../install/install-receipt.js";
import type { ProviderId } from "../providers/spec-verified.js";
import { buildAdapterArtifacts } from "./adapter-artifacts.js";

/** Where the artifacts live, mirroring the upstream tree's shape. */
export function adaptersRoot(home: string = homedir()): string {
  return join(home, ".ariadnev", "adapters");
}

export function adapterDir(provider: ProviderId, home: string = homedir()): string {
  return join(adaptersRoot(home), provider);
}

export interface WriteAdapterOpts {
  receipt: Receipt;
  provider: ProviderId;
  kit: string;
  kitVersion: string;
  home: string;
  cwd: string;
  dryRun?: boolean;
}

export interface WriteAdapterResult {
  dir: string;
  files: string[];
}

/**
 * Project one provider's install onto disk.
 *
 * Failure here is reported, never fatal: these files are for other tools to
 * read, and a kit that installed correctly must not be called a failed install
 * because a projection of it could not be written.
 */
export function writeAdapterArtifacts(opts: WriteAdapterOpts): WriteAdapterResult {
  const dir = adapterDir(opts.provider, opts.home);
  const artifacts = buildAdapterArtifacts({
    receipt: opts.receipt,
    provider: opts.provider,
    kit: opts.kit,
    kitVersion: opts.kitVersion,
    resolvePath: (portable) => fromPortablePath(portable, opts.home, opts.cwd),
  });
  const written: string[] = [];
  if (!opts.dryRun) mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(artifacts)) {
    const dest = join(dir, name);
    if (!opts.dryRun) atomicWrite(dest, content);
    written.push(dest);
  }
  return { dir, files: written };
}

/** Best-effort projection: an install is not undone by a failed side record. */
export function writeAdapterArtifactsSafe(opts: WriteAdapterOpts): WriteAdapterResult | null {
  try {
    return writeAdapterArtifacts(opts);
  } catch {
    return null;
  }
}

/** Read one artifact back — for `adapters regenerate` to compare, nothing else. */
export function readAdapterArtifact(provider: ProviderId, name: string, home: string = homedir()): string | null {
  const path = join(adapterDir(provider, home), name);
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}
