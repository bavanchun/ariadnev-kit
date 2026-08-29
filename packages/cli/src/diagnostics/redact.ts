// Making a diagnostics bundle safe to paste into a public issue.
//
// ALLOWLIST, NOT DENYLIST, AND THAT IS THE WHOLE MODULE. A denylist over an
// open field set fails silently and exactly once: everything works until the
// day a new field carries a token, and nobody learns about it until the bundle
// is already in a public issue thread. An allowlist fails the other way — a new
// field is missing from a support bundle until someone adds it, which costs one
// round trip and leaks nothing.
//
// So there is no function here that takes an arbitrary object and removes the
// bad parts. There is a function that takes named, known-safe values and builds
// a document out of them. A field appears because somebody decided it is safe,
// never because nobody thought to exclude it.
//
// THE HOME PATH IS REDACTED EVEN THOUGH IT IS NOT A SECRET. It carries the
// user's account name, it is the single most common thing to appear in a path,
// and it tells a reader nothing they need. `/Users/someone/...` becomes `~/...`.
//
// THE STRING SCRUB IS A SECOND LINE, NOT THE FIRST. Every value assembled here
// is already meant to be safe; running it through the credential sanitiser as
// well costs nothing and covers the case where a "safe" field — a version
// string read off a file, an error message — turns out to quote something.

import { homedir } from "node:os";
import { sanitize } from "../security/credential-sanitizer.js";

/** Replace the user's home directory with `~`, wherever it appears. */
export function maskHome(text: string, home: string = homedir()): string {
  if (home.length === 0) return text;
  // Both separators: a Windows path recorded on one machine can be read on
  // another, and a bundle is pasted somewhere else by definition.
  const variants = [home, home.split("\\").join("/"), home.split("/").join("\\")];
  let masked = text;
  for (const variant of new Set(variants)) {
    if (variant.length === 0) continue;
    masked = masked.split(variant).join("~");
  }
  return masked;
}

/**
 * Every string that leaves this module goes through here.
 *
 * Credential shapes first, then the home path: the sanitiser works on the raw
 * text, and masking first could split a token across the replacement.
 */
export function scrub(value: string, home: string = homedir()): string {
  return maskHome(sanitize(value, {}), home);
}

/** A value that may appear in a bundle: primitives, and structures of them. */
export type SafeValue = string | number | boolean | null | SafeValue[] | { [key: string]: SafeValue };

/**
 * Scrub every string inside an already-assembled safe structure.
 *
 * Deliberately not "sanitise this object for me". The caller has already
 * decided every field belongs; this only cleans the values it was handed, and
 * it cannot add or remove fields.
 */
export function scrubDeep(value: SafeValue, home: string = homedir()): SafeValue {
  if (typeof value === "string") return scrub(value, home);
  if (Array.isArray(value)) return value.map((item) => scrubDeep(item, home));
  if (value !== null && typeof value === "object") {
    const out: { [key: string]: SafeValue } = {};
    for (const [key, item] of Object.entries(value)) out[key] = scrubDeep(item, home);
    return out;
  }
  return value;
}

/**
 * Field names that must never appear in a bundle, whatever their value.
 *
 * A backstop on the allowlist rather than a replacement for it: the builder
 * below only ever assembles named fields, so this exists to make a mistake
 * there loud instead of silent.
 */
const FORBIDDEN_KEYS = /^(?:.*(?:token|secret|password|passwd|credential|api[_-]?key|authorization|cookie|session[_-]?id).*)$/i;

/** True when a key is one no support bundle should ever carry. */
export function isForbiddenKey(key: string): boolean {
  return FORBIDDEN_KEYS.test(key);
}

/**
 * Assert the assembled bundle carries no forbidden key at any depth.
 *
 * Throwing rather than removing. A bundle that silently dropped a field would
 * hide the fact that the builder tried to include it, and the builder trying to
 * include it is the bug.
 */
export function assertNoForbiddenKeys(value: SafeValue, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenKeys(item, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (isForbiddenKey(key)) {
      throw new Error(`diagnostics bundle would carry a forbidden field: ${path}.${key}`);
    }
    assertNoForbiddenKeys(item, `${path}.${key}`);
  }
}
