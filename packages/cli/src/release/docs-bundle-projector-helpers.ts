import { sanitize } from "../security/credential-sanitizer.js";
import type { Command } from "commander";

// What this is for: keeping a machine-private path — `/Users/someone/...`,
// `C:\Users\...` — out of a bundle meant to be published. Such a path always has
// a second segment, and requiring one is what separates it from a slash command
// like `/goal`, which several ported skills name in their description and which
// is not a path at all.
const ABSOLUTE_PATH = /(?:^|[\s(:=\[{"'])\/(?![\/\s])[^\s"'()[\]{}]*\/|(?:^|[\s:(])(?:\\\\[^\\]+\\[^\\]+|[A-Za-z]:[\\/])/;

export function sanitizePublicText(value: string, label: string): string {
  const normalized = value.replace(/\r\n/g, "\n");
  const safe = sanitize(normalized);
  if (safe !== normalized) throw new Error(`${label} contains redacted secret-shaped content`);
  if (ABSOLUTE_PATH.test(safe)) throw new Error(`${label} contains an absolute path`);
  return safe;
}

export function sanitizePublicList(values: string[], label: string): string[] {
  return values.map((value, index) => sanitizePublicText(value, `${label}[${index}]`)).sort((left, right) => left.localeCompare(right));
}

export function sanitizePublicBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function sanitizePublicTextValue(value: unknown, label: string): string | undefined {
  return typeof value === "string" ? sanitizePublicText(value, label) : undefined;
}

export function sortObject<T>(input: T): T {
  if (Array.isArray(input)) return input.map((value) => sortObject(value)) as T;
  if (!input || typeof input !== "object") return input;
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, sortObject(value)]),
  ) as T;
}

export function commandPath(program: Command, command: Command): string {
  const names: string[] = [];
  for (let cursor: Command | null = command; cursor; cursor = cursor.parent ?? null) {
    names.push(sanitizePublicText(cursor.name(), `command ${cursor.name()} name`));
    if (cursor === program) break;
  }
  return names.reverse().join(" ");
}

export function collectCommandTree(program: Command): Command[] {
  const commands: Command[] = [];
  const visit = (command: Command): void => {
    commands.push(command);
    command.commands.forEach(visit);
  };
  visit(program);
  return commands;
}
