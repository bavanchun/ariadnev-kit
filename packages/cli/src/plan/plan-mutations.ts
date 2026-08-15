// Editing a plan file, as text.
//
// Plans are hand-written Markdown and stay that way: a mutation rewrites the one
// frontmatter line it is changing and leaves every other byte alone. Parsing to
// a model and re-serializing would reformat a file someone wrote by hand, and
// the diff would stop being reviewable — which is most of what a plan file is
// for.
//
// Pure: content in, content out.

export const PLAN_STATUSES = ["pending", "in-progress", "completed", "cancelled"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export class PlanEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanEditError";
  }
}

const FRONTMATTER = /^(---\r?\n)([\s\S]*?)(\r?\n---)/;

/** Read one frontmatter field, or null when absent. */
export function readField(content: string, field: string): string | null {
  const block = FRONTMATTER.exec(content);
  if (!block) return null;
  const line = new RegExp(`^${field}:[ \\t]*(.*)$`, "m").exec(block[2]);
  if (!line) return null;
  return line[1].trim().replace(/^["']|["']$/g, "") || null;
}

/**
 * Set one frontmatter field, adding it if absent.
 *
 * Only the field's own line changes; everything else — key order, comments,
 * spacing, the body — is untouched.
 */
export function setField(content: string, field: string, value: string): string {
  const block = FRONTMATTER.exec(content);
  if (!block) throw new PlanEditError("file has no frontmatter block to edit");
  const front = block[2];
  const pattern = new RegExp(`^${field}:[ \\t]*.*$`, "m");
  const updated = pattern.test(front)
    ? front.replace(pattern, `${field}: ${value}`)
    : `${front}\n${field}: ${value}`;
  return content.slice(0, block.index) + block[1] + updated + block[3] + content.slice(block.index + block[0].length);
}

export function assertStatus(value: string): PlanStatus {
  if (!(PLAN_STATUSES as readonly string[]).includes(value)) {
    throw new PlanEditError(`unknown status "${value}" (expected ${PLAN_STATUSES.join(", ")})`);
  }
  return value as PlanStatus;
}

/**
 * Update the phases table in a plan index, if it has one.
 *
 * The convention these plans follow is a `| N | title | … | status |` row per
 * phase, with the status in the last column. Keeping it in step with the phase
 * files matters: the index is what a reader looks at, and an index that
 * disagrees with the files is worse than one that is absent.
 *
 * Returns the content unchanged when there is no row for that phase — the phase
 * file is the record, the table is a view of it.
 */
export function setPhaseRowStatus(content: string, phase: number, status: PlanStatus): string {
  const rowPattern = new RegExp(`^(\\|\\s*${phase}\\s*\\|.*\\|)([^|\\n]*)\\|\\s*$`, "m");
  const match = rowPattern.exec(content);
  if (!match) return content;
  // Bold is how these tables mark a status that changed from the default; keep
  // whichever emphasis the row already uses rather than imposing one.
  const emphasized = /\*\*/.test(match[2]);
  const rendered = emphasized || status !== "pending" ? `**${status}**` : status;
  return content.replace(rowPattern, `$1 ${rendered} |`);
}

export interface PlanSearchHit {
  file: string;
  line: number;
  text: string;
}

/** Case-insensitive substring search across a plan's files. */
export function searchPlanFiles(files: Record<string, string>, query: string): PlanSearchHit[] {
  const needle = query.toLowerCase();
  const hits: PlanSearchHit[] = [];
  for (const [file, content] of Object.entries(files).sort()) {
    content.split("\n").forEach((text, index) => {
      if (text.toLowerCase().includes(needle)) hits.push({ file, line: index + 1, text: text.trim() });
    });
  }
  return hits;
}

export interface PlanIntegrityFinding {
  file: string;
  problem: string;
}

/**
 * What a re-read can check about a plan directory.
 *
 * There is no index to rebuild here — the files are the record — so this is what
 * `reindex` honestly amounts to: read everything again and say what is wrong.
 */
export function checkPlanIntegrity(files: Record<string, string>): PlanIntegrityFinding[] {
  const findings: PlanIntegrityFinding[] = [];
  if (!files["plan.md"]) findings.push({ file: "plan.md", problem: "missing — a plan directory is defined by its index" });

  const seen = new Map<number, string>();
  for (const [file, content] of Object.entries(files).sort()) {
    if (!/^phase-\d+.*\.md$/.test(file)) continue;
    if (!FRONTMATTER.test(content)) {
      findings.push({ file, problem: "no frontmatter — phase number and status cannot be read" });
      continue;
    }
    const status = readField(content, "status");
    if (status === null) findings.push({ file, problem: "no status field" });
    else if (!(PLAN_STATUSES as readonly string[]).includes(status)) {
      findings.push({ file, problem: `status "${status}" is not one of ${PLAN_STATUSES.join(", ")}` });
    }
    const raw = readField(content, "phase");
    const phase = raw === null ? Number.NaN : Number(raw);
    if (!Number.isFinite(phase)) findings.push({ file, problem: "no usable phase number" });
    else if (seen.has(phase)) findings.push({ file, problem: `phase ${phase} is also declared by ${seen.get(phase)}` });
    else seen.set(phase, file);
  }
  return findings;
}
