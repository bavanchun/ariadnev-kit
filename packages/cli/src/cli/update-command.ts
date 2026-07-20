import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Receipt } from "../install/install-receipt.js";

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

export interface UpdateHandlerOpts {
  home: string;
  cwd: string;
  scope: "project" | "global";
  currentVersion: string;
}

export interface UpdateDeps {
  /** Resolves the latest published version, or null on any failure/timeout. */
  fetchLatestVersion(): Promise<string | null>;
}

export interface UpdateHandlerResult {
  exitCode: 0;
  summary: string;
}

/** A release tag ("vcskill@0.5.0") → its version ("0.5.0"). Tolerates a bare "v". */
export function parseLatestTag(tag: string): string {
  return tag.replace(/^vcskill@/, "").replace(/^v/, "");
}

/** Real fetch against GitHub Releases with a short timeout — never throws. */
export async function fetchLatestVersionFromGitHub(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch("https://api.github.com/repos/bavanchun/vcskill/releases/latest", {
      signal: controller.signal,
      headers: { Accept: "application/vnd.github+json", "User-Agent": "vcskill" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { tag_name?: string };
    return data.tag_name ? parseLatestTag(data.tag_name) : null;
  } catch {
    return null;
  }
}

function readReceiptVersion(root: string): string | null {
  const path = join(root, ".vcskill", "receipt.json");
  if (!existsSync(path)) return null;
  try {
    return (JSON.parse(readFileSync(path, "utf8")) as Receipt).vcskillVersion;
  } catch {
    return null;
  }
}

/**
 * Check for a newer vcskill release. Offline-safe by construction: any
 * fetch failure is reported, never thrown, and always exits 0 — a version
 * check must never fail the command that ran it.
 */
export async function runUpdate(opts: UpdateHandlerOpts, deps: UpdateDeps): Promise<UpdateHandlerResult> {
  const root = opts.scope === "global" ? opts.home : opts.cwd;
  const receiptVersion = readReceiptVersion(root);
  const lines = [`vcskill update — running ${opts.currentVersion}`];
  if (receiptVersion && receiptVersion !== opts.currentVersion) {
    lines.push(`  receipt was written by ${receiptVersion} — run \`vcskill install\` to re-sync the kit`);
  }

  const latest = await deps.fetchLatestVersion();
  if (latest === null) {
    lines.push("  could not check the latest version (offline or GitHub unreachable)");
    return { exitCode: 0, summary: lines.join("\n") };
  }

  if (isNewerVersion(latest, opts.currentVersion)) {
    lines.push(`  update available: ${opts.currentVersion} -> ${latest}`);
    lines.push("  run: curl -fsSL https://raw.githubusercontent.com/bavanchun/vcskill/main/install.sh | bash");
  } else {
    lines.push("  up to date");
  }

  return { exitCode: 0, summary: lines.join("\n") };
}
