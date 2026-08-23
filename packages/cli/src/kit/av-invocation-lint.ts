// Does the kit cite a command that exists? The 105 skills were ported with a
// bare rename of the binary, and three separate human passes found prose citing
// `av plan create`, `av plan add-phase`, `--linked-pr`, and a `plans.db` — none
// of which the CLI has. Every one was caught by a reader; the class kept coming
// back. This is the mechanical version.
//
// Pure: the caller supplies both the text and the command surface. The surface
// is built from the live Commander registrations in `cli/command-surface.ts`,
// so it cannot rot the way a hand-written table of subcommand names would.

import { codeContextMap, isDenied, lineNumbers, type CodeContext } from "./av-invocation-context.js";

/** One command in the tree: its own options, and what it can be followed by. */
export interface CommandNode {
  /** Long and short option names, e.g. `--json`, `-h`. */
  readonly flags: ReadonlySet<string>;
  /** The subset that consumes the next token as a value. */
  readonly valueFlags: ReadonlySet<string>;
  readonly subcommands: ReadonlyMap<string, CommandNode>;
}

/** The root: `av` itself, carrying the global options. */
export type CommandSurface = CommandNode;

export interface AvInvocationFinding {
  /** 1-based, in the file the text came from. */
  line: number;
  /**
   * A subcommand that does not exist is an error — following it fails at
   * runtime. An unknown flag is a warning: the surface moves faster than the
   * prose, and starting flags at error would have failed the gate on its first
   * run over four files that are otherwise correct.
   */
  severity: "error" | "warning";
  /** The path that did resolve, e.g. `av plan`. */
  command: string;
  /** The token with no counterpart in the surface. */
  token: string;
  message: string;
}

/** `av`/`ariadnev` as a whole word followed by an argument. The lookbehind is
 *  what keeps `av:plan`, `/av:plan-i18n`, `../av-plan/SKILL.md` and
 *  `ariadnev-kit` out — all four are how the corpus writes skill and directory
 *  names, and all four outnumber real invocations. */
const BINARY = /(?<![\w:/.\-])(av|ariadnev)(?=[ \t])/g;

/**
 * Where a command line stops being this command's. Without it,
 * `av config prefs resolve --json | jq -r '.prefs'` reports jq's `-r`.
 *
 * `>`, `#` and `&` only count after whitespace, because a placeholder is far
 * more common than a redirection in this corpus and `"<title>"` would otherwise
 * cut the argv before the flags that follow it.
 */
export function isHandoff(text: string, index: number): boolean {
  const char = text[index];
  if (char === "`" || char === "|" || char === ";") return true;
  if (char === ">" || char === "#" || char === "&") return /\s/.test(text[index - 1] ?? " ");
  return false;
}

/** Cut one command line at the first handoff and split it into argv. */
export function shellArgv(commandLine: string): string[] {
  let end = commandLine.length;
  for (let i = 0; i < commandLine.length; i++) {
    if (isHandoff(commandLine, i)) {
      end = i;
      break;
    }
  }
  return commandLine.slice(0, end).trim().split(/\s+/).filter(Boolean);
}

const LEADING_PUNCTUATION = /^[`"'(]+/;
const TRAILING_PUNCTUATION = /[`"'),.;:\\]+$/;
const SUBCOMMAND = /^[a-z][a-z0-9-]*$/;

interface Mismatch {
  severity: "error" | "warning";
  command: string;
  token: string;
}

/**
 * Walk one argv against the surface and return the first token it cannot
 * account for.
 *
 * Positional arguments of a leaf command are skipped rather than checked: once
 * the path reaches a command with no subcommands, a bare word is data
 * (`av plan use my-plan`, `av plan update 3 completed`) and the tokenizer has no
 * way to know what it should be. Flags keep being checked past that point.
 */
export function checkInvocation(argv: string[], surface: CommandSurface): Mismatch | null {
  let node = surface;
  const scopes = [surface];
  const path: string[] = ["av"];

  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (/^--?[A-Za-z]/.test(raw)) {
      const flag = raw.split("=")[0].replace(TRAILING_PUNCTUATION, "");
      if (!scopes.some((scope) => scope.flags.has(flag))) {
        return { severity: "warning", command: path.join(" "), token: flag };
      }
      if (scopes.some((scope) => scope.valueFlags.has(flag))) i++;
      continue;
    }
    if (node.subcommands.size === 0) continue;
    const name = raw.replace(LEADING_PUNCTUATION, "").replace(TRAILING_PUNCTUATION, "");
    // A placeholder (`<name>`, `[name]`, `…`) or a path is where the command
    // stops and the example begins.
    if (!SUBCOMMAND.test(name)) break;
    const next = node.subcommands.get(name);
    if (next === undefined) return { severity: "error", command: path.join(" "), token: name };
    node = next;
    scopes.push(next);
    path.push(name);
  }
  return null;
}

export function invocationMessage(mismatch: Mismatch): string {
  return mismatch.severity === "error"
    ? `\`${mismatch.command} ${mismatch.token}\` — no such subcommand; \`${mismatch.command}\` does not register "${mismatch.token}"`
    : `\`${mismatch.command}\` has no \`${mismatch.token}\` option`;
}

/** The argv a binary token introduces: the rest of its line, cut at the first
 *  shell handoff or at the end of the inline span it sits in. */
function argvAt(text: string, from: number, context: CodeContext, map: CodeContext[]): string[] {
  const newline = text.indexOf("\n", from);
  const lineEnd = newline === -1 ? text.length : newline;
  let end = lineEnd;
  for (let i = from; i < lineEnd; i++) {
    if (isHandoff(text, i) || (context === "inline" && map[i] !== "inline")) {
      end = i;
      break;
    }
  }
  return text.slice(from, end).trim().split(/\s+/).filter(Boolean);
}

/**
 * Findings for one markdown or prose file.
 *
 * Only code contexts are scanned. In this corpus `av` and `ariadnev` are also
 * ordinary nouns — "an av subcommand", "the ariadnev runtime", "ariadnev
 * installs hooks one level deeper" — and reading the following word as a
 * subcommand produced about thirty false hits against ten real ones. Every real
 * hit in the kit is written in backticks or a shell fence, because that is how
 * anyone writes a command they mean to be run.
 */
export function lintAvInvocations(text: string, surface: CommandSurface): AvInvocationFinding[] {
  const map = codeContextMap(text);
  const lineOf = lineNumbers(text);
  const findings: AvInvocationFinding[] = [];

  BINARY.lastIndex = 0;
  for (let match = BINARY.exec(text); match !== null; match = BINARY.exec(text)) {
    const at = match.index;
    const context = map[at];
    if (context === "prose" || context === "other-block") continue;
    const argv = argvAt(text, at + match[1].length, context, map);
    if (argv.length === 0) continue;
    const mismatch = checkInvocation(argv, surface);
    // Denial only applies to an inline span. A fenced block or a `$` line is a
    // command to run, and the prose above one is routinely a negative lead-in —
    // "If the dashboard is **not** already running, the launcher starts:" sits
    // directly above the block that runs the phantom.
    if (mismatch === null || (context === "inline" && isDenied(text, at))) continue;
    findings.push({ line: lineOf(at), message: invocationMessage(mismatch), ...mismatch });
  }
  return findings;
}
