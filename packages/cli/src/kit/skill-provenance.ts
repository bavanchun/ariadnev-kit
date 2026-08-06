const PROVENANCE_FIELDS = [
  "upstream",
  "upstream_version",
  "upstream_digest",
  "upstream_relation",
] as const;

const RELATIONS = new Set(["distill", "fork", "none"]);
const UPSTREAM_ID = /^ak:[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const PRE_RELEASE_ID = "(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)";
const VERSION = new RegExp(
  `^(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)` +
    `(?:-${PRE_RELEASE_ID}(?:\\.${PRE_RELEASE_ID})*)?` +
    "(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$",
);
const DIGEST = /^sha256:[a-f0-9]{64}$/;

/** Validate only provenance-owned metadata fields; other metadata stays open. */
export function validateSkillProvenance(metadata: unknown, label: string): string[] {
  const errors: string[] = [];
  const values =
    typeof metadata === "object" && metadata !== null
      ? (metadata as Record<string, unknown>)
      : {};

  for (const field of PROVENANCE_FIELDS) {
    if (typeof values[field] !== "string") {
      errors.push(`${label}: metadata.${field} must be a string`);
    }
  }
  if (errors.length > 0) return errors;

  const upstream = values.upstream as string;
  const version = values.upstream_version as string;
  const digest = values.upstream_digest as string;
  const relation = values.upstream_relation as string;
  if (!RELATIONS.has(relation)) {
    errors.push(`${label}: metadata.upstream_relation must be distill, fork, or none`);
    return errors;
  }

  const allNone = [upstream, version, digest, relation].every((value) => value === "none");
  const anyNone = [upstream, version, digest, relation].some((value) => value === "none");
  if (anyNone) {
    if (!allNone) errors.push(`${label}: provenance fields must all equal "none" together`);
    return errors;
  }

  if (!UPSTREAM_ID.test(upstream)) errors.push(`${label}: metadata.upstream must be an ak:<slug> id`);
  if (!VERSION.test(version)) errors.push(`${label}: metadata.upstream_version must be a semantic version`);
  if (!DIGEST.test(digest)) errors.push(`${label}: metadata.upstream_digest must be sha256:<64 lowercase hex>`);
  return errors;
}
