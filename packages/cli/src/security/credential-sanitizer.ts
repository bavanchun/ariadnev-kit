// Redacts credentials from any text the CLI is about to print. Wired into the
// single `emit()` output boundary + the top-level error handler, so a token that
// finds its way into an error message or command summary never reaches a
// terminal or a log. Pure: takes an explicit env map (defaults to process.env).

const MARK = "••••";

// Well-known token shapes — redacted wherever they appear, regardless of env.
const TOKEN_PATTERNS: RegExp[] = [
  /ghp_[A-Za-z0-9]{16,}/g, // GitHub PAT (classic)
  /github_pat_[A-Za-z0-9_]{16,}/g, // fine-grained PAT
  /gh[ousr]_[A-Za-z0-9]{16,}/g, // OAuth / app / user / refresh tokens (gho_/ghu_/ghs_/ghr_)
  /sk-[A-Za-z0-9_-]{12,}/g, // OpenAI-style key (modern sk-proj- keys contain '_')
];

// URL userinfo: https://user:pass@host → https://••••@host
const URL_USERINFO = /(https?:\/\/)[^/@\s]+@/g;

// An env value is only treated as a secret to string-replace when it is long
// enough and token-shaped — this guards against `GH_TOKEN=""`/`"1"` shredding
// every line of output (a real red-team finding). Env keys we consider secret.
const SECRET_KEY = /(_TOKEN|_KEY|_SECRET|_PASSWORD|_PASS|_PWD|_CREDENTIALS?)$|^GH_TOKEN$|^GITHUB_TOKEN$/;
const TOKEN_SHAPE = /^[A-Za-z0-9._\-/+=]{8,}$/;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function sanitize(text: string, env: Record<string, string | undefined> = process.env): string {
  let out = text;
  out = out.replace(URL_USERINFO, `$1${MARK}@`);
  for (const re of TOKEN_PATTERNS) out = out.replace(re, MARK);

  for (const [key, value] of Object.entries(env)) {
    if (!value || value.length < 8) continue; // never redact empty/short values
    if (!SECRET_KEY.test(key)) continue;
    if (!TOKEN_SHAPE.test(value)) continue;
    out = out.replace(new RegExp(escapeRegExp(value), "g"), MARK);
  }
  return out;
}
