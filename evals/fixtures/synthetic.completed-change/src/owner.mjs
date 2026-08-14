export function normalizeOwner(value) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) throw new Error("owner is required");
  return normalized;
}
