#!/usr/bin/env node
// Refuse to cut a release when changesets pre mode is active and nothing says
// it should be.
//
// `changeset pre enter beta` writes `.changeset/pre.json` and every subsequent
// Version PR produces `-beta.N` until `changeset pre exit` is run. There is no
// prompt and no expiry. The failure it produces is quiet and late: a release
// that looks routine ships with a prerelease version, and on this project a
// prerelease is deliberately never marked latest — so the "release" reaches
// nobody and looks like a broken pipeline rather than a forgotten mode.
//
// Opting in is a repository variable, not a flag on the run, so it survives a
// re-run and has to be turned off deliberately:
//
//   gh variable set ARIADNEV_RELEASE_CHANNEL --body beta     # entering
//   gh variable delete ARIADNEV_RELEASE_CHANNEL              # leaving
//
// Usage: node packages/cli/scripts/check-changeset-pre-mode.mjs

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const prePath = join(process.cwd(), ".changeset", "pre.json");
const channel = (process.env.ARIADNEV_RELEASE_CHANNEL ?? "").trim();
const preActive = existsSync(prePath);

let mode = null;
if (preActive) {
  try {
    mode = JSON.parse(readFileSync(prePath, "utf8")).mode ?? null;
  } catch (err) {
    console.error(`.changeset/pre.json exists but does not parse: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

// `pre exit` leaves the file behind with mode "exit". That is not pre mode.
const inPre = preActive && mode !== "exit";

if (inPre && channel !== "beta") {
  console.error("changesets pre mode is active but ARIADNEV_RELEASE_CHANNEL is not \"beta\".");
  console.error("");
  console.error("  This release would be cut as a prerelease, and a prerelease is never");
  console.error("  marked latest — so it would reach nobody and look like a broken build.");
  console.error("");
  console.error("  Deliberately releasing a beta:  gh variable set ARIADNEV_RELEASE_CHANNEL --body beta");
  console.error("  Meant to release stable:        pnpm exec changeset pre exit && commit the result");
  process.exit(1);
}

if (!inPre && channel === "beta") {
  console.error("ARIADNEV_RELEASE_CHANNEL is \"beta\" but changesets pre mode is not active.");
  console.error("");
  console.error("  This release would be cut as stable while the channel says beta.");
  console.error("");
  console.error("  Releasing a beta:      pnpm exec changeset pre enter beta && commit the result");
  console.error("  Back to stable:        gh variable delete ARIADNEV_RELEASE_CHANNEL");
  process.exit(1);
}

console.log(inPre ? "release channel: beta (pre mode active, opt-in present)" : "release channel: stable");
