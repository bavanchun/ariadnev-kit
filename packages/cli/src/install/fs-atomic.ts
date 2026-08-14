import { mkdirSync, writeFileSync, renameSync, existsSync, rmSync, statSync, chmodSync } from "node:fs";
import { ALLOWED_FILE_MODES } from "./install-types.js";
import { dirname } from "node:path";

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
