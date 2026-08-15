// Journal entries: a dated Markdown file per notable event.
//
// The format is the one already in `docs/journal/`: a title heading, then bold
// `**Date**`/`**Component**`/`**Status**` lines, then prose. Pure functions —
// naming, rendering, and validation — with the filesystem left to the caller.

export const JOURNAL_STATUSES = ["Resolved", "Ongoing", "Blocked", "Abandoned"] as const;
export type JournalStatus = (typeof JOURNAL_STATUSES)[number];

export class JournalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JournalError";
  }
}

export interface JournalInput {
  title: string;
  component: string;
  status: JournalStatus;
  /** ISO instant; the caller supplies it so nothing here reads the clock. */
  at: string;
  body?: string;
}

const SLUG_MAX = 60;

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/, "");
  if (slug.length === 0) throw new JournalError("title has no letters or digits to build a file name from");
  return slug;
}

/** `YYMMDD-HHmm`, the stamp the existing entries use. */
export function stamp(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) throw new JournalError(`"${at}" is not a date`);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return (
    `${String(date.getFullYear()).slice(2)}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}`
  );
}

export function entryFileName(input: JournalInput): string {
  return `${stamp(input.at)}-${slugify(input.title)}.md`;
}

function humanDate(at: string): string {
  const date = new Date(at);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function renderEntry(input: JournalInput): string {
  if (input.title.trim().length === 0) throw new JournalError("an entry needs a title");
  if (!(JOURNAL_STATUSES as readonly string[]).includes(input.status)) {
    throw new JournalError(`unknown status "${input.status}" (expected ${JOURNAL_STATUSES.join(", ")})`);
  }
  const body = (input.body ?? "").trim();
  return [
    `# ${input.title.trim()}`,
    "",
    `**Date**: ${humanDate(input.at)}`,
    `**Component**: ${input.component.trim() || "(unspecified)"}`,
    `**Status**: ${input.status}`,
    "",
    "## What happened",
    "",
    body.length > 0 ? body : "_(fill this in)_",
    "",
  ].join("\n");
}

export interface EntrySummary {
  file: string;
  title: string | null;
  date: string | null;
  component: string | null;
  status: string | null;
}

function firstMatch(content: string, pattern: RegExp): string | null {
  const match = pattern.exec(content);
  return match ? match[1].trim() : null;
}

export function summarizeEntry(file: string, content: string): EntrySummary {
  return {
    file,
    title: firstMatch(content, /^#\s+(.+)$/m),
    date: firstMatch(content, /^\*\*Date\*\*:\s*(.+)$/m),
    component: firstMatch(content, /^\*\*Component\*\*:\s*(.+)$/m),
    status: firstMatch(content, /^\*\*Status\*\*:\s*(.+)$/m),
  };
}

export interface EntryProblem {
  file: string;
  problem: string;
}

/**
 * What makes an entry usable later: a title to find it by, a date, and a status.
 * The component is optional — plenty of entries are about the project rather
 * than a part of it.
 */
export function validateEntry(file: string, content: string): EntryProblem[] {
  const summary = summarizeEntry(file, content);
  const problems: EntryProblem[] = [];
  if (!summary.title) problems.push({ file, problem: "no `# title` heading" });
  if (!summary.date) problems.push({ file, problem: "no **Date** line" });
  if (!summary.status) problems.push({ file, problem: "no **Status** line" });
  else if (!(JOURNAL_STATUSES as readonly string[]).includes(summary.status)) {
    problems.push({ file, problem: `status "${summary.status}" is not one of ${JOURNAL_STATUSES.join(", ")}` });
  }
  if (!/^##\s+/m.test(content)) problems.push({ file, problem: "no section headings — an entry with no body is a filename" });
  return problems;
}
