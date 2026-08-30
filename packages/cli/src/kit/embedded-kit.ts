import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { resolveKitRoot, KitValidationError } from "./load-kit.js";
import { EMBEDDED_ASSETS, EMBEDDED_DIGEST, EMBEDDED_VERSION, type EmbeddedAsset } from "./kit-embedded.generated.js";

// Kit-root resolution that works both from a real filesystem (dev / tests) and
// from a compiled Bun binary that has no kit/ on disk. In binary mode the kit is
// baked into EMBEDDED_ASSETS and self-extracted to a cache dir on first run — so
// the single binary is fully self-contained.

/**
 * Where the embedded kit self-extracts. Stamped with the asset-map digest, not
 * just the package version: during development the kit changes constantly while
 * the version stands still, and a version-stamped cache would keep serving a
 * stale extraction.
 */
export function cacheRoot(): string {
  const base = process.env.ARIADNEV_CACHE_DIR ?? join(homedir(), ".cache", "ariadnev");
  return join(base, `${EMBEDDED_VERSION}-${EMBEDDED_DIGEST}`);
}

/** Decode one embedded asset back to the exact bytes it was generated from. */
function assetBytes(asset: EmbeddedAsset): Buffer {
  if (asset.gz !== undefined) return gunzipSync(Buffer.from(asset.gz, "base64"));
  return asset.b64 !== undefined ? Buffer.from(asset.b64, "base64") : Buffer.from(asset.text ?? "", "utf8");
}

function extractInto(root: string): void {
  for (const [rel, asset] of Object.entries(EMBEDDED_ASSETS)) {
    const dest = join(root, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, assetBytes(asset), asset.mode !== undefined ? { mode: asset.mode } : undefined);
  }
  writeFileSync(join(root, ".extracted"), EMBEDDED_DIGEST);
}

/**
 * Re-check the executables in an already-extracted cache against the embedded
 * bytes. Only executables are checked: they are the files whose tampering
 * actually runs code, and hashing all of them on every startup would tax every
 * command for a risk that does not scale with kit size.
 */
function executablesIntact(root: string): boolean {
  for (const [rel, asset] of Object.entries(EMBEDDED_ASSETS)) {
    if (asset.mode !== 0o755) continue;
    const path = join(root, rel);
    if (!existsSync(path)) return false;
    const want = createHash("sha256").update(assetBytes(asset)).digest("hex");
    const got = createHash("sha256").update(readFileSync(path)).digest("hex");
    if (want !== got) return false;
  }
  return true;
}

/**
 * Whether an existing cache can be trusted without re-extracting.
 *
 * The sentinel is written inside the staging dir before the rename, so a
 * published cache is complete by construction — the sentinel alone would be
 * enough if nothing ever touched the directory afterwards. It does get touched:
 * partial `~/.cache` cleanups are ordinary. So the kit root must still be there,
 * and the executables must still hash correctly.
 *
 * This deliberately stops short of hashing every file on every startup. A
 * deletion deeper inside the tree surfaces as a loud kit-validation error from
 * the caller, not as silently wrong behavior.
 */
function cacheUsable(root: string, sentinel: string): boolean {
  if (!existsSync(sentinel)) return false;
  if (readFileSync(sentinel, "utf8").trim() !== EMBEDDED_DIGEST) return false;
  if (!existsSync(join(root, "kit"))) return false;
  return executablesIntact(root);
}

/**
 * Where extraction is staged before it is published with a single rename.
 *
 * Staging lives beside the cache dir, never in the system temp dir: `rename(2)`
 * cannot cross filesystems, and on Linux `/tmp` is routinely a tmpfs while
 * `~/.cache` is on the root disk — staging there fails the publish with EXDEV.
 * A sibling of the destination is on the destination's filesystem by
 * construction. The leading dot keeps it out of the way of cache listings; it
 * exists only between extraction and the rename.
 */
function stagingParent(root: string): string {
  return dirname(root);
}

/**
 * Materialize the embedded kit to the cache dir if not already present, and
 * return the kit root (the dir containing `skills/`).
 *
 * Extraction goes to a private staging dir and is moved into place with a single
 * rename, so a concurrent process either sees no cache or sees a complete one —
 * never a half-written tree. Two processes racing both extract; the loser
 * discards its copy.
 */
export function materializeEmbeddedKit(): string {
  const root = cacheRoot();
  const sentinel = join(root, ".extracted");
  if (cacheUsable(root, sentinel)) return join(root, "kit");

  // A cache that exists but fails verification is replaced rather than trusted.
  if (existsSync(root)) rmSync(root, { recursive: true, force: true });

  const parent = stagingParent(root);
  mkdirSync(parent, { recursive: true });
  const staging = mkdtempSync(join(parent, ".ariadnev-kit-"));
  try {
    extractInto(staging);
    renameSync(staging, root);
  } catch (err) {
    rmSync(staging, { recursive: true, force: true });
    // Another process may have won the rename in the meantime; its tree is
    // byte-identical to ours, so adopting it is correct.
    if (!existsSync(sentinel)) throw err;
  }
  return join(root, "kit");
}

/** The flat-root path holding portable-manifest.json (sibling of kit/). */
export function embeddedFlatRoot(): string {
  materializeEmbeddedKit();
  return cacheRoot();
}

/**
 * Resolve the kit root. Tries the real filesystem first (dev, npm-style layout);
 * falls back to the self-extracted embedded kit when no kit/ exists on disk (the
 * compiled-binary case). `ARIADNEV_EMBEDDED=1` forces the embedded path (tests).
 */
export function getKitRoot(startDir: string): string {
  if (process.env.ARIADNEV_EMBEDDED === "1") return materializeEmbeddedKit();
  try {
    return resolveKitRoot(startDir);
  } catch (err) {
    if (err instanceof KitValidationError) return materializeEmbeddedKit();
    throw err;
  }
}
