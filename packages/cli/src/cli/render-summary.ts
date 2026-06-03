import type { ProviderInstallResult } from "../install/install-types.js";

/** Pure formatter: render install results as a human summary table. */
export function renderSummary(results: ProviderInstallResult[], dryRun: boolean): string {
  const lines: string[] = [];
  lines.push(dryRun ? "vcskill install — DRY RUN (no files written)" : "vcskill install — complete");
  for (const r of results) {
    lines.push(
      `  ${r.provider.padEnd(12)} written=${r.written} backed-up=${r.backedUp} skipped=${r.skipped.length}`,
    );
    for (const s of r.skipped) {
      lines.push(`      - skip ${s.kind}/${s.name}: ${s.reason}`);
    }
  }
  return lines.join("\n");
}
