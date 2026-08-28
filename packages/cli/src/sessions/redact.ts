// Credential detection over session files, as a plan and nothing else.
//
// THIS MODULE HAS NO WRITE PATH, AND THAT IS THE DESIGN. The oracle's
// `sessions redact` carries `--apply` — *"Rewrite changed session files after
// taking a session-root backup"*. It is deliberately not ported. These are
// another tool's files in another tool's format, and a rewrite of them needs
// its own phase with its own backup design, not a flag bolted onto a reader.
//
// The guarantee is structural: nothing here imports a writing function. There
// is no flag to audit and no branch to get wrong, because the capability is
// absent rather than gated.
//
// DETECTION REUSES `security/credential-sanitizer.ts`. That module is already
// the CLI's output boundary — everything printed passes through it. Reusing it
// means a redaction plan can never disagree with what this tool would actually
// mask on the way out, which a second pattern list would eventually do.

import { sanitize } from "../security/credential-sanitizer.js";
import { streamLines } from "./parse.js";
import type { DiscoveredSession } from "./discover.js";

/**
 * Email detection, opt-in via `--redact-emails` exactly as the oracle has it.
 *
 * Off by default because an email in a session is usually a git author line or
 * a code sample, not a credential, and flagging every one of them would bury
 * the findings that matter.
 */
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

export interface RedactionFinding {
  /** 0-based line position in the file. */
  readonly line: number;
  /** What kind of match fired. Never the matched value itself. */
  readonly kind: "credential" | "email";
  /** How many distinct spans on this line would be masked. */
  readonly matches: number;
}

export interface SessionRedactionPlan {
  readonly sessionId: string;
  readonly path: string;
  readonly findings: RedactionFinding[];
  readonly linesScanned: number;
  /** Always false. Present so a consumer can assert on it rather than infer. */
  readonly applied: false;
}

export interface RedactOptions {
  readonly redactEmails?: boolean;
}

/**
 * Count the spans `sanitize` would mask on one line.
 *
 * The value is never returned — only how many there were. A finding that
 * quoted the credential it found would put the secret in the report, which is
 * the same mistake as leaving it in the file, with an extra copy.
 */
function countCredentialSpans(line: string): number {
  // An empty env: detection is pattern-based only, so a plan is reproducible
  // and does not depend on which variables happened to be set at scan time.
  const masked = sanitize(line, {});
  if (masked === line) return 0;
  // The mask is a fixed marker, so counting its occurrences counts the spans.
  return (masked.match(/••••/g) ?? []).length || 1;
}

/** Scan one session and report what a redaction would change. Writes nothing. */
export function planRedaction(
  found: DiscoveredSession,
  options: RedactOptions = {},
): SessionRedactionPlan {
  const findings: RedactionFinding[] = [];
  let linesScanned = 0;

  for (const raw of streamLines(found.path)) {
    const line = raw;
    const at = linesScanned++;
    if (line.trim().length === 0) continue;

    const credentials = countCredentialSpans(line);
    if (credentials > 0) findings.push({ line: at, kind: "credential", matches: credentials });

    if (options.redactEmails) {
      const emails = line.match(EMAIL)?.length ?? 0;
      if (emails > 0) findings.push({ line: at, kind: "email", matches: emails });
    }
  }

  return { sessionId: found.id, path: found.path, findings, linesScanned, applied: false };
}

export interface RedactionReport {
  readonly plans: SessionRedactionPlan[];
  readonly sessionsScanned: number;
  readonly findingsTotal: number;
  readonly applied: false;
}

export function planRedactions(
  sessions: readonly DiscoveredSession[],
  options: RedactOptions = {},
): RedactionReport {
  const plans = sessions.map((session) => planRedaction(session, options));
  return {
    plans,
    sessionsScanned: plans.length,
    findingsTotal: plans.reduce((total, plan) => total + plan.findings.length, 0),
    applied: false,
  };
}
