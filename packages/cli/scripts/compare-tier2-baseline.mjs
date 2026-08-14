#!/usr/bin/env node
// compare-tier2-baseline.mjs — deterministic comparison between two
// tier-2 behavioral baseline snapshots.
//
// Regression semantics are stability-oriented because the current observer
// emits routing.runtime-events + trajectory.runtime-events as harness-level
// observation gaps unconditionally (see behavioral-observer.ts:177), which
// structurally caps observable dimensions:
//
//   REGRESSION signals (any of these fail the gate):
//   1. Any cell whose verdict flipped from `pass` → `fail` / `incomplete`.
//   2. Any new `fail` verdict introduced (not present in prior baseline).
//   3. Any prior `unsupported` verdict that became `fail` (capability
//      change may have unblocked a real regression).
//   4. A summary drop in `pass` count.
//
//   NOT regressions (accepted structural signal):
//   • Existing `incomplete` verdicts caused by hardcoded observer gaps.
//   • Stable `unsupported` verdicts (capability set unchanged).
//   • New cells added (they enlarge the surface, not regress it).
//
// Usage:
//   bun packages/cli/scripts/compare-tier2-baseline.mjs <prior> <current>
//   Exit code 0 = no regression; 1 = one or more regression signals.

import { readFileSync } from "node:fs";
import { argv, exit } from "node:process";

const [, , priorPath, currentPath] = argv;
if (!priorPath || !currentPath) {
  console.error("usage: compare-tier2-baseline.mjs <prior.json> <current.json>");
  exit(2);
}

function load(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const samples = raw.samples ?? [];
  const byCell = new Map();
  for (const s of samples) {
    const key = `${s.cellId}::${s.variant}::${s.level}::${s.repeat}`;
    byCell.set(key, s);
  }
  return { raw, samples, byCell };
}

const prior = load(priorPath);
const current = load(currentPath);

const regressions = [];
const infos = [];

// Signal 1 + 3: verdict flips per cell (pass→fail, unsupported→fail, etc.).
for (const [key, priorSample] of prior.byCell) {
  const cur = current.byCell.get(key);
  if (!cur) {
    infos.push(`removed cell ${key} (was verdict=${priorSample.verdict})`);
    continue;
  }
  if (priorSample.verdict === cur.verdict) continue;
  const regressed =
    (priorSample.verdict === "pass" && cur.verdict !== "pass") ||
    (priorSample.verdict !== "fail" && cur.verdict === "fail");
  if (regressed) {
    regressions.push(
      `cell ${key} verdict flipped ${priorSample.verdict} → ${cur.verdict} ` +
        `(failureClass ${priorSample.failureClass} → ${cur.failureClass})`,
    );
  } else {
    infos.push(`cell ${key} verdict changed ${priorSample.verdict} → ${cur.verdict} (not a regression)`);
  }
}

// Signal 2: new `fail` cells absent from prior.
for (const [key, curSample] of current.byCell) {
  if (prior.byCell.has(key)) continue;
  if (curSample.verdict === "fail") {
    regressions.push(`new cell ${key} with verdict=fail (failureClass ${curSample.failureClass})`);
  } else {
    infos.push(`new cell ${key} verdict=${curSample.verdict}`);
  }
}

// Signal 4: summary pass-count drop.
const priorPass = prior.samples.filter((s) => s.verdict === "pass").length;
const currentPass = current.samples.filter((s) => s.verdict === "pass").length;
if (currentPass < priorPass) {
  regressions.push(`total pass count dropped ${priorPass} → ${currentPass}`);
}

function summary(label, snapshot) {
  const buckets = {};
  for (const s of snapshot.samples) buckets[s.verdict] = (buckets[s.verdict] ?? 0) + 1;
  return `${label}: total=${snapshot.samples.length} ${JSON.stringify(buckets)}`;
}

console.log(summary("prior", prior));
console.log(summary("current", current));
console.log(`regressions: ${regressions.length}`);
console.log(`informational: ${infos.length}`);

for (const r of regressions) console.log(`  REGRESSION: ${r}`);
for (const i of infos.slice(0, 20)) console.log(`  info: ${i}`);
if (infos.length > 20) console.log(`  ... and ${infos.length - 20} more informational entries`);

exit(regressions.length > 0 ? 1 : 0);
