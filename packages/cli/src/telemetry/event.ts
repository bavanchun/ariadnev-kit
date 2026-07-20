// Pure event construction + sanitization for telemetry. Only categorical enums
// leave the machine — a user-authored name never does, raw error text never
// does — and per-event privacy invariants are applied to EVERY payload so a
// regression can't silently start leaking.

export const TELEMETRY_SCHEMA_VERSION = 1;

export type ErrorClass = "network" | "filesystem" | "permission" | "parse" | "unknown";

const KNOWN_PROVIDERS = new Set(["claude-code", "codex", "cursor", "antigravity", "opencode", "generic"]);

/** Map an arbitrary error to a fixed enum — never the raw message. */
export function classifyError(err: unknown): ErrorClass {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  if (code === "ENOENT" || code === "EISDIR" || code === "ENOTDIR") return "filesystem";
  if (code === "EACCES" || code === "EPERM") return "permission";
  const msg = String((err as Error | undefined)?.message ?? err ?? "").toLowerCase();
  if (/network|fetch|econn|timeout|dns|socket/.test(msg)) return "network";
  if (/json|parse|unexpected token|syntax/.test(msg)) return "parse";
  if (/enoent|no such file/.test(msg)) return "filesystem";
  return "unknown";
}

/** Collapse a provider id to a known enum or "custom" — never a user value. */
export function categorizeProvider(id: string): string {
  return KNOWN_PROVIDERS.has(id) ? id : "custom";
}

// Only these value types may appear in a payload — no free-form objects.
export type TelemetryValue = string | number | boolean;
export type TelemetryEvent = Record<string, TelemetryValue>;

// Applied to EVERY payload. No IP, no person profile, no id — stateless.
const INVARIANTS: TelemetryEvent = {
  schema: TELEMETRY_SCHEMA_VERSION,
  $ip: "",
  $process_person_profile: false,
};

/** Build a categorical event with invariants. Drops any non-scalar field so a
 * caller can never smuggle an object/array (potential PII) into the payload. */
export function buildEvent(name: string, fields: Record<string, unknown> = {}): TelemetryEvent {
  const out: TelemetryEvent = { ...INVARIANTS, event: name };
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}
