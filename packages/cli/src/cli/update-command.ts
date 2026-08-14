import { existsSync, readFileSync, writeFileSync, chmodSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { receiptVersion, type Receipt } from "../install/install-receipt.js";

// Everything goes through the public edge (a Cloudflare Worker on this domain)
// that proxies the private GitHub repo's releases — the CLI never talks to
// GitHub directly, so the repo can stay fully private.
const DOMAIN = "https://ariadnev.com";

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
  platform: NodeJS.Platform;
  arch: string;
}

export interface UpdateDeps {
  /** Resolves the latest published version, or null on any failure/timeout. */
  fetchLatestVersion(): Promise<string | null>;
  /** Download a release asset as bytes, or null on any failure. */
  downloadBinary(url: string): Promise<Uint8Array | null>;
  /** Download a text asset (checksums.txt), or null on any failure. */
  downloadText(url: string): Promise<string | null>;
  /** Atomically replace the binary at `targetPath` with `bytes` (+ make executable). */
  replaceBinary(targetPath: string, bytes: Uint8Array): void;
}

export interface UpdateHandlerResult {
  exitCode: 0;
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
    downloadBinary: downloadBytes,
    downloadText: downloadTextAsset,
    replaceBinary: atomicReplaceBinary,
  };
}

/** Ask the edge for the latest version. Short timeout; never throws. */
export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${DOMAIN}/version`, {
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
  const done = (): UpdateHandlerResult => ({ exitCode: 0, summary: lines.join("\n") });

  const latest = await deps.fetchLatestVersion();
  if (latest === null) {
    lines.push("  could not check the latest version (offline or GitHub unreachable)");
    return done();
  }
  if (!isNewerVersion(latest, opts.currentVersion)) {
    lines.push("  up to date");
    return done();
  }

  lines.push(`  update available: ${opts.currentVersion} -> ${latest}`);

  // Report-only: --check, or not running as the compiled binary (can't replace node).
  if (opts.checkOnly || !opts.isBinary) {
    lines.push(opts.isBinary ? "  run: ariadnev update  (to install it)" : CURL_HINT);
    return done();
  }

  const asset = assetNameFor(opts.platform, opts.arch);
  if (!asset) {
    lines.push(`  unsupported platform (${opts.platform}/${opts.arch}) — ${CURL_HINT.trim()}`);
    return done();
  }

  const [bytes, checksums] = await Promise.all([
    deps.downloadBinary(`${DOMAIN}/download/${asset}`),
    deps.downloadText(`${DOMAIN}/download/checksums.txt`),
  ]);
  if (!bytes || !checksums) {
    lines.push(`  could not download the update — ${CURL_HINT.trim()}`);
    return done();
  }

  const want = expectedSha(checksums, asset);
  if (!want || sha256hex(bytes) !== want) {
    lines.push("  aborted: checksum mismatch — the binary was NOT replaced");
    return done();
  }

  try {
    deps.replaceBinary(opts.execPath, bytes);
    lines.push(`  updated ${opts.currentVersion} -> ${latest} (${opts.execPath})`);
  } catch (err) {
    lines.push(`  update failed to write: ${String(err instanceof Error ? err.message : err)}`);
    lines.push(CURL_HINT);
  }
  return done();
}
