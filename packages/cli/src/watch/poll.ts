// Reading issues, through `gh`, read-only.
//
// The runner itself lives in `github/gh.ts` — `feedback` and `changelog` reach
// GitHub the same way, and the interesting part (what happens when `gh` is
// missing) should have one answer.
//
// EVERY CALL HERE IS A READ. Posting lives in `postComment` below and is the one
// exception, reached only after the allowlist, the rate limit and the dry-run
// gate have all been passed — see `watch-command.ts`.

import { UnavailableError } from "../cli/exit-codes.js";
import { realGh as sharedGh, type GhRunner } from "../github/gh.js";
import type { IssueRef } from "./respond.js";
import { repoSlug, type RepoRef } from "./state.js";

export type { GhRunner } from "../github/gh.js";

export function realGh(): GhRunner {
  return sharedGh("av watch");
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
