import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { gunzipSync } from "node:zlib";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { materializeEmbeddedKit, embeddedFlatRoot, getKitRoot, cacheRoot } from "./embedded-kit.js";
import { EMBEDDED_VERSION, EMBEDDED_DIGEST, EMBEDDED_ASSETS } from "./kit-embedded.generated.js";
import { resolveKitRoot } from "./load-kit.js";
import { IGNORE_DIRS, IGNORE_FILES, isTextFile } from "../install/install-types.js";

// Repo root: this test lives at packages/cli/src/kit/, so up 4.
const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..", "..");

/** Mirror of the generator's walk, so the drift guard measures the same thing. */
function walkAssets(dir: string, base: string, acc: Record<string, Buffer>): Record<string, Buffer> {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const st = lstatSync(abs);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      if (!IGNORE_DIRS.has(entry)) walkAssets(abs, base, acc);
      continue;
    }
    if (IGNORE_FILES.has(entry)) continue;
    acc[relative(base, abs)] = readFileSync(abs);
  }
  return acc;
}

/** The bytes an embedded asset decodes back to. */
function assetBytes(key: string): Buffer {
  const asset = EMBEDDED_ASSETS[key];
  if (asset.gz !== undefined) return gunzipSync(Buffer.from(asset.gz, "base64"));
  return asset.b64 !== undefined ? Buffer.from(asset.b64, "base64") : Buffer.from(asset.text ?? "", "utf8");
}

describe("embedded-kit", () => {
  let cache: string;
  let stamped: string;
  const prevCache = process.env.ARIADNEV_CACHE_DIR;
  const prevForce = process.env.ARIADNEV_EMBEDDED;

  beforeEach(() => {
    cache = mkdtempSync(join(tmpdir(), "ariadnev-cache-"));
    process.env.ARIADNEV_CACHE_DIR = cache;
    stamped = join(cache, `${EMBEDDED_VERSION}-${EMBEDDED_DIGEST}`);
  });
  afterEach(() => {
    rmSync(cache, { recursive: true, force: true });
    if (prevCache === undefined) delete process.env.ARIADNEV_CACHE_DIR;
    else process.env.ARIADNEV_CACHE_DIR = prevCache;
    if (prevForce === undefined) delete process.env.ARIADNEV_EMBEDDED;
    else process.env.ARIADNEV_EMBEDDED = prevForce;
  });

  it("extracts the embedded kit to a content-stamped cache and returns the kit root", () => {
    const root = materializeEmbeddedKit();
    expect(root).toBe(join(stamped, "kit"));
    expect(existsSync(join(root, "skills"))).toBe(true);
    expect(existsSync(join(root, "skills", "cook", "SKILL.md"))).toBe(true);
    expect(existsSync(join(root, "hooks", "session-init", "hook.cjs"))).toBe(true);
    expect(existsSync(join(root, "workflows", "schema", "workflow.schema.json"))).toBe(true);
    expect(existsSync(join(root, "workflows", "read-only-delivery.json"))).toBe(true);
  });

  it("extracts without the system temp dir, so publishing never crosses a filesystem", () => {
    // On Linux /tmp is routinely a tmpfs while ~/.cache is on the root disk;
    // staging there made the publishing rename fail with EXDEV. Pointing the
    // temp dir at a path that does not exist proves extraction no longer
    // touches it: staging is a sibling of the cache dir.
    const prevTmp = process.env.TMPDIR;
    process.env.TMPDIR = join(cache, "definitely-absent-tmp");
    try {
      const root = materializeEmbeddedKit();
      expect(existsSync(join(root, "skills", "cook", "SKILL.md"))).toBe(true);
    } finally {
      if (prevTmp === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = prevTmp;
    }
    // Staging is removed by the rename; only the stamped cache dir remains.
    expect(readdirSync(cache)).toEqual([`${EMBEDDED_VERSION}-${EMBEDDED_DIGEST}`]);
  });

  it("materializes portable-manifest.json at the flat root", () => {
    const flat = embeddedFlatRoot();
    expect(existsSync(join(flat, "portable-manifest.json"))).toBe(true);
  });

  it("is idempotent (sentinel prevents re-extract) and content is intact", () => {
    const root = materializeEmbeddedKit();
    const cook = readFileSync(join(root, "skills", "cook", "SKILL.md"), "utf8");
    expect(cook).toContain("name: av:cook");
    expect(materializeEmbeddedKit()).toBe(root);
  });

  it("getKitRoot uses the real fs when a kit exists on disk", () => {
    const fsRoot = getKitRoot(process.cwd());
    expect(fsRoot).toBe(resolveKitRoot(process.cwd()));
    expect(existsSync(stamped)).toBe(false);
  });

  it("getKitRoot falls back to embedded when no kit is found on disk", () => {
    const root = getKitRoot(cache);
    expect(root).toBe(join(stamped, "kit"));
    expect(existsSync(join(root, "skills"))).toBe(true);
  });

  it("ARIADNEV_EMBEDDED=1 forces the embedded path even with a kit on disk", () => {
    process.env.ARIADNEV_EMBEDDED = "1";
    expect(getKitRoot(process.cwd())).toBe(join(stamped, "kit"));
  });

  it("keeps the generated version aligned with package metadata", () => {
    const packageJson = JSON.parse(
      readFileSync(join(repoRoot, "packages", "cli", "package.json"), "utf8"),
    ) as { version: string };

    expect(EMBEDDED_VERSION).toBe(packageJson.version);
  });

  it("stamps the cache with the asset digest, so kit edits invalidate it", () => {
    // The version alone cannot express "the kit changed" — during development it
    // stands still for many kit edits.
    expect(cacheRoot()).toContain(EMBEDDED_DIGEST);
    expect(EMBEDDED_DIGEST).toMatch(/^[a-f0-9]{16}$/);
  });

  it("never leaves a half-written cache: the sentinel only appears with the tree", () => {
    const root = materializeEmbeddedKit();
    // The rename is the publish step, so the sentinel cannot predate the files.
    expect(existsSync(join(stamped, ".extracted"))).toBe(true);
    expect(readdirSync(root).length).toBeGreaterThan(0);
  });

  it("re-extracts when an executable in the cache was tampered with", () => {
    const execKey = Object.keys(EMBEDDED_ASSETS).find((k) => EMBEDDED_ASSETS[k].mode === 0o755);
    if (!execKey) {
      // No executable ships today; the guard still must not reject a clean cache.
      const root = materializeEmbeddedKit();
      expect(materializeEmbeddedKit()).toBe(root);
      return;
    }
    materializeEmbeddedKit();
    const tampered = join(stamped, execKey);
    writeFileSync(tampered, "#!/bin/sh\necho pwned\n");
    materializeEmbeddedKit();
    expect(readFileSync(tampered)).toEqual(assetBytes(execKey));
  });

  it("drift guard: the generated map exactly matches the live kit + flat-root assets", () => {
    // Rebuild what the generator would embed, compare byte-for-byte. Fails if a
    // kit file was added/changed without re-running generate-embedded-kit.mjs.
    const expected: Record<string, Buffer> = {};
    walkAssets(join(repoRoot, "kit"), repoRoot, expected);
    for (const f of ["portable-manifest.json", "kit.config.json"]) {
      expected[f] = readFileSync(join(repoRoot, f));
    }
    expect(Object.keys(EMBEDDED_ASSETS).sort()).toEqual(Object.keys(expected).sort());
    for (const k of Object.keys(expected)) {
      expect(assetBytes(k), `stale embed for ${k} — run generate-embedded-kit.mjs`).toEqual(expected[k]);
      // A non-text file must never be stored as a string: round-tripping bytes
      // through utf8 replaces them with U+FFFD. Compression is free to claim
      // any file, so that is the invariant left to assert.
      expect(EMBEDDED_ASSETS[k].text === undefined || isTextFile(k), `wrong encoding branch for ${k}`).toBe(true);
    }
  });

  it("embeds nothing from a directory the installer refuses to copy", () => {
    // `kit/hooks/.logs/hook-log.jsonl` was being embedded: one machine's hook
    // session history, gitignored in the checkout but shipped inside every
    // binary built from it. The drift guard above could not catch it — the
    // embed matched the live kit exactly, which was the problem.
    const shipped = Object.keys(EMBEDDED_ASSETS).filter((key) =>
      key.split("/").some((segment) => IGNORE_DIRS.has(segment)),
    );
    expect(shipped).toEqual([]);
  });

  it("embeds no token-shaped content", () => {
    // Filenames are only half the risk: a token pasted into a skill body would
    // be baked into every shipped binary. Same shapes the output sanitizer
    // redacts, applied to the content instead of to printed text.
    // Tightened against the sanitizer's printing-time patterns, which may
    // over-match freely because redacting output costs nothing. Here a false
    // positive blocks the build, and the kit legitimately *documents* secret
    // shapes: a skill that teaches secret detection names the PEM header, and
    // `task-and-sync-back.md` contains the literal substring `sk-and-sync-back`.
    const TOKEN_SHAPES = [
      /ghp_[A-Za-z0-9]{16,}/,
      /github_pat_[A-Za-z0-9_]{16,}/,
      /gh[ousr]_[A-Za-z0-9]{16,}/,
      /(?<![\w-])sk-[A-Za-z0-9_-]{12,}/,
      /(https?:\/\/)[^/@\s]+:[^/@\s]+@/,
      // The header alone is documentation; a header followed by a base64 body
      // is an actual key.
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]{0,80}?\n[A-Za-z0-9+/=]{40,}/,
    ];
    const offenders: string[] = [];
    for (const key of Object.keys(EMBEDDED_ASSETS)) {
      const text = assetBytes(key).toString("utf8");
      for (const rx of TOKEN_SHAPES) {
        if (rx.test(text)) offenders.push(`${key} matches ${rx}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("embeds no credential material", () => {
    // `.env.example` and friends are templates the kit ships on purpose; a real
    // `.env`, a key, or a certificate baked into a shipped binary is not.
    const secrets = Object.keys(EMBEDDED_ASSETS).filter(
      (k) =>
        /(^|\/)\.env(\..+)?$|\.pem$|\.p12$|\.key$|(^|\/)id_[a-z0-9]+$/.test(k) &&
        !/(^|\/)\.env\.(example|sample|template)$/.test(k),
    );
    expect(secrets).toEqual([]);
  });
});



