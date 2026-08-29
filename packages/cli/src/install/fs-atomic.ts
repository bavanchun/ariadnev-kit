import { mkdirSync, writeFileSync, renameSync, existsSync, rmSync, statSync, chmodSync } from "node:fs";
import { ALLOWED_FILE_MODES } from "./install-types.js";
import { dirname } from "node:path";

/**
 * Same crash-safety, for operational state rather than kit content: 0600.
 *
 * `atomicWrite` refuses 0600 on purpose, and a test pins that refusal — its
 * mode argument exists to make an executable bit a deliberate declaration for
 * files this tool *installs*, and 644/755 is the whole vocabulary that needs.
 * A file recording what the user has on their machine is a different kind of
 * thing: it is never executed, and on a shared host the default umask would
 * leave it world-readable.
 *
 * Deliberately simpler than the harness's own private writer, which adds fsync
 * and a directory sync because a run's durable state has to survive power loss
 * mid-run. This one only has to survive a crash mid-write.
 */
export function atomicWritePrivate(dest: string, content: string | Buffer): void {
  mkdirSync(dirname(dest), { recursive: true, mode: 0o700 });
  const tmp = `${dest}.ariadnev-tmp`;
  writeFileSync(tmp, content, { mode: 0o600 });
  // `mode` on writeFileSync applies only when creating, and is masked by the
  // umask even then, so the mode is set explicitly rather than hoped for.
  chmodSync(tmp, 0o600);
  if (existsSync(dest) && statSync(dest).isDirectory()) {
    rmSync(dest, { recursive: true, force: true });
  }
  renameSync(tmp, dest);
}

/**
 * Write via temp+rename so a crash mid-write never leaves `dest` half
 * written. Shared by install and uninstall — both rewrite settings.json/
 * AGENTS.md/the receipt and both need the same crash-safety guarantee.
 */
export function atomicWrite(dest: string, content: string | Buffer, mode?: number): void {
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = `${dest}.ariadnev-tmp`;
  // No encoding argument: a string is written as utf8 by default, and a Buffer
  // is written verbatim. Forcing "utf8" would re-encode the Buffer.
  writeFileSync(tmp, content);
  if (mode !== undefined) {
    if (!ALLOWED_FILE_MODES.has(mode)) {
      throw new Error(`refusing to write ${dest} with mode ${mode.toString(8)} — only 644 and 755 are allowed`);
    }
    chmodSync(tmp, mode);
  }
  // renameSync atomically replaces an existing FILE — no pre-delete needed
  // (deleting first would open a crash window where dest is neither old nor
  // new). Only a pre-existing DIRECTORY must be removed, since rename onto a
  // non-empty dir fails.
  if (existsSync(dest) && statSync(dest).isDirectory()) {
    rmSync(dest, { recursive: true, force: true });
  }
  renameSync(tmp, dest);
}
