import type { DocsBundleSkillRecord } from "./docs-bundle-types.js";
import { sanitizePublicList, sanitizePublicText } from "./docs-bundle-projector-helpers.js";

const PUBLIC_METADATA_KEYS = [
  "attribution",
  "author",
  "category",
  "forked-from",
  "version",
] as const;

type PublicMetadataValue = DocsBundleSkillRecord["metadata"][string];

function sanitizeMetadataValue(value: unknown, label: string): PublicMetadataValue | undefined {
  if (typeof value === "string") return sanitizePublicText(value, label);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (!Array.isArray(value)) return undefined;
  const items = value.every((item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean" || item === null);
  if (!items) return undefined;
  return value.map((item, index) => typeof item === "string" ? sanitizePublicText(item, `${label}[${index}]`) : item);
}

export function projectSkillMetadata(input: unknown, label: string): DocsBundleSkillRecord["metadata"] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const entries = PUBLIC_METADATA_KEYS.flatMap((key) => {
    const value = sanitizeMetadataValue(source[key], `${label}.${key}`);
    return value === undefined ? [] : [[key, Array.isArray(value) && value.every((item) => typeof item === "string")
      ? sanitizePublicList(value, `${label}.${key}`)
      : value] as const];
  });
  return Object.fromEntries(entries);
}
