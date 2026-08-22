import { existsSync, readFileSync, writeFileSync, chmodSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { receiptVersion, type Receipt } from "../install/install-receipt.js";
import { isValidVersion, isPrerelease, versionQuery } from "./update-version.js";
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
  // Rebuilt from the parsed URL, not returned as given. The raw string carried
  // whatever was in it into every asset URL: `https://user:pw@host` put
  // credentials on each request, a trailing `?x=` swallowed the path into a
  // query, and a `#` made it a fragment that was never sent at all. None of
  // those are a base URL, so none of them are accepted as one.
  if (parsed.username || parsed.password || parsed.search || parsed.hash) return DOMAIN;
  return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
}

/** Numeric major.minor.patch compare — "0.10.0" > "0.9.0", unlike string compare. */
export function isNewerVersion(candidate: string, base: string): boolean {
  /** `[major, minor, patch, betaNumber]`; `Infinity` for a stable release. */
  const parse = (v: string): [number, number, number, number] => {
    const beta = /-beta\.(\d+)$/.exec(v);
    const [a, b, c] = v.replace(/-beta\.\d+$/, "").split(".").map((n) => parseInt(n, 10) || 0);
    // A stable release outranks every prerelease of the same version, so it sorts
    // above all of them. Without this a 2.0.0-beta.1 user was never offered
    // 2.0.0: the old parser read "0-beta" as 0, made the two versions equal, and
    // reported "up to date" forever.
    return [a ?? 0, b ?? 0, c ?? 0, beta ? Number(beta[1]) : Number.POSITIVE_INFINITY];
  };
  const left = parse(candidate);
  const right = parse(base);
  for (let i = 0; i < 4; i++) {
    if (left[i] !== right[i]) return left[i] > right[i];
  }
  return false;
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

/**
 * `fetch`, refusing to leave https at any hop.
 *
 * Checking the scheme of the URL we construct is not enough: `fetch` follows
 * redirects across protocols, so an origin can 302 to plain http and the request
 * completes over the wire in clear. That is available to a hostile
 * `ARIADNEV_BASE_URL` and, more to the point, to a compromised or misconfigured
 * `ariadnev.com` — which would downgrade every client, not just an opted-in one.
 *
 * The signature makes tampering detectable either way. Confidentiality is the
 * thing at stake: what a machine is installing, and when, is not a network
 * observer's business.
 */
async function httpsOnlyFetch(url: string, timeoutMs: number): Promise<Response | null> {
  if (!url.startsWith("https://")) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "ariadnev" },
      redirect: "follow",
    });
    // `res.url` is the URL the response actually came from, after every
    // redirect. An empty string means no redirect was followed.
    if (res.url && !res.url.startsWith("https://")) return null;
    return res.ok ? res : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function downloadBytes(url: string): Promise<Uint8Array | null> {
  const res = await httpsOnlyFetch(url, 60000);
  if (!res) return null;
  try {
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function downloadTextAsset(url: string): Promise<string | null> {
  const res = await httpsOnlyFetch(url, 15000);
  if (!res) return null;
  try {
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
  const res = await httpsOnlyFetch(url, 3000);
  if (!res) return null;
  try {
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

  // `opts.to` is shape-checked above; `target` came off the unsigned `/version`
  // endpoint and was not. Two things depend on it being an exact `x.y.z`.
  //
  // It goes into the signed message as `${target}\n${checksums}`, which is not
  // prefix-free: a target containing a newline moves the boundary, so one
  // signature authenticates several different (version, checksums) readings.
  // Only truncation is reachable that way — no sha can be forged — but a
  // per-platform denial of updates is still an outcome an origin should not get
  // to choose.
  //
  // And it is printed. `sanitize()` redacts credentials, not control characters,
  // so a target carrying `\u001b[2K\r` can erase the line reporting it and
  // write a reassuring one in its place.
  if (!isValidVersion(target)) {
    lines.push("  the update server returned a version that is not an exact x.y.z — nothing changed");
    return done(1);
  }

  // Defence in depth for the beta channel. Nothing routes betas: a prerelease is
  // reachable only by naming its exact version, and the bare path stays on
  // stable because `/version` answers from the latest release and a prerelease
  // is never marked latest. That is two facts in two repositories, one of which
  // is a GitHub flag — so this refuses rather than relying on both holding.
  if (opts.to === null && isPrerelease(target)) {
    lines.push(`  ${target} is a prerelease and is not offered without --to — nothing changed`);
    return done();
  }

  // The latest path skips a no-op update; a pinned target always proceeds —
  // that's exactly how a downgrade is requested.
  if (opts.to === null && !isNewerVersion(target, opts.currentVersion)) {
    lines.push("  up to date");
    return done();
  }

  // A pinned request that resolves to something else is the origin choosing the
  // release, not the caller. Both are genuinely signed, so verification cannot
  // catch it — only this can.
  if (opts.to !== null && target !== opts.to) {
    lines.push(`  the update server resolved ${opts.to} to ${target} — nothing changed`);
    return done(1);
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
