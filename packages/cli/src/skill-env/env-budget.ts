// How much disk skill environments are allowed before someone should be told.
//
// The numbers come from building every environment the kit needs, on
// 2026-08-15, resolved for Python 3.10:
//
//   design           246 MB   numpy, scipy, scikit-learn, pillow, cryptography
//   cti-expert       155 MB   matplotlib, numpy, networkx, scrapling
//   excalidraw       146 MB   playwright (the package; browsers are extra)
//   mcp-builder       56 MB   mcp, anthropic
//   document-skills   55 MB   lxml, pypdf, python-pptx, openpyxl, pillow
//                    ------
//                    659 MB   all five
//
// The budgets sit above those, not at them: the point is to catch a resolution
// that went somewhere unexpected — a stray CUDA build of torch, a browser
// bundle — not to complain about a scientific stack being large. Passing the
// budget is a warning and never blocks a build; the user asked for the skill.

/** One environment. `design`, the largest real one, is 246 MB. */
export const ENV_BUDGET_BYTES = 400 * 1024 * 1024;

/** Everything under the environments root. All five together are 659 MB. */
export const TOTAL_BUDGET_BYTES = 1500 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** A line to print when an environment is bigger than expected, else null. */
export function envBudgetWarning(skill: string, bytes: number): string | null {
  if (bytes <= ENV_BUDGET_BYTES) return null;
  return (
    `${skill}: environment is ${formatBytes(bytes)}, over the ${formatBytes(ENV_BUDGET_BYTES)} budget — ` +
    `check its lock for something it should not be pulling in`
  );
}

/** A line to print when the environments root as a whole is oversized. */
export function totalBudgetWarning(bytes: number): string | null {
  if (bytes <= TOTAL_BUDGET_BYTES) return null;
  return (
    `environments total ${formatBytes(bytes)}, over the ${formatBytes(TOTAL_BUDGET_BYTES)} budget — ` +
    `"ariadnev skill remove <skill>" drops the ones you are not using`
  );
}
