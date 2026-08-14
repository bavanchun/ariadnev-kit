export type ClaimStatus = "covered" | "rejected" | "unclassified";

export interface Claim {
  id: string;
  text: string;
  status: ClaimStatus;
  why?: string;
  /**
   * Optional verbatim substring the adjudicator quotes from the skill body
   * to prove a `covered` claim. When present, the coverage checker verifies
   * the body still contains it (guarding against ledger rot when a body edit
   * removes the enforcing sentence). Absent → coverage falls back to the 35%
   * keyword-overlap heuristic. Meaningful only when status === "covered".
   */
  anchor?: string;
}

export interface RegistryEntry {
  pinned_at: string;
  claims?: Claim[];
}

export interface Registry {
  schema_version: 1;
  skills: Record<string, RegistryEntry>;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function parseClaim(value: unknown, label: string): Claim {
  const raw = record(value, label);
  const id = requiredString(raw.id, `${label}.id`);
  const text = requiredString(raw.text, `${label}.text`);
  const status = requiredString(raw.status, `${label}.status`);
  if (!(["covered", "rejected", "unclassified"] as string[]).includes(status)) {
    throw new Error(`${label}.status must be covered, rejected, or unclassified`);
  }
  const why = raw.why;
  if (why !== undefined && typeof why !== "string") {
    throw new Error(`${label}.why must be a string`);
  }
  if (status === "rejected" && (typeof why !== "string" || why.trim().length === 0)) {
    throw new Error(`rejected claim ${id} must include why`);
  }
  const anchor = raw.anchor;
  if (anchor !== undefined) {
    if (typeof anchor !== "string" || anchor.trim().length === 0) {
      throw new Error(`${label}.anchor must be a non-empty string when present`);
    }
    if (status !== "covered") {
      throw new Error(`${label}.anchor is only meaningful on covered claims`);
    }
  }
  return {
    id,
    text,
    status: status as ClaimStatus,
    ...(why === undefined ? {} : { why }),
    ...(anchor === undefined ? {} : { anchor }),
  };
}

function parseEntry(value: unknown, label: string): RegistryEntry {
  const raw = record(value, label);
  const entry: RegistryEntry = {
    pinned_at: requiredString(raw.pinned_at, `${label}.pinned_at`),
  };
  if (raw.claims !== undefined) {
    if (!Array.isArray(raw.claims)) throw new Error(`${label}.claims must be an array`);
    entry.claims = raw.claims.map((claim, index) => parseClaim(claim, `${label}.claims[${index}]`));
    const ids = entry.claims.map((claim) => claim.id);
    if (new Set(ids).size !== ids.length) throw new Error(`${label}.claims must have unique ids`);
  }
  return entry;
}

/** Parse the checked-in schema-v1 registry at the filesystem boundary. */
export function parseRegistry(input: string): Registry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error("kit registry must be valid JSON");
  }
  const root = record(parsed, "kit registry");
  if (root.schema_version !== 1) throw new Error("kit registry schema_version must equal 1");
  const rawSkills = record(root.skills, "kit registry.skills");
  const skills: Record<string, RegistryEntry> = {};
  for (const [name, entry] of Object.entries(rawSkills)) {
    skills[name] = parseEntry(entry, `kit registry.skills.${name}`);
  }
  return { schema_version: 1, skills };
}
