import { describe, it, expect } from "vitest";
import {
  journalDir,
  runJournalCreate,
  runJournalList,
  runJournalShow,
  runJournalValidate,
  type JournalDeps,
} from "./journal-command.js";
import { entryFileName, renderEntry, slugify, stamp, validateEntry, JournalError } from "../journal/journal-entry.js";
import { UsageError } from "./exit-codes.js";

const OPTS = { cwd: "/repo", docsDir: "docs" };
const DIR = journalDir(OPTS);

function deps(files: Record<string, string>): JournalDeps {
  return {
    listDir: (path) => (path === DIR ? Object.keys(files).map((p) => p.slice(DIR.length + 1)) : null),
    readFile: (path) => files[path] ?? null,
    writeFile: (path, content) => {
      files[path] = content;
    },
    fileExists: (path) => path in files,
  };
}

describe("entry naming and rendering", () => {
  it("names a file by date and slug, the way the existing entries are named", () => {
    const input = { title: "The audit oversold the weakness", component: "kit", status: "Resolved" as const, at: "2026-07-20T12:00:00" };
    expect(entryFileName(input)).toBe("260720-1200-the-audit-oversold-the-weakness.md");
    expect(stamp("2026-01-05T09:07:00")).toBe("260105-0907");
  });

  it("refuses a title with nothing to build a name from", () => {
    expect(() => slugify("—— ✳️ ——")).toThrow(JournalError);
  });

  it("renders the header block the existing entries use", () => {
    const content = renderEntry({
      title: "Binary path fixed",
      component: "install",
      status: "Resolved",
      at: "2026-08-15T16:30:00",
      body: "The write path read bytes; the removal path did not.",
    });
    expect(content).toContain("# Binary path fixed");
    expect(content).toContain("**Date**: 2026-08-15 16:30");
    expect(content).toContain("**Status**: Resolved");
    expect(content).toContain("## What happened");
    expect(content).toContain("the removal path did not");
  });

  it("rejects a status outside the vocabulary", () => {
    expect(() =>
      renderEntry({ title: "x", component: "y", status: "Done" as never, at: "2026-08-15T10:00:00" }),
    ).toThrow(/Resolved, Ongoing, Blocked, Abandoned/);
  });
});

describe("ariadnev journal create", () => {
  it("writes an entry under the docs dir", () => {
    const files: Record<string, string> = {};
    const { output, exitCode } = runJournalCreate(
      { title: "First entry", component: "cli", status: "Resolved", at: "2026-08-15T10:00:00" },
      OPTS,
      deps(files),
    );
    expect(exitCode).toBe(0);
    expect(output).toContain("docs/journal/260815-1000-first-entry.md");
    expect(files[`${DIR}/260815-1000-first-entry.md`]).toContain("# First entry");
  });

  it("never overwrites an entry that is already there", () => {
    // Two things worth writing about can happen in the same minute; losing the
    // first to the second is the one failure a journal cannot recover from.
    const files: Record<string, string> = { [`${DIR}/260815-1000-first-entry.md`]: "# already written\n" };
    expect(() =>
      runJournalCreate({ title: "First entry", component: "cli", status: "Resolved", at: "2026-08-15T10:00:00" }, OPTS, deps(files)),
    ).toThrow(UsageError);
    expect(files[`${DIR}/260815-1000-first-entry.md`]).toBe("# already written\n");
  });

  it("writes nothing under --dry-run", () => {
    const files: Record<string, string> = {};
    runJournalCreate(
      { title: "Dry", component: "cli", status: "Ongoing", at: "2026-08-15T10:00:00" },
      { ...OPTS, dryRun: true },
      deps(files),
    );
    expect(Object.keys(files)).toEqual([]);
  });

  it("rejects an unknown status at the command boundary", () => {
    expect(() =>
      runJournalCreate({ title: "x", component: "y", status: "Finished", at: "2026-08-15T10:00:00" }, OPTS, deps({})),
    ).toThrow(UsageError);
  });
});

describe("ariadnev journal list / show / validate", () => {
  const files = (): Record<string, string> => ({
    [`${DIR}/260815-1000-first.md`]: "# First\n\n**Date**: 2026-08-15 10:00\n**Component**: cli\n**Status**: Resolved\n\n## What happened\n\nx\n",
    [`${DIR}/260814-0900-older.md`]: "# Older\n\n**Date**: 2026-08-14 09:00\n**Component**: kit\n**Status**: Ongoing\n\n## What happened\n\ny\n",
  });

  it("lists newest first", () => {
    const parsed = JSON.parse(runJournalList({ ...OPTS, json: true }, deps(files())).output);
    expect(parsed.data.entries.map((e: { title: string }) => e.title)).toEqual(["First", "Older"]);
  });

  it("shows an entry by a fragment of its name", () => {
    const { output, exitCode } = runJournalShow("older", OPTS, deps(files()));
    expect(exitCode).toBe(0);
    expect(output).toContain("# Older");
    expect(runJournalShow("nothing", OPTS, deps(files())).exitCode).toBe(1);
  });

  it("validate passes clean entries and names what a bad one is missing", () => {
    expect(runJournalValidate(OPTS, deps(files())).exitCode).toBe(0);

    const broken = files();
    broken[`${DIR}/260813-0800-bad.md`] = "no heading, no date, no status\n";
    const result = runJournalValidate(OPTS, deps(broken));
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("no `# title` heading");
    expect(result.output).toContain("no **Status** line");
  });

  it("flags an entry that is a filename and nothing else", () => {
    const problems = validateEntry("x.md", "# Title\n\n**Date**: 2026-08-15 10:00\n**Status**: Resolved\n");
    expect(problems.some((p) => p.problem.includes("no section headings"))).toBe(true);
  });
});
