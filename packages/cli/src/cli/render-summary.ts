import type { ProviderInstallResult } from "../install/install-types.js";
import { coral, teal, faint, type StyleOpts } from "../ui/style.js";

/** Pure formatter: render install results as a human summary table. Coloring is
 * additive — `color:false` (the default) is byte-identical to the plain form. */
export function renderSummary(
  results: ProviderInstallResult[],
  dryRun: boolean,
  opts: StyleOpts = { color: false },
): string {
  const lines: string[] = [];
  lines.push(`${coral("ariadnev", opts)} install — ${dryRun ? "DRY RUN (no files written)" : "complete"}`);
  for (const r of results) {
    lines.push(
      `  ${coral(r.provider.padEnd(12), opts)} written=${teal(String(r.written), opts)} backed-up=${r.backedUp} skipped=${r.skipped.length}`,
    );
    for (const s of r.skipped) {
      // The path last and bracketed: the reason is what a reader scans for, and
      // the path is what they need only once a line has caught their eye.
      const where = s.path ? ` [${s.path}]` : "";
      lines.push(faint(`      - skip ${s.kind}/${s.name}: ${s.reason}${where}`, opts));
    }
  }
  return lines.join("\n");
}
