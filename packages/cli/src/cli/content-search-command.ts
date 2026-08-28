// `av content-search enable | disable | status | search | rebuild | delete`.
//
// THE DISCLOSURE IS PART OF THE COMMAND, NOT PART OF THE DOCS. A shard holds
// the project's source as plaintext on disk, and someone who runs `enable` with
// `--yes` in a script is precisely the person who will never read the manual
// page that says so. So `enable` prints it, every time, on the path that
// succeeds — not only on the interactive one it would be easy to skip.
//
// `--project` IS REQUIRED AND NEVER GUESSED. A default that fell back to the
// current directory would make it possible to index a project by running the
// command in the wrong place, which is the one mistake this feature cannot
// afford. Resolution goes through the project registry with its captured
// precedence: exact directory first, then name.
//
// EMPTY AND DISABLED ARE DIFFERENT ANSWERS. Searching a project that never
// opted in refuses and says how to opt in; searching an opted-in project with
// no matches returns no matches. A tool that answers both with an empty list
// cannot be trusted, because the user cannot tell "nothing there" from "not
// looking".

import { existsSync } from "node:fs";
import { UsageError } from "./exit-codes.js";
import { jsonEnvelope } from "./json-envelope.js";
import { findProject, readRegistry, type ProjectEntry } from "../projects/registry.js";
import {
  contentSearchStatus,
  disableProject,
  enableProject,
  isEnabled,
  recordIndexed,
  type ContentSearchStatus,
} from "../content-search/lifecycle.js";
import { closeShard, deleteShard, openShard, shardStats } from "../content-search/shard.js";
import { indexProject } from "../content-search/index-project.js";
import { searchShard, type SearchResult } from "../content-search/query.js";

export const CONTENT_SEARCH_SCHEMA_VERSION = 1;

/**
 * Said in full at every `enable`.
 *
 * Kept as one exported constant so the test asserting it appears can assert the
 * text rather than a substring someone could later soften without noticing.
 */
export const PLAINTEXT_DISCLOSURE =
  "Searchable text is stored as PLAINTEXT AT REST in this project's shard. " +
  "Anyone who can read the shard file can read the indexed source.";

export interface ContentSearchOpts {
  readonly home: string;
  readonly now: string;
  readonly project?: string;
  readonly json?: boolean;
  readonly yes?: boolean;
}

/**
 * Resolve `--project` to a registered project, or refuse.
 *
 * A directory that is not registered is refused rather than indexed on the
 * spot: the registry is what `av projects list` shows, and a shard for a project
 * that does not appear there would be invisible to every other command.
 */
export function resolveProject(home: string, project: string | undefined): ProjectEntry {
  if (!project || project.trim().length === 0) {
    throw new UsageError("--project is required — content search is opted into one project at a time");
  }
  const entry = findProject(readRegistry(home), project);
  if (!entry) {
    throw new UsageError(`no registered project matches ${project} — \`av projects list\` shows the registered ones`);
  }
  return entry;
}

function renderStatus(status: ContentSearchStatus): string {
  const lines = [
    `${status.project}  ${status.dir}`,
    `  content search  ${status.enabled ? "enabled" : "not enabled"}`,
    `  shard           ${status.health} (${status.shard_id}, ${status.shard_bytes} bytes)`,
    `  documents       ${status.document_count}`,
    `  engine          ${status.engine}`,
  ];
  if (status.last_indexed_at) lines.push(`  indexed         ${status.last_indexed_at}`);
  if (status.reason) lines.push(`  note            ${status.reason}`);
  if (status.enabled) lines.push(`  ${PLAINTEXT_DISCLOSURE}`);
  return lines.join("\n");
}

export function runContentSearchStatus(opts: ContentSearchOpts): string {
  const entry = resolveProject(opts.home, opts.project);
  const status = contentSearchStatus(opts.home, entry.dir, entry.name);
  if (opts.json) return jsonEnvelope(CONTENT_SEARCH_SCHEMA_VERSION, "content-search.status", status);
  return renderStatus(status);
}

export function runContentSearchEnable(opts: ContentSearchOpts): string {
  const entry = resolveProject(opts.home, opts.project);
  if (!existsSync(entry.dir)) {
    throw new UsageError(`cannot index ${entry.dir}: no such directory (run \`av projects prune\`)`);
  }
  // The disclosure is a disclosure, not a prompt this command can answer for
  // the user. `--yes` is how a script accepts it; without it there is nothing
  // to read the answer from, so it refuses and shows the text it wanted
  // accepted.
  if (!opts.yes) {
    throw new UsageError(
      `${PLAINTEXT_DISCLOSURE}\nRe-run with --yes to opt ${entry.name} in.`,
    );
  }
  const state = enableProject(opts.home, entry.dir, entry.name, opts.now);
  if (opts.json) {
    return jsonEnvelope(CONTENT_SEARCH_SCHEMA_VERSION, "content-search.enable", {
      project: state.name,
      dir: state.dir,
      enabled: state.enabled,
      shard_id: state.shard_id,
      disclosure: PLAINTEXT_DISCLOSURE,
    });
  }
  return [
    `Content search enabled for ${state.name}.`,
    PLAINTEXT_DISCLOSURE,
    "Run `av content-search rebuild --project <name>` to build the shard.",
  ].join("\n");
}

export function runContentSearchDisable(opts: ContentSearchOpts): string {
  const entry = resolveProject(opts.home, opts.project);
  const state = disableProject(opts.home, entry.dir, entry.name, opts.now);
  if (opts.json) {
    return jsonEnvelope(CONTENT_SEARCH_SCHEMA_VERSION, "content-search.disable", {
      project: state.name,
      dir: state.dir,
      enabled: state.enabled,
      shard_kept: shardStats(opts.home, entry.dir).exists,
    });
  }
  // Says what it did NOT do: "disable" and "delete" are easy to conflate, and
  // the difference is whether the plaintext shard is still on disk.
  return [
    `Content search disabled for ${state.name}.`,
    "The shard was kept — `av content-search delete` removes the plaintext files.",
  ].join("\n");
}

export function runContentSearchRebuild(opts: ContentSearchOpts): string {
  const entry = resolveProject(opts.home, opts.project);
  requireOptedIn(opts.home, entry);
  if (!existsSync(entry.dir)) {
    throw new UsageError(`cannot index ${entry.dir}: no such directory (run \`av projects prune\`)`);
  }
  // Delete first, then build: `rebuild` is the fix for a corrupt shard, and one
  // that opened the broken file to clear its tables would fail at exactly the
  // moment it is needed.
  deleteShard(opts.home, entry.dir);
  const shard = openShard(opts.home, entry.dir);
  let report;
  try {
    report = indexProject(shard, entry.dir, opts.now);
  } finally {
    closeShard(shard);
  }
  recordIndexed(opts.home, entry.dir, entry.name, opts.now, report.documents);
  if (opts.json) {
    return jsonEnvelope(CONTENT_SEARCH_SCHEMA_VERSION, "content-search.rebuild", {
      project: entry.name,
      dir: entry.dir,
      engine: shard.fts5 ? "fts5" : "plain-scan",
      ...report,
    });
  }
  const refused = Object.entries(report.skipped).filter(([, count]) => count > 0);
  const lines = [
    `Rebuilt the shard for ${entry.name}: ${report.documents} document(s), ${report.bytes} bytes in ${report.elapsedMs}ms.`,
  ];
  // The refusals are reported, not just made. "412 documents" says nothing
  // about whether the denylist ran; "denied 1" says it did.
  if (refused.length > 0) lines.push(`  not indexed: ${refused.map(([reason, count]) => `${reason} ${count}`).join(", ")}`);
  if (report.truncated) lines.push("  the file cap stopped the walk early — the shard is incomplete");
  return lines.join("\n");
}

function requireOptedIn(home: string, entry: ProjectEntry): void {
  if (isEnabled(home, entry.dir)) return;
  throw new UsageError(
    `${entry.name} has not opted into content search — run \`av content-search enable --project ${entry.name} --yes\``,
  );
}

export interface ContentSearchQueryOpts extends ContentSearchOpts {
  readonly query?: string;
  readonly limit?: number;
  readonly timeoutMs?: number;
}

export function runContentSearchSearch(opts: ContentSearchQueryOpts): string {
  const entry = resolveProject(opts.home, opts.project);
  // Refusing before the query is parsed, so a disabled project never answers
  // "no results" to a question it never asked.
  requireOptedIn(opts.home, entry);
  if (!opts.query) throw new UsageError("--query is required");
  const stats = shardStats(opts.home, entry.dir);
  if (!stats.exists) {
    throw new UsageError(
      `${entry.name} is opted in but has no shard yet — run \`av content-search rebuild --project ${entry.name}\``,
    );
  }
  const shard = openShard(opts.home, entry.dir);
  let result: SearchResult;
  try {
    result = searchShard(shard, opts.query, {
      ...(opts.limit === undefined ? {} : { limit: opts.limit }),
      ...(opts.timeoutMs === undefined ? {} : { timeoutMs: opts.timeoutMs }),
    });
  } finally {
    closeShard(shard);
  }
  if (opts.json) {
    return jsonEnvelope(CONTENT_SEARCH_SCHEMA_VERSION, "content-search.search", {
      project: entry.name,
      dir: entry.dir,
      ...result,
    });
  }
  if (result.hits.length === 0) {
    return `No matches for ${result.tokens.join(" ")} in ${entry.name} (${stats.docs} document(s) searched).`;
  }
  const lines = result.hits.map((hit) => `  ${hit.path}:${hit.line}  ${hit.snippet}`);
  if (result.timed_out) lines.push("  the search hit its time bound — results are partial (raise --timeout)");
  return [`${result.hits.length} match(es) in ${entry.name} via ${result.engine}:`, ...lines].join("\n");
}

export function runContentSearchDelete(opts: ContentSearchOpts): string {
  const entry = resolveProject(opts.home, opts.project);
  const stats = shardStats(opts.home, entry.dir);
  // One payload shape across all three outcomes — nothing there, previewed,
  // removed. A field that appears only on some of them makes a machine reader
  // branch on its presence, which is how "absent" and "false" get conflated.
  const report = (fields: Record<string, unknown>) =>
    jsonEnvelope(CONTENT_SEARCH_SCHEMA_VERSION, "content-search.delete", {
      project: entry.name,
      dir: entry.dir,
      enabled: isEnabled(opts.home, entry.dir),
      ...fields,
    });

  if (!stats.exists) {
    if (opts.json) return report({ removed: false, applied: false, bytesFreed: 0, docs: 0 });
    return `No content shard for ${entry.name}.`;
  }
  // Preview by default. Deleting a shard is cheap to undo — a rebuild recreates
  // it — but naming what will go before it goes is what makes the `--yes` path
  // something a person can check first.
  if (!opts.yes) {
    if (opts.json) return report({ removed: false, applied: false, bytesFreed: stats.bytes, docs: stats.docs });
    return [
      `Would remove the content shard for ${entry.name}: ${stats.docs} document(s), ${stats.bytes} bytes.`,
      "Nothing was removed. Re-run with --yes to delete it.",
    ].join("\n");
  }
  const removal = deleteShard(opts.home, entry.dir);
  const stillEnabled = isEnabled(opts.home, entry.dir);
  if (opts.json) return report({ applied: true, ...removal });
  return [
    `Removed the content shard for ${entry.name} (${removal.docs} document(s), ${removal.bytesFreed} bytes).`,
    stillEnabled
      ? "The project is still opted in; the next `av content-search rebuild` recreates the shard."
      : "The project remains opted out.",
  ].join("\n");
}
