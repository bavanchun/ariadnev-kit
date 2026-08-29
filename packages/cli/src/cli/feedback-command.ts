// `av feedback` — a redacted report, written to a file or opened as an issue.
//
// OPEN QUESTION 4, ANSWERED: BOTH, WITH EXPORT AS THE DEFAULT. The plan asked
// whether feedback should be export-only or should open a GitHub issue on
// ariadnev's own repository, and noted the second is more useful and more
// surface. Doing only the first means the report has nowhere to go; doing only
// the second means every `av feedback` is a network write. So export is what
// happens by default, `--submit` opens the issue, and `--submit` needs `--yes`
// because it publishes text under the maintainer's account.
//
// Upstream submits to a vendor registry ariadnev does not operate — excluded by
// dependency, per phase 1's ADR — and its `--attach-diagnostics` inlines a
// doctor summary. That is offered here too, and it is the reason everything
// below goes through the credential sanitizer: a diagnostics blob is exactly
// where a token reaches a public issue, and `av feedback` must not be the
// command that publishes one.

import { writeFileSync } from "node:fs";
import { realGh, type GhRunner } from "../github/gh.js";
import { sanitize } from "../security/credential-sanitizer.js";
import { runDoctor } from "./doctor-command.js";
import { RELEASE_REPO } from "./changelog-command.js";
import { packageVersion } from "../version.js";
import { EXIT, UsageError } from "./exit-codes.js";
import { jsonEnvelope } from "./json-envelope.js";

export const FEEDBACK_SCHEMA_VERSION = 1;
export const FEEDBACK_TYPES = ["bug", "feature", "enhancement"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export interface FeedbackOpts {
  readonly home: string;
  readonly cwd: string;
  readonly type?: string;
  readonly title?: string;
  readonly body?: string;
  readonly area?: string;
  readonly expected?: string;
  readonly actual?: string;
  /** Write the markdown here. Default when `--submit` is absent. */
  readonly export?: string;
  /** Open an issue on ariadnev's repository. Requires `--yes`. */
  readonly submit?: boolean;
  readonly yes?: boolean;
  readonly attachDiagnostics?: boolean;
  readonly json?: boolean;
}

export interface FeedbackResult {
  readonly output: string;
  readonly exitCode: number;
}

export function parseType(raw: string | undefined): FeedbackType {
  if (raw === undefined) throw new UsageError(`--type is required: one of ${FEEDBACK_TYPES.join(", ")}`);
  if (!(FEEDBACK_TYPES as readonly string[]).includes(raw)) {
    throw new UsageError(`unknown --type ${JSON.stringify(raw)}: expected one of ${FEEDBACK_TYPES.join(", ")}`);
  }
  return raw as FeedbackType;
}

/**
 * Render the report.
 *
 * EVERY FIELD PASSES THROUGH THE SANITIZER, INCLUDING THE ONES A PERSON TYPED.
 * A body pasted from a terminal carries whatever was on that terminal, and this
 * text is on its way to a public issue. Sanitizing only the diagnostics would
 * cover the obvious half and leave the half people actually paste into.
 */
export function renderFeedback(opts: FeedbackOpts, type: FeedbackType, diagnostics: string | null): string {
  const clean = (value: string | undefined): string => (value === undefined ? "" : sanitize(value));
  const sections: [string, string][] = [
    ["Area", clean(opts.area)],
    ["Expected", clean(opts.expected)],
    ["Actual", clean(opts.actual)],
    ["Details", clean(opts.body)],
  ];
  const lines = [
    `# ${clean(opts.title)}`,
    "",
    `- type: ${type}`,
    `- ariadnev: ${packageVersion()}`,
    `- platform: ${process.platform} ${process.arch}`,
    "",
  ];
  for (const [heading, value] of sections) {
    if (!value) continue;
    lines.push(`## ${heading}`, "", value, "");
  }
  if (diagnostics) {
    lines.push("## Diagnostics", "", "```", sanitize(diagnostics), "```", "");
  }
  return lines.join("\n");
}

/** A redacted doctor summary, or null when it could not be produced. */
export function collectDiagnostics(opts: FeedbackOpts): string | null {
  try {
    return runDoctor({ home: opts.home, cwd: opts.cwd, scope: "project" }).summary;
  } catch {
    // Diagnostics are a convenience. Losing them must not lose the report.
    return null;
  }
}

export function runFeedback(opts: FeedbackOpts, gh: GhRunner = realGh("av feedback --submit")): FeedbackResult {
  const type = parseType(opts.type);
  if (!opts.title) throw new UsageError("--title is required");
  const markdown = renderFeedback(opts, type, opts.attachDiagnostics ? collectDiagnostics(opts) : null);

  if (opts.submit) {
    // The one network write, and it publishes under the maintainer's account.
    if (!opts.yes) {
      return {
        output: opts.json
          ? jsonEnvelope(FEEDBACK_SCHEMA_VERSION, "feedback.preview", { submitted: false, repo: RELEASE_REPO, markdown })
          : `${markdown}\n---\nThis would open an issue on ${RELEASE_REPO}. Re-run with --yes to submit it.`,
        exitCode: EXIT.ok,
      };
    }
    const result = gh(["issue", "create", "--repo", RELEASE_REPO, "--title", sanitize(opts.title), "--body", markdown, "--label", type]);
    if (result.status !== 0) {
      return {
        output: `feedback: gh issue create failed: ${result.stderr.trim() || `exit ${result.status}`}`,
        exitCode: EXIT.failed,
      };
    }
    const url = result.stdout.trim();
    return {
      output: opts.json ? jsonEnvelope(FEEDBACK_SCHEMA_VERSION, "feedback.submitted", { submitted: true, url }) : `feedback submitted — ${url}`,
      exitCode: EXIT.ok,
    };
  }

  if (opts.export) {
    writeFileSync(opts.export, markdown);
    return {
      output: opts.json
        ? jsonEnvelope(FEEDBACK_SCHEMA_VERSION, "feedback.exported", { path: opts.export })
        : `feedback written to ${opts.export}`,
      exitCode: EXIT.ok,
    };
  }
  // No destination named: print it. The report still exists, and the user can
  // redirect it — which is a better default than writing a file they did not ask
  // for, or opening an issue they did not ask for.
  return {
    output: opts.json ? jsonEnvelope(FEEDBACK_SCHEMA_VERSION, "feedback.rendered", { markdown }) : markdown,
    exitCode: EXIT.ok,
  };
}
