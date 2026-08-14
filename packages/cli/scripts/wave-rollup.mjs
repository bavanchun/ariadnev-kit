#!/usr/bin/env node
// wave-rollup.mjs — machine-readable Wave 0+ ledger rollup.
//
// Reads docs/decisions-ledger-historical.json — the retired Wave 0 claim
// ledger. The ledger no longer gates anything (the coverage checker it fed was
// removed when every skill became a verbatim port, making a compression measure
// meaningless). This script survives as the reader for that historical record.
//
// Prints one JSON row per skill with tracked claims:
//   { skill, total, covered,
//     compacted, routed, "out-of-scope", dropped, fragment,
//     fidelity }
// And a final summary row:
//   { summary: { skills, total, covered, in_scope_drops, fidelity_pct } }
//
// Usage:
//   bun packages/cli/scripts/wave-rollup.mjs [--table]
//   --table renders a Markdown table on stderr for pasting into reports.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const LEDGER_PATH = join(REPO, "docs", "decisions-ledger-historical.json");

const registry = JSON.parse(readFileSync(LEDGER_PATH, "utf8"));

/** Classify one rejected claim by its `why` prefix. */
function classifyRejection(why) {
  if (!why) return "unknown";
  if (/^routed: /.test(why)) return "routed";
  if (/^compacted: /.test(why)) return "compacted";
  if (/^out-of-scope: /.test(why)) return "out-of-scope";
  if (/^dropped: /.test(why)) return "dropped";
  if (/^fragment\/heading only/.test(why)) return "fragment";
  return "unknown";
}

const rows = [];
const summary = {
  skills: 0,
  total: 0,
  covered: 0,
  compacted: 0,
  routed: 0,
  "out-of-scope": 0,
  dropped: 0,
  fragment: 0,
  unknown: 0,
};

for (const [skill, entry] of Object.entries(registry.skills)) {
  const claims = entry.claims ?? [];
  if (claims.length === 0) continue;
  const counts = {
    covered: 0,
    compacted: 0,
    routed: 0,
    "out-of-scope": 0,
    dropped: 0,
    fragment: 0,
    unknown: 0,
  };
  for (const claim of claims) {
    if (claim.status === "covered") counts.covered += 1;
    else if (claim.status === "rejected") counts[classifyRejection(claim.why)] += 1;
  }
  const denom = counts.covered + counts.dropped;
  const fidelity = denom === 0 ? 1 : counts.covered / denom;
  const row = {
    skill,
    total: claims.length,
    ...counts,
    fidelity: Number(fidelity.toFixed(4)),
  };
  rows.push(row);
  summary.skills += 1;
  summary.total += row.total;
  for (const key of Object.keys(counts)) summary[key] += counts[key];
  console.log(JSON.stringify(row));
}

const summaryDenom = summary.covered + summary.dropped;
summary.fidelity_pct = summaryDenom === 0 ? 100 : Number(((summary.covered / summaryDenom) * 100).toFixed(2));
summary.in_scope_drops = summary.dropped;
console.log(JSON.stringify({ summary }));

if (process.argv.includes("--table")) {
  const cols = ["skill", "total", "covered", "compacted", "routed", "out-of-scope", "dropped", "fragment", "fidelity"];
  const line = (cells) => `| ${cells.join(" | ")} |`;
  const table = [
    line(cols),
    line(cols.map(() => "---")),
    ...rows.map((r) => line(cols.map((k) => String(r[k])))),
  ];
  process.stderr.write("\n" + table.join("\n") + "\n\n");
  process.stderr.write(
    `Summary: ${summary.skills} skills, ${summary.total} claims — ` +
      `${summary.covered} covered / ${summary.in_scope_drops} in-scope drops → ` +
      `fidelity ${summary.fidelity_pct}%.\n`,
  );
  if (summary.unknown > 0) {
    process.stderr.write(`WARN: ${summary.unknown} claims have unrecognized why prefixes.\n`);
  }
}
