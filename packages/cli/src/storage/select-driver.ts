// Which SQLite the process actually has. One decision, made once, so no caller
// has to know there are two.

import { bunDriver } from "./driver-bun.js";
import { nodeDriver } from "./driver-node.js";
import type { DriverName, StorageDatabase, StorageDriver } from "./driver.js";

/**
 * True inside the compiled binary and under `bun run`, false under Node.
 *
 * `typeof Bun` rather than `process.versions.bun`: Bun sets both, but the global
 * is the one that cannot be forged by an environment shim, and it needs no
 * declaration file to test for.
 */
export function runningUnderBun(global: typeof globalThis = globalThis): boolean {
  return typeof (global as { Bun?: unknown }).Bun !== "undefined";
}

export function selectDriver(global: typeof globalThis = globalThis): StorageDriver {
  return runningUnderBun(global) ? bunDriver : nodeDriver;
}

export function activeDriverName(global: typeof globalThis = globalThis): DriverName {
  return selectDriver(global).name;
}

/** Open a database on whichever driver this runtime has. */
export function openDatabase(path: string): StorageDatabase {
  return selectDriver().open(path);
}
