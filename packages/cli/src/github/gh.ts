// The one way this CLI talks to GitHub.
//
// WHY `gh` AND NOT AN HTTP CLIENT. Authentication is the whole reason. `gh`
// already holds the maintainer's credentials, refreshes them, and honours
// `GH_TOKEN` and enterprise hosts; reimplementing that would mean ariadnev
// storing and forwarding a GitHub token, a credential it has no other reason to
// touch. The cost is a dependency on a binary being installed, and that is
// reported rather than assumed.
//
// Extracted from `watch/poll.ts` when `feedback` and `changelog` needed the same
// thing. Two copies would drift on the part that matters least to write and most
// to get right: what happens when `gh` is missing or unauthenticated.

import { spawnSync } from "node:child_process";
import { UnavailableError } from "../cli/exit-codes.js";

export interface GhResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface GhRunner {
  (args: readonly string[]): GhResult;
}

/**
 * A runner that shells out to `gh`.
 *
 * `purpose` appears in the not-installed message, so the reader is told why
 * *this* command wanted GitHub rather than being handed a generic complaint.
 */
export function realGh(purpose: string): GhRunner {
  return (args) => {
    const result = spawnSync("gh", [...args], { encoding: "utf8", timeout: 30_000 });
    if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new UnavailableError(
        `\`gh\` is not on PATH, and ${purpose} needs it. ariadnev goes through the GitHub CLI so it never ` +
          `handles a token of its own; install it from https://cli.github.com and run \`gh auth login\`.`,
      );
    }
    return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  };
}

/** Run `gh` and parse JSON, turning every failure into one clear message. */
export function ghJson<T>(gh: GhRunner, args: readonly string[], what: string): T {
  const result = gh(args);
  if (result.status !== 0) {
    throw new UnavailableError(`gh ${args.slice(0, 2).join(" ")} failed while ${what}: ${result.stderr.trim() || `exit ${result.status}`}`);
  }
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    throw new UnavailableError(`gh returned output that is not JSON while ${what}`);
  }
}
