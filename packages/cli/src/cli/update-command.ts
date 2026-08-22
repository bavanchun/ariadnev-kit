import { existsSync, readFileSync, writeFileSync, chmodSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { receiptVersion, type Receipt } from "../install/install-receipt.js";
import { isValidVersion, versionQuery } from "./update-version.js";
import { verifyChecksums } from "./update-signature.js";

// Everything goes through the public edge (a Cloudflare Worker on this domain)
// that proxies the private GitHub repo's releases — the CLI never talks to
// GitHub directly, so the repo can stay fully private.
const DOMAIN = "https://ariadnev.com";

/**
 * Where `av update` fetches from. `ARIADNEV_BASE_URL` may redirect it.
 *
 * This override was the plan's original RCE: with the binary, `checksums.txt`
 * and `/version` all coming from one origin, pointing that origin somewhere else
 * made the "fail-closed" checksum compare an attacker's binary against the
 * attacker's own checksums. It is safe now, and only now, because the signature
 * is verified against a key compiled into this binary — an origin that cannot
 * produce the maintainer's signature cannot install anything, whatever it
 * serves. The key itself is deliberately not overridable.
 *
 * `scopeProcessEnv()` has already run by the time any command action reads this,
 * so a repository's own dotenv cannot set it for a run inside that repository.
 *
 * Non-https is refused. The signature makes tampering detectable, not private,
 * and there is no reason to hand a network observer the list of what a machine
 * is installing.
 */
export function updateBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.ARIADNEV_BASE_URL?.trim();
  if (!override) return DOMAIN;
  let parsed: URL;
  try {
    parsed = new URL(override);
  } catch {
    return DOMAIN;
  }
  if (parsed.protocol !== "https:") return DOMAIN;
  return override.replace(/\/+$/, "");
}

/** Numeric major.minor.patch compare — "0.10.0" > "0.9.0", unlike string compare. */
export function isNewerVersion(candidate: string, base: string): boolean {
  const parse = (v: string): [number, number, number] => {
    const [a, b, c] = v.split(".").map((n) => parseInt(n, 10) || 0);
    return [a ?? 0, b ?? 0, c ?? 0];
  };
  const [ca, cb, cc] = parse(candidate);
  const [ba, bb, bc] = parse(base);
  if (ca !== ba) return ca > ba;
  if (cb !== bb) return cb > bb;
  return cc > bc;
}

/** A release tag ("ariadnev@0.5.0") → its version ("0.5.0"). Tolerates a bare "v". */
export function parseLatestTag(tag: string): string {
  return tag.replace(/^ariadnev@/, "").replace(/^v/, "");
}

/** The release asset name for a platform/arch, or null if unsupported. */
export function assetNameFor(platform: NodeJS.Platform, arch: string): string | null {
  const os = platform === "darwin" ? "darwin" : platform === "linux" ? "linux" : platform === "win32" ? "windows" : null;
  const a = arch === "arm64" ? "arm64" : arch === "x64" ? "x64" : null;
  if (!os || !a) return null;
  if (os === "windows" && a !== "x64") return null; // only windows-x64 is built
  return `ariadnev-${os}-${a}${os === "windows" ? ".exe" : ""}`;
}

/** Extract the expected sha256 for `asset` from a `checksums.txt` body. */
export function expectedSha(checksums: string, asset: string): string | null {
  for (const line of checksums.split("\n")) {
    const [sha, name] = line.trim().split(/\s+/);
    if (name === asset && sha) return sha.toLowerCase();
  }
  return null;
}

export function sha256hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export interface UpdateHandlerOpts {
  home: string;
  cwd: string;
  scope: "project" | "global";
  currentVersion: string;
  /** Path of the running executable (process.execPath). */
  execPath: string;
  /** True when running as the compiled binary (not `node dist/index.js`). */
  isBinary: boolean;
  /** --check: only report, never self-update. */
  checkOnly: boolean;
  /** --to <version>: install this exact release instead of latest. Pre-validated
   *  shape is NOT assumed here — runUpdate rejects a malformed value itself. */
  to: string | null;
  platform: NodeJS.Platform;
  arch: string;
}

export interface UpdateDeps {
  /** Resolves the latest published version, or null on any failure/timeout. */
  fetchLatestVersion(): Promise<string | null>;
  /** Resolves an exact pinned version via the edge's `?version=` selector, or
   *  null when it's unknown (404) or the request fails/times out. */
  fetchPinnedVersion(version: string): Promise<string | null>;
  /** Download a release asset as bytes, or null on any failure. */
  downloadBinary(url: string): Promise<Uint8Array | null>;
  /** Download a text asset (checksums.txt), or null on any failure. */
  downloadText(url: string): Promise<string | null>;
  /** Atomically replace the binary at `targetPath` with `bytes` (+ make executable). */
  replaceBinary(targetPath: string, bytes: Uint8Array): void;
  /**
   * True when `signature` is the release key's signature over this exact tag and
   * these exact checksum bytes.
   *
   * Injected for the same reason the downloads are: a test cannot produce a
   * signature by the real release key, and the alternative — letting the caller
   * supply a public key — would make the trust root overridable at runtime,
   * which is the hole this whole mechanism closes. `realUpdateDeps` binds it to
   * the compiled-in key, and `update-signature.test.ts` tests that against the
   * real constant.
   */
  verifyRelease(tag: string, checksums: string, signature: string): boolean;
}

export interface UpdateHandlerResult {
  exitCode: 0 | 1;
  summary: string;
}

const CURL_HINT = "  run: curl -fsSL https://ariadnev.com/install | bash";

function readReceiptVersion(root: string): string | null {
  const path = join(root, ".ariadnev", "receipt.json");
  if (!existsSync(path)) return null;
  try {
    return receiptVersion(JSON.parse(readFileSync(path, "utf8")) as Receipt);
  } catch {
    return null;
  }
}

async function downloadBytes(url: string): Promise<Uint8Array | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "ariadnev" } });
    clearTimeout(timer);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function downloadTextAsset(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "ariadnev" } });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Write the new binary to a temp sibling, then rename over the target (atomic on
 *  the same filesystem). On Windows the running .exe can't be overwritten, so it
 *  is moved aside first. */
function atomicReplaceBinary(target: string, bytes: Uint8Array): void {
  const tmp = join(dirname(target), `.ariadnev-update-${process.pid}`);
  writeFileSync(tmp, bytes);
  chmodSync(tmp, 0o755);
  if (process.platform === "win32") {
    try {
      renameSync(target, `${target}.old`);
    } catch {
      /* first install / no existing file */
    }
  }
  renameSync(tmp, target);
}

/** Production deps: real edge fetch + on-disk atomic replace. */
export function realUpdateDeps(): UpdateDeps {
  return {
    fetchLatestVersion,
    fetchPinnedVersion,
    downloadBinary: downloadBytes,
    downloadText: downloadTextAsset,
    replaceBinary: atomicReplaceBinary,
    verifyRelease: (tag, checksums, signature) => verifyChecksums({ tag, checksums, signature }),
  };
}

/** Shared `/version` fetch — short timeout, never throws. `url` carries the
 *  edge's `?version=` selector for the pinned path, or is bare for latest. */
async function fetchVersionTag(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "ariadnev" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return text ? parseLatestTag(text) : null;
  } catch {
    return null;
  }
}

/** Ask the edge for the latest version. Short timeout; never throws. */
export async function fetchLatestVersion(): Promise<string | null> {
  return fetchVersionTag(`${updateBaseUrl()}/version`);
}

/** Ask the edge to confirm an exact pinned version exists. Null on 404/failure/timeout. */
export async function fetchPinnedVersion(version: string): Promise<string | null> {
  return fetchVersionTag(`${updateBaseUrl()}/version${versionQuery(version)}`);
}

/**
 * Check for — and, when running as the binary, apply — a newer ariadnev release.
 * Offline-safe: any network failure is reported, never thrown, exit 0. Never
 * replaces the binary on a checksum mismatch (fail-closed).
 */
export async function runUpdate(opts: UpdateHandlerOpts, deps: UpdateDeps): Promise<UpdateHandlerResult> {
  const root = opts.scope === "global" ? opts.home : opts.cwd;
  const recordedVersion = readReceiptVersion(root);
  const lines = [`ariadnev update — running ${opts.currentVersion}`];
  if (recordedVersion && recordedVersion !== opts.currentVersion) {
    lines.push(`  receipt was written by ${recordedVersion} — run \`ariadnev install\` to re-sync the kit`);
  }
  const done = (exitCode: 0 | 1 = 0): UpdateHandlerResult => ({ exitCode, summary: lines.join("\n") });

  // Strict version shape check happens before any network call — a bad value
  // is rejected here rather than producing an opaque edge 400.
  if (opts.to !== null && !isValidVersion(opts.to)) {
    lines.push(`  invalid version "${opts.to}" — expected an exact x.y.z (e.g. 1.2.3)`);
    return done(1);
  }

  const target = opts.to !== null ? await deps.fetchPinnedVersion(opts.to) : await deps.fetchLatestVersion();
  if (target === null) {
    lines.push(
      opts.to !== null
        ? `  version ${opts.to} was not found — nothing changed`
        : "  could not check the latest version (offline or GitHub unreachable)",
    );
    return done(opts.to !== null ? 1 : 0);
  }

  // The latest path skips a no-op update; a pinned target always proceeds —
  // that's exactly how a downgrade is requested.
  if (opts.to === null && !isNewerVersion(target, opts.currentVersion)) {
    lines.push("  up to date");
    return done();
  }

  lines.push(`  ${opts.to !== null ? "pinned target" : "update available"}: ${opts.currentVersion} -> ${target}`);

  // Report-only: --check, or not running as the compiled binary (can't replace node).
  if (opts.checkOnly || !opts.isBinary) {
    lines.push(
      opts.isBinary ? `  run: ariadnev update${opts.to !== null ? ` --to ${target}` : ""}  (to install it)` : CURL_HINT,
    );
    return done();
  }

  const asset = assetNameFor(opts.platform, opts.arch);
  if (!asset) {
    lines.push(`  unsupported platform (${opts.platform}/${opts.arch}) — ${CURL_HINT.trim()}`);
    return done();
  }

  const q = versionQuery(opts.to);
  const base = updateBaseUrl();
  const [bytes, checksums, signature] = await Promise.all([
    deps.downloadBinary(`${base}/download/${asset}${q}`),
    deps.downloadText(`${base}/download/checksums.txt${q}`),
    deps.downloadText(`${base}/download/checksums.txt.sig${q}`),
  ]);
  if (!bytes || !checksums) {
    lines.push(`  could not download the update — ${CURL_HINT.trim()}`);
    return done();
  }

  // Releases published before signing existed have no `.sig` and never can:
  // GitHub releases are immutable once published, so one cannot be added after
  // the fact. That makes this a permanent horizon rather than a transient gap,
  // and the only way back past it is a reinstall — which is exactly why the
  // installers deliberately do not check this signature.
  if (signature === null) {
    lines.push(`  ${target} predates release signing and cannot be verified — the binary was NOT replaced`);
    lines.push(CURL_HINT);
    return done(1);
  }

  // Before the hash, not after. The checksum and the binary come from the same
  // origin, so the hash only means something once the signature has established
  // that these are the checksums the maintainer published.
  if (!deps.verifyRelease(target, checksums, signature.trim())) {
    lines.push("  aborted: the release signature did not verify — the binary was NOT replaced");
    return done(1);
  }

  const want = expectedSha(checksums, asset);
  if (!want || sha256hex(bytes) !== want) {
    lines.push("  aborted: checksum mismatch — the binary was NOT replaced");
    return done(1);
  }

  try {
    deps.replaceBinary(opts.execPath, bytes);
    lines.push(`  updated ${opts.currentVersion} -> ${target} (${opts.execPath})`);
  } catch (err) {
    lines.push(`  update failed to write: ${String(err instanceof Error ? err.message : err)}`);
    lines.push(CURL_HINT);
  }
  return done();
}
