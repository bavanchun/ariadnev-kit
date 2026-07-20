import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { resolveKitRoot, KitValidationError } from "./load-kit.js";
import { EMBEDDED_ASSETS, EMBEDDED_VERSION } from "./kit-embedded.generated.js";

// Kit-root resolution that works both from a real filesystem (dev / tests) and
// from a compiled Bun binary that has no kit/ on disk. In binary mode the kit is
// baked into EMBEDDED_ASSETS and self-extracted to a version-stamped cache dir on
// first run — so the single binary is fully self-contained.

/** Where the embedded kit self-extracts. Version-stamped so upgrades re-extract. */
export function cacheRoot(): string {
  const base = process.env.VCSKILL_CACHE_DIR ?? join(homedir(), ".cache", "vcskill");
  return join(base, EMBEDDED_VERSION);
}

/**
 * Materialize the embedded kit to the cache dir if not already present, and
 * return the kit root (the dir containing `skills/`). Idempotent via a sentinel.
 */
export function materializeEmbeddedKit(): string {
  const root = cacheRoot();
  const sentinel = join(root, ".extracted");
  if (!existsSync(sentinel)) {
    for (const [rel, content] of Object.entries(EMBEDDED_ASSETS)) {
      const dest = join(root, rel);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, content);
    }
    writeFileSync(sentinel, EMBEDDED_VERSION);
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
 * compiled-binary case). `VCSKILL_EMBEDDED=1` forces the embedded path (tests).
 */
export function getKitRoot(startDir: string): string {
  if (process.env.VCSKILL_EMBEDDED === "1") return materializeEmbeddedKit();
  try {
    return resolveKitRoot(startDir);
  } catch (err) {
    if (err instanceof KitValidationError) return materializeEmbeddedKit();
    throw err;
  }
}
