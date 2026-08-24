// Where in a markdown file a command line can legitimately be written, and how
// far a negating clause reaches. Pure string analysis: the av-invocation lint
// asks these two questions and nothing else does.

/** Where one character sits. `prose` is never scanned — see `av-invocation-lint.ts`. */
export type CodeContext = "prose" | "inline" | "shell-block" | "other-block";

/**
 * Fence languages whose body is a command line. Anything else — `ts`, `json`,
 * `yaml` — is data that happens to contain the letters, and a template literal
 * in a `ts` block is indistinguishable from a shell command to a tokenizer.
 */
const SHELL_LANGUAGES = new Set(["", "bash", "sh", "shell", "zsh", "console", "shellsession", "text", "txt"]);

const FENCE_OPEN = /^\s{0,3}(?:```+|~~~+)\s*([A-Za-z0-9_+-]*)/;
const FENCE_CHAR = /^\s{0,3}(```+|~~~+)/;

/**
 * Context for every character of `text`.
 *
 * An array rather than a predicate because the scanner asks about thousands of
 * offsets per file and also needs to know where an inline span *ends* — the
 * span boundary is what stops `av plan use` from swallowing the prose after the
 * closing backtick.
 */
export function codeContextMap(text: string): CodeContext[] {
  const map: CodeContext[] = new Array<CodeContext>(text.length).fill("prose");
  let offset = 0;
  let fence: string | null = null;
  let fenceContext: CodeContext = "shell-block";

  for (const line of text.split("\n")) {
    if (fence === null) {
      const open = FENCE_OPEN.exec(line);
      if (open) {
        fence = FENCE_CHAR.exec(line)![1][0];
        fenceContext = SHELL_LANGUAGES.has(open[1].toLowerCase()) ? "shell-block" : "other-block";
        offset += line.length + 1;
        continue;
      }
    } else {
      // A closing fence is the same character, three or more, alone on its line.
      if (new RegExp(`^\\s{0,3}\\${fence}{3,}\\s*$`).test(line)) fence = null;
      else map.fill(fenceContext, offset, offset + line.length);
      offset += line.length + 1;
      continue;
    }

    markInlineSpans(line, offset, map);
    // A shell prompt is a command line wherever it appears, fence or not.
    if (/^\s{0,3}\$\s/.test(line)) map.fill("shell-block", offset, offset + line.length);
    offset += line.length + 1;
  }
  return map;
}

/** Backtick runs on one line. An unclosed run is left as prose — half a span is
 *  not evidence of anything, and treating it as code invents a command out of
 *  the rest of the sentence. */
function markInlineSpans(line: string, offset: number, map: CodeContext[]): void {
  let i = 0;
  while (i < line.length) {
    if (line[i] !== "`") {
      i++;
      continue;
    }
    let ticks = 0;
    while (line[i + ticks] === "`") ticks++;
    const close = line.indexOf("`".repeat(ticks), i + ticks);
    if (close === -1) {
      i += ticks;
      continue;
    }
    map.fill("inline", offset + i + ticks, offset + close);
    i = close + ticks;
  }
}

/**
 * The stretch of prose a negating clause governs.
 *
 * Sentence-shaped, not line-shaped: the corpus wraps at 80 columns, so "Do not
 * invent an `av plan create` or / `av plan translate` command" puts the denial
 * and one of the things denied on different lines. Line scope would report the
 * second one.
 *
 * It also breaks on markdown block starts and on a line that ends a bold run or
 * a colon. Those are lead-ins, not clauses: "**Dashboard did not open**" sits
 * directly above "Start it with `av config start`", and without the break the
 * "did not" in the heading excuses the command underneath it.
 */
const SENTENCE_END = /[.!?][)"'*\]`]*(?=\s|$)|\*\*[ \t]*\n|:[ \t]*\n|\n[ \t]*\n|\n[ \t]*(?:[-*+]|\d+\.|#{1,6})[ \t]/g;

function sentenceSpans(text: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  let start = 0;
  SENTENCE_END.lastIndex = 0;
  for (let match = SENTENCE_END.exec(text); match !== null; match = SENTENCE_END.exec(text)) {
    const end = match.index + match[0].length;
    spans.push({ start, end });
    start = end;
  }
  spans.push({ start, end: text.length });
  return spans;
}

/**
 * A clause naming a command's absence. The files that got this right are the
 * ones a naive matcher punishes hardest — `plan-i18n`, `plan`, and `cook` all
 * spell out, in backticks, that `av plan create` does not exist — so the escape
 * is as broad as the corpus's actual vocabulary and no broader.
 *
 * Split into two shapes because bare `no` is over-broad. "No arguments." and
 * "no output" are quantifier uses that describe the surrounding phrase, not the
 * command in the same sentence; treating them as sentence-wide denials excused
 * every phantom hiding next to one. Everything else keeps its sentence scope:
 * "does not", "never", "neither", "nonexistent" are unambiguous absence.
 */
const STRONG_DENIAL =
  /\b(?:not|never|neither|none|nonexistent|non-existent|invent)\b|does ?n[o']t|is ?n[o']t|\bno such\b/i;
/** `no` followed by the code span it denies — "no `av plan create`",
 *  "stores no `--linked-pr`". Anchored to a backtick or quote, so the words
 *  "no arguments" three tokens up from a real invocation do not qualify. */
const NO_ADJACENT = /\bno\s+(?:such\s+)?['"`]/i;

/** Does the clause around `offset` say the thing at `offset` does not exist? */
export function isDenied(text: string, offset: number): boolean {
  const span = sentenceSpans(text).find((candidate) => offset >= candidate.start && offset < candidate.end);
  if (span === undefined) return false;
  const prose = text
    .slice(span.start, span.end)
    // The denial has to be in the prose, not in the thing denied: `--no-open`
    // and `av config stop` both contain a word this rule looks for.
    .replace(/`+[^`]*`+/g, " ")
    .replace(/(^|\s)--?[A-Za-z][\w-]*/g, " ");
  if (STRONG_DENIAL.test(prose)) return true;
  // Bare `no` only counts adjacent to the invocation clause, which in this
  // corpus always means a backtick opens right after it. Bounded by the
  // sentence: "There is no `av plan create`. Run `av plan scaffold` instead."
  // must still report `scaffold`, and a raw 30-char window would reach the
  // "no `" in the previous sentence.
  const window = text.slice(Math.max(span.start, offset - 30), offset);
  return NO_ADJACENT.test(window);
}

/** 1-based line number for a character offset. */
export function lineNumbers(text: string): (offset: number) => number {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  return (offset: number) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (starts[mid] <= offset) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };
}
