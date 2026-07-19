import { mkdirSync, writeFileSync, renameSync, existsSync, rmSync, statSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Write via temp+rename so a crash mid-write never leaves `dest` half
 * written. Shared by install and uninstall — both rewrite settings.json/
 * AGENTS.md/the receipt and both need the same crash-safety guarantee.
 */
export function atomicWrite(dest: string, content: string): void {
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = `${dest}.vcskill-tmp`;
  writeFileSync(tmp, content, "utf8");
  // renameSync atomically replaces an existing FILE — no pre-delete needed
  // (deleting first would open a crash window where dest is neither old nor
  // new). Only a pre-existing DIRECTORY must be removed, since rename onto a
  // non-empty dir fails.
  if (existsSync(dest) && statSync(dest).isDirectory()) {
    rmSync(dest, { recursive: true, force: true });
  }
  renameSync(tmp, dest);
}
