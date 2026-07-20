// Single source for "what version of vcskill is running" — used by --version,
// the install receipt, and (later) `vcskill update`'s version comparison.
import { createRequire } from "node:module";
import { EMBEDDED_VERSION } from "./kit/kit-embedded.generated.js";

export function packageVersion(): string {
  // In a compiled binary there is no `../package.json` on disk; fall back to the
  // version stamped into the embedded kit at build time.
  try {
    return createRequire(import.meta.url)("../package.json").version as string;
  } catch {
    return EMBEDDED_VERSION;
  }
}
