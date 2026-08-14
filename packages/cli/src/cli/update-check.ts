// Passive "a newer ariadnev exists" nudge. Cached (1h), best-effort, and printed
// to stderr so it never pollutes a command's stdout (curl|bash consumers). Fully
// decoupled from the active `update` command — this only reads the cache and,
// when stale, refreshes it with a swallow-on-error lookup.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { cacheRoot } from "../kit/embedded-kit.js";
import { fetchLatestVersion, isNewerVersion } from "./update-command.js";

const TTL_MS = 60 * 60 * 1000; // 1h

interface UpdateCache {
  checkedAt: number;
  latest: string;
}

export interface NudgeDeps {
  now(): number;
  currentVersion: string;
  readCache(): UpdateCache | null;
  writeCache(c: UpdateCache): void;
  /** Swallow-on-error lookup of the latest published version. */
  fetchLatest(): Promise<string | null>;
}

/**
 * Returns a one-line hint when a newer version exists, else null. Uses the
 * cached value while fresh; on a stale/absent cache it refreshes once. Any
 * failure (offline, parse) resolves to null — never throws.
 */
export async function maybeNudge(deps: NudgeDeps): Promise<string | null> {
  const cache = deps.readCache();
  let latest = cache && deps.now() - cache.checkedAt < TTL_MS ? cache.latest : null;

  if (latest === null) {
    latest = await deps.fetchLatest();
    if (!latest) return null;
    deps.writeCache({ checkedAt: deps.now(), latest });
  }

  return isNewerVersion(latest, deps.currentVersion)
    ? `ariadnev ${latest} available — run: ariadnev update`
    : null;
}

/** Real deps: cache file under the ariadnev cache root, live version lookup. */
export function realNudgeDeps(currentVersion: string): NudgeDeps {
  const file = join(cacheRoot(), "update-check.json");
  return {
    now: () => Date.now(),
    currentVersion,
    readCache: () => {
      try {
        return JSON.parse(readFileSync(file, "utf8")) as UpdateCache;
      } catch {
        return null;
      }
    },
    writeCache: (c) => {
      try {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify(c));
      } catch {
        /* best-effort */
      }
    },
    fetchLatest: fetchLatestVersion,
  };
}
