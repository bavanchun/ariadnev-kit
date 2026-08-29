// Reading issues, through `gh`, read-only.
//
// WHY `gh` AND NOT AN HTTP CLIENT. Authentication is the whole reason. `gh`
// already holds the maintainer's credentials, refreshes them, and honours
// `GH_TOKEN`/enterprise hosts; reimplementing that here would mean ariadnev
// handling a GitHub token, which is a credential it has no other reason to
// touch. The cost is a dependency on a binary being installed, which is
// reported rather than assumed.
//
// EVERY CALL HERE IS A READ. Posting lives in `postComment` below and is the one
// exception, reached only after the allowlist, the rate limit and the dry-run
// gate have all been passed — see `watch-command.ts`.

import { spawnSync } from "node:child_process";
import { UnavailableError } from "../cli/exit-codes.js";
import type { IssueRef } from "./respond.js";
import { repoSlug, type RepoRef } from "./state.js";

export interface GhRunner {
  (args: readonly string[]): { status: number | null; stdout: string; stderr: string };
}

export function realGh(): GhRunner {
  return (args) => {
    const result = spawnSync("gh", [...args], { encoding: "utf8", timeout: 30_000 });
    if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new UnavailableError(
        "`gh` is not on PATH. `av watch` reads and writes GitHub through the GitHub CLI so that " +
          "ariadnev never handles a token of its own; install it from https://cli.github.com and run `gh auth login`.",
      );
    }
    return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  };
}

interface RawIssue {
  number?: unknown;
  title?: unknown;
  body?: unknown;
  url?: unknown;
  author?: { login?: unknown };
}

/**
 * Open issues, newest first, optionally filtered by label.
 *
 * Every field is coerced rather than trusted. This is the boundary where
 * stranger-written JSON enters the process, and a missing `body` becoming
 * `undefined` inside a prompt template is the kind of thing that shows up as a
 * literal "undefined" in a public comment.
 */
export function listIssues(
  gh: GhRunner,
  ref: RepoRef,
  opts: { label?: string; limit?: number } = {},
): IssueRef[] {
  const args = [
    "issue", "list",
    "--repo", repoSlug(ref),
    "--state", "open",
    "--limit", String(opts.limit ?? 30),
    "--json", "number,title,body,url,author",
  ];
  if (opts.label) args.push("--label", opts.label);

  const result = gh(args);
  if (result.status !== 0) {
    throw new UnavailableError(`gh issue list failed for ${repoSlug(ref)}: ${result.stderr.trim() || `exit ${result.status}`}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new UnavailableError(`gh returned output that is not JSON for ${repoSlug(ref)}`);
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((raw: RawIssue): IssueRef | null => {
      if (typeof raw?.number !== "number") return null;
      return {
        number: raw.number,
        title: typeof raw.title === "string" ? raw.title : "",
        body: typeof raw.body === "string" ? raw.body : "",
        url: typeof raw.url === "string" ? raw.url : "",
        author: typeof raw.author?.login === "string" ? raw.author.login : "unknown",
      };
    })
    .filter((issue): issue is IssueRef => issue !== null)
    .sort((a, b) => b.number - a.number);
}

/** The one write. Reached only past the allowlist, the rate limit and `--yes`. */
export function postComment(gh: GhRunner, ref: RepoRef, issue: number, body: string): void {
  const result = gh(["issue", "comment", String(issue), "--repo", repoSlug(ref), "--body", body]);
  if (result.status !== 0) {
    throw new UnavailableError(
      `gh issue comment failed for ${repoSlug(ref)}#${issue}: ${result.stderr.trim() || `exit ${result.status}`}`,
    );
  }
}
