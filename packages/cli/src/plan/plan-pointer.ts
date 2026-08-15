// The current-plan pointer, and what a plan directory looks like from outside.
//
// Pure: the caller supplies the directory listing and file contents, so the
// rules are testable without a filesystem and the command layer stays thin.
//
// The pointer is keyed by branch. A plan belongs to the work in progress, and
// work in progress is what a branch is — one pointer per checkout would make
// switching branches silently point a skill at the wrong plan, which is worse
// than having no pointer at all.

export const POINTER_SCHEMA_VERSION = 1;

export interface PlanPointerFile {
  schemaVersion: number;
  /** Branch name → plan directory name, relative to the plans root. */
  byBranch: Record<string, string>;
}

export interface PhaseSummary {
  /** File name, e.g. "phase-03-kit-schema.md". */
  file: string;
  phase: number | null;
  title: string | null;
  status: string | null;
}

export interface PlanSummary {
  /** Directory name under the plans root. */
  name: string;
  /** Plan-level status from plan.md frontmatter, when it declares one. */
  status: string | null;
  phases: PhaseSummary[];
}

export function emptyPointer(): PlanPointerFile {
  return { schemaVersion: POINTER_SCHEMA_VERSION, byBranch: {} };
}

/** Parse a pointer file. Anything unreadable or from another schema is empty. */
export function parsePointer(raw: string | null): PlanPointerFile {
  if (raw === null) return emptyPointer();
  try {
    const parsed = JSON.parse(raw) as Partial<PlanPointerFile>;
    if (parsed.schemaVersion !== POINTER_SCHEMA_VERSION) return emptyPointer();
    const byBranch = parsed.byBranch;
    if (typeof byBranch !== "object" || byBranch === null) return emptyPointer();
    const clean: Record<string, string> = {};
    for (const [branch, plan] of Object.entries(byBranch)) {
      if (typeof branch === "string" && typeof plan === "string") clean[branch] = plan;
    }
    return { schemaVersion: POINTER_SCHEMA_VERSION, byBranch: clean };
  } catch {
    return emptyPointer();
  }
}

export function setPointer(file: PlanPointerFile, branch: string, plan: string): PlanPointerFile {
  return { schemaVersion: POINTER_SCHEMA_VERSION, byBranch: { ...file.byBranch, [branch]: plan } };
}

export function currentPlan(file: PlanPointerFile, branch: string): string | null {
  return file.byBranch[branch] ?? null;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

function frontmatterField(raw: string, field: string): string | null {
  const match = FRONTMATTER.exec(raw);
  if (!match) return null;
  const line = new RegExp(`^${field}:\\s*(.+)$`, "m").exec(match[1]);
  if (!line) return null;
  return line[1].trim().replace(/^["']|["']$/g, "") || null;
}

export function summarizePhase(file: string, raw: string): PhaseSummary {
  const phase = frontmatterField(raw, "phase");
  const parsed = phase === null ? Number.NaN : Number(phase);
  return {
    file,
    phase: Number.isFinite(parsed) ? parsed : null,
    title: frontmatterField(raw, "title"),
    status: frontmatterField(raw, "status"),
  };
}

/**
 * Build the summary of one plan directory.
 *
 * @param name Directory name under the plans root.
 * @param files `{ fileName: content }` for the directory's markdown files.
 */
export function summarizePlan(name: string, files: Record<string, string>): PlanSummary {
  const phases = Object.entries(files)
    .filter(([file]) => /^phase-\d+.*\.md$/.test(file))
    .map(([file, raw]) => summarizePhase(file, raw))
    .sort((a, b) => (a.phase ?? Number.MAX_SAFE_INTEGER) - (b.phase ?? Number.MAX_SAFE_INTEGER));
  return {
    name,
    status: files["plan.md"] ? frontmatterField(files["plan.md"], "status") : null,
    phases,
  };
}

/** A plan directory is one that carries a `plan.md`; nothing else qualifies. */
export function isPlanDirectory(files: string[]): boolean {
  return files.includes("plan.md");
}
