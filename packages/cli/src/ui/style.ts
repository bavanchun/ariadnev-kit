// Branded terminal styling, cohesive with the vcskill.vchun.dev landing page.
// Pure: every fn takes an explicit `color` flag so formatters stay deterministic
// and side-effect-free (tests pass `color:false` for byte-stable plain output).

export interface StyleOpts {
  color: boolean;
}

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

// Truecolor brand tokens (from the landing page). Terminals without truecolor
// still degrade gracefully — and non-TTY/NO_COLOR already yields plain output.
function truecolor(r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}
const CORAL = truecolor(255, 107, 69); // #ff6b45 — brand/accent
const TEAL = truecolor(79, 184, 164); // #4fb8a4 — ok/verified
const AMBER = truecolor(224, 169, 74); // #e0a94a — warn
const FAINT = truecolor(92, 106, 92); //          — muted/skip

function wrap(code: string, s: string, color: boolean): string {
  return color ? `${code}${s}${RESET}` : s;
}

export const coral = (s: string, o: StyleOpts): string => wrap(CORAL, s, o.color);
export const teal = (s: string, o: StyleOpts): string => wrap(TEAL, s, o.color);
export const amber = (s: string, o: StyleOpts): string => wrap(AMBER, s, o.color);
export const faint = (s: string, o: StyleOpts): string => wrap(FAINT, s, o.color);
export const bold = (s: string, o: StyleOpts): string => wrap(BOLD, s, o.color);
export const dim = (s: string, o: StyleOpts): string => wrap(DIM, s, o.color);

// Same glyph vocabulary as the landing-page provider matrix.
export const symbols = {
  ok: "✓",
  fail: "✗",
  warn: "⚠",
  self: "◆",
  skip: "·",
} as const;

// Health bar (used by `doctor`). Plain form is a fixed-width block string.
export function bar(pct: number, opts: StyleOpts, width = 10): string {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const filled = Math.round((clamped / 100) * width);
  return coral("▓".repeat(filled), opts) + faint("░".repeat(width - filled), opts);
}

// The `>_ vcskill` wordmark used in the no-args banner.
export function wordmark(opts: StyleOpts): string {
  return `${coral(">_", opts)} ${bold("vcskill", opts)}`;
}

// Whether to emit ANSI. Precedence is deliberately conservative so piped output
// (and the release smoke-test that greps it) is never colored:
//   1. non-TTY            → plain, even if FORCE_COLOR is set
//   2. CI                 → plain (even on a TTY)
//   3. NO_COLOR present   → plain
//   4. FORCE_COLOR / TTY  → color
export function shouldColor(
  env: Record<string, string | undefined>,
  stream: { isTTY?: boolean } | undefined,
): boolean {
  if (!stream || !stream.isTTY) return false;
  if (env.CI) return false;
  if (env.NO_COLOR !== undefined) return false;
  if (env.FORCE_COLOR !== undefined) return true;
  return true;
}
