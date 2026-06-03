import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";

/** Absolute path of the applied-migrations ledger for a given root. */
export function appliedStatePath(root: string): string {
  return join(root, ".vcskill", "applied-migrations.json");
}

export function readAppliedState(root: string): Set<string> {
  const path = appliedStatePath(root);
  if (!existsSync(path)) return new Set();
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    return new Set(Array.isArray(data) ? (data as string[]) : []);
  } catch {
    return new Set();
  }
}

export function writeAppliedState(root: string, keys: Set<string>): void {
  const path = appliedStatePath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify([...keys], null, 2), "utf8");
}
