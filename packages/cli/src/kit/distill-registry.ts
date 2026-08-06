export type UpstreamRelation = "distill" | "fork" | "none";
export type ClaimStatus = "covered" | "rejected" | "unclassified";

export interface DistillClaim {
  id: string;
  text: string;
  status: ClaimStatus;
  why?: string;
}

export interface DistillRegistryEntry {
  upstream: string;
  upstream_version: string;
  upstream_digest: string;
  upstream_relation: UpstreamRelation;
  pinned_at: string;
  claims?: DistillClaim[];
}

export interface DistillRegistry {
  schema_version: 1;
  skills: Record<string, DistillRegistryEntry>;
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

function parseClaim(value: unknown, label: string): DistillClaim {
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
  return { id, text, status: status as ClaimStatus, ...(why === undefined ? {} : { why }) };
}

function parseEntry(value: unknown, label: string): DistillRegistryEntry {
  const raw = record(value, label);
  const relation = requiredString(raw.upstream_relation, `${label}.upstream_relation`);
  if (!(["distill", "fork", "none"] as string[]).includes(relation)) {
    throw new Error(`${label}.upstream_relation must be distill, fork, or none`);
  }
  const entry: DistillRegistryEntry = {
    upstream: requiredString(raw.upstream, `${label}.upstream`),
    upstream_version: requiredString(raw.upstream_version, `${label}.upstream_version`),
    upstream_digest: requiredString(raw.upstream_digest, `${label}.upstream_digest`),
    upstream_relation: relation as UpstreamRelation,
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
export function parseDistillRegistry(input: string): DistillRegistry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error("distill registry must be valid JSON");
  }
  const root = record(parsed, "distill registry");
  if (root.schema_version !== 1) throw new Error("distill registry schema_version must equal 1");
  const rawSkills = record(root.skills, "distill registry.skills");
  const skills: Record<string, DistillRegistryEntry> = {};
  for (const [name, entry] of Object.entries(rawSkills)) {
    skills[name] = parseEntry(entry, `distill registry.skills.${name}`);
  }
  return { schema_version: 1, skills };
}
