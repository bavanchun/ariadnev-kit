import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { materializeEmbeddedKit, embeddedFlatRoot, getKitRoot } from "./embedded-kit.js";
import { EMBEDDED_VERSION, EMBEDDED_ASSETS } from "./kit-embedded.generated.js";
import { resolveKitRoot } from "./load-kit.js";

// Repo root: this test lives at packages/cli/src/kit/, so up 4.
const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..", "..");

function walkText(dir: string, base: string, acc: Record<string, string>): Record<string, string> {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walkText(abs, base, acc);
    else acc[relative(base, abs)] = readFileSync(abs, "utf8");
  }
  return acc;
}

describe("embedded-kit", () => {
  let cache: string;
  const prevCache = process.env.VCSKILL_CACHE_DIR;
  const prevForce = process.env.VCSKILL_EMBEDDED;

  beforeEach(() => {
    cache = mkdtempSync(join(tmpdir(), "vcskill-cache-"));
    process.env.VCSKILL_CACHE_DIR = cache;
  });
  afterEach(() => {
    rmSync(cache, { recursive: true, force: true });
    if (prevCache === undefined) delete process.env.VCSKILL_CACHE_DIR;
    else process.env.VCSKILL_CACHE_DIR = prevCache;
    if (prevForce === undefined) delete process.env.VCSKILL_EMBEDDED;
    else process.env.VCSKILL_EMBEDDED = prevForce;
  });

  it("extracts the embedded kit to a version-stamped cache and returns the kit root", () => {
    const root = materializeEmbeddedKit();
    expect(root).toBe(join(cache, EMBEDDED_VERSION, "kit"));
    expect(existsSync(join(root, "skills"))).toBe(true);
    expect(existsSync(join(root, "skills", "cook", "SKILL.md"))).toBe(true);
    expect(existsSync(join(root, "hooks", "session-init", "hook.cjs"))).toBe(true);
    expect(existsSync(join(root, "workflows", "schema", "workflow.schema.json"))).toBe(true);
    expect(existsSync(join(root, "workflows", "read-only-delivery.json"))).toBe(true);
  });

  it("materializes portable-manifest.json at the flat root", () => {
    const flat = embeddedFlatRoot();
    expect(existsSync(join(flat, "portable-manifest.json"))).toBe(true);
  });

  it("is idempotent (sentinel prevents re-extract) and content is intact", () => {
    const root = materializeEmbeddedKit();
    const cook = readFileSync(join(root, "skills", "cook", "SKILL.md"), "utf8");
    expect(cook).toContain("name: vc:cook");
    // second call: sentinel present, no throw, same root
    expect(materializeEmbeddedKit()).toBe(root);
  });

  it("getKitRoot uses the real fs when a kit exists on disk", () => {
    // point at the real repo kit — should resolve via fs, NOT extract
    const fsRoot = getKitRoot(process.cwd());
    expect(fsRoot).toBe(resolveKitRoot(process.cwd()));
    expect(existsSync(join(cache, EMBEDDED_VERSION))).toBe(false);
  });

  it("getKitRoot falls back to embedded when no kit is found on disk", () => {
    // a start dir with no kit ancestor → KitValidationError → embedded
    const root = getKitRoot(cache);
    expect(root).toBe(join(cache, EMBEDDED_VERSION, "kit"));
    expect(existsSync(join(root, "skills"))).toBe(true);
  });

  it("VCSKILL_EMBEDDED=1 forces the embedded path even with a kit on disk", () => {
    process.env.VCSKILL_EMBEDDED = "1";
    expect(getKitRoot(process.cwd())).toBe(join(cache, EMBEDDED_VERSION, "kit"));
  });

  it("drift guard: the generated map exactly matches the live kit + flat-root assets", () => {
    // Rebuild what the generator would embed, compare byte-for-byte. Fails if a
    // kit file was added/changed without re-running generate-embedded-kit.mjs.
    const expected: Record<string, string> = {};
    walkText(join(repoRoot, "kit"), repoRoot, expected);
    for (const f of ["portable-manifest.json", "kit.config.json"]) {
      expected[f] = readFileSync(join(repoRoot, f), "utf8");
    }
    expect(Object.keys(EMBEDDED_ASSETS).sort()).toEqual(Object.keys(expected).sort());
    for (const k of Object.keys(expected)) {
      expect(EMBEDDED_ASSETS[k], `stale embed for ${k} — run generate-embedded-kit.mjs`).toBe(expected[k]);
    }
  });
});
