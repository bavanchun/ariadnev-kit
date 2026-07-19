// Single source for "what version of vcskill is running" — used by --version,
// the install receipt, and (later) `vcskill update`'s version comparison.
import { createRequire } from "node:module";

export function packageVersion(): string {
  return createRequire(import.meta.url)("../package.json").version as string;
}
