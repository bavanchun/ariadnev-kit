// The release chain cuts from a commit on `main`, and every commit on `main`
// is a rebase-merge — a SHA no pull request ever tested. CI's push run on
// `main` is the only verdict that commit gets, and `ci.yml` starts it at the
// same moment `release.yml` starts the candidate build. This script is how the
// chain reads that verdict: it asks GitHub for the named check run on the exact
// SHA, waits while it is still running, and refuses anything but a completed
// `success`. "Skipped" is refused too: a docs-only push skips the gate, and a
// release must never ride on a run that tested nothing.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const FULL_SHA = /^[a-f0-9]{40}$/;
const GITHUB_API_VERSION = "2026-03-10";

function ghCheckRuns(path) {
  const result = spawnSync("gh", ["api", "-H", `X-GitHub-Api-Version: ${GITHUB_API_VERSION}`, path], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`GitHub API request failed: ${String(result.stderr).trim()}`);
  return JSON.parse(result.stdout || "{}");
}

/**
 * Resolve the newest check run named `checkName` on `sha`. GitHub records one
 * run per attempt and evaluates the newest per name, so a re-run after a
 * failure is read the way the branch-protection rule reads it.
 */
function newestRun(payload, checkName, sha) {
  const runs = (payload.check_runs ?? []).filter((run) => run.name === checkName && run.head_sha === sha);
  runs.sort((a, b) => String(b.started_at ?? "").localeCompare(String(a.started_at ?? "")));
  return runs[0] ?? null;
}

export async function requireCiVerdict({
  repo,
  sha,
  checkName,
  fetchCheckRuns = ghCheckRuns,
  waitMs = 0,
  pollMs = 30_000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
}) {
  if (!FULL_SHA.test(sha)) throw new Error("source must be a full 40-hex commit SHA, not a ref");
  const path = `repos/${repo}/commits/${sha}/check-runs?check_name=${encodeURIComponent(checkName)}&per_page=100`;
  const started = now();
  for (;;) {
    const run = newestRun(await fetchCheckRuns(path), checkName, sha);
    if (run && run.status === "completed") {
      if (run.conclusion === "success") return { conclusion: run.conclusion, url: run.html_url ?? null };
      throw new Error(`"${checkName}" on ${sha} concluded "${run.conclusion}" — refusing to cut a release from it (${run.html_url ?? "no run url"})`);
    }
    const elapsed = now() - started;
    if (elapsed + pollMs > waitMs) {
      if (!run) throw new Error(`no "${checkName}" check run exists for ${sha}; CI never reported on this commit`);
      throw new Error(`"${checkName}" on ${sha} is still "${run.status}" after ${Math.round(elapsed / 1000)}s`);
    }
    await sleep(pollMs);
  }
}

function arg(name, fallback) {
  const matches = process.argv.flatMap((value, index) => (value === name ? [index] : []));
  if (matches.length > 1) throw new Error(`duplicate argument: ${name}`);
  if (matches.length === 0) return fallback;
  const value = process.argv[matches[0] + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${name}`);
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const repo = arg("--repo");
    const sha = arg("--sha");
    if (!repo || !sha) throw new Error("--repo and --sha are required");
    const verdict = await requireCiVerdict({
      repo,
      sha,
      checkName: arg("--check", "Lint · Build · Test"),
      waitMs: Number(arg("--wait-seconds", "0")) * 1000,
    });
    process.stdout.write(`${verdict.conclusion}: ${verdict.url ?? ""}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
