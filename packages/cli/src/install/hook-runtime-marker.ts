import { join } from "node:path";
import { CLAUDE_HOOKS_DIR } from "../adapt/paths.js";

// Mirrors RUNTIME_MARKER_FILE in kit/hooks/_lib/runtime-state-identity.cjs.
// The hook library reads this file from the directory above `_lib` to learn
// which runtime launched it, and the session-state family (session-state,
// precompact-capture, cook-after-plan-reminder, team-context-inject) exits
// before writing anything when the marker is absent or names an unknown
// runtime. Nothing else fails loudly, so the installer must write it and the
// doctor must notice when it is gone.
export const HOOK_RUNTIME_MARKER_FILE = ".ariadnev-runtime.json";

export function hookRuntimeMarkerPath(root: string): string {
  return join(root, CLAUDE_HOOKS_DIR, HOOK_RUNTIME_MARKER_FILE);
}

export function hookRuntimeMarkerContent(runtime: string): string {
  return `${JSON.stringify({ schemaVersion: 1, runtime })}\n`;
}

/** The same acceptance test the hook library applies, minus its size cap. */
export function isHookRuntimeMarkerValid(text: string, runtime: string): boolean {
  try {
    const parsed = JSON.parse(text) as { schemaVersion?: unknown; runtime?: unknown } | null;
    return parsed?.schemaVersion === 1 && parsed.runtime === runtime;
  } catch {
    return false;
  }
}
