// `av diagnostics export` — a support bundle that is safe to paste.
//
// THE BUNDLE IS ASSEMBLED FIELD BY FIELD. Nothing here walks a directory and
// reports what it finds, and nothing collects an object and strips the bad
// parts out of it. Every value below is named in this file, which is what makes
// "this is safe to paste" a claim someone can check by reading one function
// rather than by trusting a filter.
//
// `--offline` IS THE ONLY MODE. There is nothing to fetch — the bundle is built
// from local state — so the flag is accepted for parity with the captured
// surface and changes nothing. Saying that plainly is better than implying a
// network path exists.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { packageVersion } from "../version.js";
import { sqliteSelfTest } from "../storage/sqlite-self-test.js";
import { ed25519SelfTest } from "./update-signature.js";
import { analyticsStatus } from "../analytics/lifecycle.js";
import { readContentState } from "../content-search/lifecycle.js";
import { readRegistry } from "../projects/registry.js";
import { activitySegments } from "../backups/snapshot-operational.js";
import { assertNoForbiddenKeys, scrubDeep, type SafeValue } from "../diagnostics/redact.js";
import { jsonEnvelope } from "./json-envelope.js";
import { EXIT } from "./exit-codes.js";
import type { BackupsResult } from "./backups-inspect.js";

export const DIAGNOSTICS_SCHEMA_VERSION = 1;

export interface DiagnosticsOpts {
  home: string;
  cwd: string;
  now: string;
  /** Accepted for parity. The bundle is local-only either way. */
  offline?: boolean;
  json?: boolean;
}

/** Whether a receipt exists and how many providers it covers — never its paths. */
function receiptSummary(root: string): SafeValue {
  const path = join(root, ".ariadnev", "receipt.json");
  if (!existsSync(path)) return { present: false, providers: 0, files: 0 };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      installs?: Record<string, { files?: unknown[] }>;
    };
    const installs = Object.values(parsed.installs ?? {});
    return {
      present: true,
      providers: installs.length,
      // A count, not the list. Which files an install owns is the receipt's
      // business; a support bundle needs to know whether there are any.
      files: installs.reduce((sum, install) => sum + (install.files?.length ?? 0), 0),
    };
  } catch {
    return { present: true, providers: 0, files: 0, unreadable: true };
  }
}

/**
 * The bundle.
 *
 * Read this list to know exactly what leaves the machine. Counts and states,
 * never contents: how many projects are registered rather than where they are,
 * how many activity segments exist rather than what is in them.
 */
export function buildDiagnostics(opts: DiagnosticsOpts): SafeValue {
  const sqlite = sqliteSelfTest();
  const analytics = analyticsStatus(opts.home);
  const content = readContentState(opts.home);
  return {
    generated_at: opts.now,
    cli: {
      version: packageVersion(),
      platform: process.platform,
      arch: process.arch,
      // The runtime's own version, which is a real diagnostic: a Bun-compiled
      // binary and a Node test run differ in ways that matter.
      node: process.versions.node ?? "",
      bun: process.versions.bun ?? "",
    },
    capabilities: {
      sqlite_driver: sqlite.driver,
      sqlite_ok: sqlite.ok,
      fts5: sqlite.fts5,
      wal: sqlite.wal,
      ed25519: ed25519SelfTest(),
    },
    install: {
      project: receiptSummary(opts.cwd),
      global: receiptSummary(opts.home),
    },
    operational: {
      // Counts only. A project's directory is a path on someone's machine and
      // has no business in a public issue.
      registered_projects: readRegistry(opts.home).projects.length,
      activity_segments: activitySegments(opts.home).length,
      analytics_enabled: analytics.enabled,
      analytics_health: analytics.health,
      analytics_facts: analytics.fact_count,
      content_search_projects_opted_in: content.projects.filter((entry) => entry.enabled).length,
    },
  };
}

export function runDiagnosticsExport(opts: DiagnosticsOpts): BackupsResult {
  const bundle = scrubDeep(buildDiagnostics(opts), opts.home);
  // Checked after assembly, so a field added carelessly later fails here rather
  // than in an issue thread.
  assertNoForbiddenKeys(bundle);

  if (opts.json) {
    return { output: jsonEnvelope(DIAGNOSTICS_SCHEMA_VERSION, "diagnostics.export", bundle), exitCode: EXIT.ok };
  }
  const lines = ["ariadnev diagnostics export — safe to paste into an issue", ""];
  render(bundle, lines, "");
  lines.push("", "Paths under your home directory are shown as `~`. No file contents are included.");
  return { output: lines.join("\n"), exitCode: EXIT.ok };
}

/** Flatten the bundle into `key: value` lines, nesting by indentation. */
function render(value: SafeValue, lines: string[], indent: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    lines.push(`${indent}${JSON.stringify(value)}`);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (item !== null && typeof item === "object" && !Array.isArray(item)) {
      lines.push(`${indent}${key}`);
      render(item, lines, `${indent}  `);
    } else {
      lines.push(`${indent}${key.padEnd(32 - indent.length)} ${Array.isArray(item) ? item.join(", ") : String(item)}`);
    }
  }
}
