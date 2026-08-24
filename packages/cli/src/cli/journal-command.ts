// `ariadnev journal create|list|show|validate` — the technical journal several
// skills write at the end of a session.
//
// Entries live under the docs dir from the config (`paths.docs`), in `journal/`.
// Creating one never overwrites: two things worth writing about can happen in
// the same minute, and losing the first to the second is the one failure a
// journal cannot recover from.

import { EXIT, UsageError, type ExitCode } from "./exit-codes.js";
import { jsonEnvelope } from "./json-envelope.js";
import {
  JOURNAL_STATUSES,
  entryFileName,
  renderEntry,
  summarizeEntry,
  validateEntry,
  type JournalStatus,
} from "../journal/journal-entry.js";

export const JOURNAL_SCHEMA_VERSION = 1;

export interface JournalDeps {
  listDir(path: string): string[] | null;
  readFile(path: string): string | null;
  writeFile(path: string, content: string): void;
  fileExists(path: string): boolean;
}

export interface JournalOpts {
  cwd: string;
  /** Docs directory, relative to cwd — `paths.docs` from the config. */
  docsDir: string;
  json?: boolean;
  dryRun?: boolean;
}

export interface JournalResult {
  output: string;
  exitCode: ExitCode;
}

export function journalDir(opts: JournalOpts): string {
  return `${opts.cwd}/${opts.docsDir}/journal`;
}

function envelope(kind: string, data: unknown): string {
  return jsonEnvelope(JOURNAL_SCHEMA_VERSION, kind, data);
}

function entries(deps: JournalDeps, opts: JournalOpts): string[] {
  return (deps.listDir(journalDir(opts)) ?? []).filter((file) => file.endsWith(".md")).sort().reverse();
}

export interface CreateInput {
  title: string;
  component: string;
  status: string;
  at: string;
  body?: string;
}

export function runJournalCreate(input: CreateInput, opts: JournalOpts, deps: JournalDeps): JournalResult {
  if (!(JOURNAL_STATUSES as readonly string[]).includes(input.status)) {
    throw new UsageError(`unknown status "${input.status}" (expected ${JOURNAL_STATUSES.join(", ")})`);
  }
  const entry = { ...input, status: input.status as JournalStatus };
  const name = entryFileName(entry);
  const path = `${journalDir(opts)}/${name}`;
  if (deps.fileExists(path)) {
    // Never overwrite: two events in one minute is ordinary, and losing the
    // first to the second is the one failure a journal cannot recover from.
    throw new UsageError(`${name} already exists — give the entry a different title`);
  }
  const content = renderEntry(entry);
  if (!opts.dryRun) deps.writeFile(path, content);
  if (opts.json) return { output: envelope("journal.create", { file: name, path, dryRun: !!opts.dryRun }), exitCode: EXIT.ok };
  return { output: `ariadnev journal — ${opts.dryRun ? "would write" : "wrote"} ${opts.docsDir}/journal/${name}`, exitCode: EXIT.ok };
}

export function runJournalList(opts: JournalOpts, deps: JournalDeps, limit = 20): JournalResult {
  const found = entries(deps, opts)
    .slice(0, limit)
    .map((file) => summarizeEntry(file, deps.readFile(`${journalDir(opts)}/${file}`) ?? ""));
  if (opts.json) return { output: envelope("journal.list", { entries: found }), exitCode: EXIT.ok };
  if (found.length === 0) return { output: `ariadnev journal — nothing under ${opts.docsDir}/journal/`, exitCode: EXIT.ok };
  const lines = ["ariadnev journal"];
  for (const entry of found) {
    lines.push(`  ${(entry.date ?? "(undated)").padEnd(17)}  ${(entry.status ?? "—").padEnd(9)}  ${entry.title ?? entry.file}`);
  }
  return { output: lines.join("\n"), exitCode: EXIT.ok };
}

/** Show one entry, by file name or by the first name that contains the term. */
export function runJournalShow(term: string, opts: JournalOpts, deps: JournalDeps): JournalResult {
  const all = entries(deps, opts);
  const file = all.find((name) => name === term) ?? all.find((name) => name.includes(term));
  if (!file) {
    if (opts.json) return { output: envelope("journal.show", { term, found: false }), exitCode: EXIT.failed };
    return { output: `ariadnev journal — nothing matching "${term}"`, exitCode: EXIT.failed };
  }
  const content = deps.readFile(`${journalDir(opts)}/${file}`) ?? "";
  if (opts.json) return { output: envelope("journal.show", { file, content }), exitCode: EXIT.ok };
  return { output: content, exitCode: EXIT.ok };
}

export function runJournalValidate(opts: JournalOpts, deps: JournalDeps): JournalResult {
  const problems = entries(deps, opts).flatMap((file) =>
    validateEntry(file, deps.readFile(`${journalDir(opts)}/${file}`) ?? ""),
  );
  if (opts.json) {
    return { output: envelope("journal.validate", { problems }), exitCode: problems.length > 0 ? EXIT.failed : EXIT.ok };
  }
  if (problems.length === 0) {
    return { output: `ariadnev journal validate — ${entries(deps, opts).length} entry(ies), nothing wrong`, exitCode: EXIT.ok };
  }
  const lines = ["ariadnev journal validate"];
  for (const problem of problems) lines.push(`  ${problem.file}: ${problem.problem}`);
  lines.push(`  ${problems.length} problem(s)`);
  return { output: lines.join("\n"), exitCode: EXIT.failed };
}
