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
  // Notification destinations hide their credential in the URL *path*, so the
  // key-name rules below never see them and neither does URL_USERINFO. The id
  // segment is kept and the secret segment redacted, which is enough to tell two
  // destinations apart in a log without either being usable.
  /(https:\/\/(?:[A-Za-z0-9-]+\.)*discord(?:app)?\.com\/api\/webhooks\/\d+\/)[A-Za-z0-9_-]{8,}/g,
  /(https:\/\/hooks\.slack\.com\/services\/)[A-Za-z0-9/_-]{8,}/g,
  /(https:\/\/api\.telegram\.org\/bot\d+:)[A-Za-z0-9_-]{8,}/g,
  // A bot token on its own, outside a URL.
  /(\b\d{6,}:)[A-Za-z0-9_-]{20,}/g,
];

// Patterns whose first capture group is a keepable prefix. Kept separate from
// TOKEN_PATTERNS so a whole-match pattern can never accidentally re-emit part of
// the secret it was meant to remove.
const PREFIX_KEEPING = new Set(TOKEN_PATTERNS.slice(4));

// URL userinfo: https://user:pass@host → https://••••@host
const URL_USERINFO = /(https?:\/\/)[^/@\s]+@/g;

// An env value is only treated as a secret to string-replace when it is long
// enough and token-shaped — this guards against `GH_TOKEN=""`/`"1"` shredding
// every line of output (a real red-team finding). Env keys we consider secret.
const SECRET_KEY = /(_TOKEN|_KEY|_SECRET|_PASSWORD|_PASS|_PWD|_CREDENTIALS?|_URL|_WEBHOOK)$|^GH_TOKEN$|^GITHUB_TOKEN$/;
const TOKEN_SHAPE = /^[A-Za-z0-9._\-/+=]{8,}$/;
// A destination URL is a secret held in a shape TOKEN_SHAPE rejects (it has a
// colon and slashes), and the convention for naming one is `*_URL`/`*_WEBHOOK`.
// Only a URL whose path carries something — not a bare origin — counts, so
// `DOCS_URL=https://example.com/docs` stays readable in output.
const WEBHOOK_KEY = /(_URL|_WEBHOOK)$/;
const SECRET_URL_SHAPE = /^https?:\/\/[^/\s]+\/\S{8,}$/;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function sanitize(text: string, env: Record<string, string | undefined> = process.env): string {
  let out = text;
  out = out.replace(URL_USERINFO, `$1${MARK}@`);
  for (const re of TOKEN_PATTERNS) out = out.replace(re, PREFIX_KEEPING.has(re) ? `$1${MARK}` : MARK);

  for (const [key, value] of Object.entries(env)) {
    if (!value || value.length < 8) continue; // never redact empty/short values
    if (!SECRET_KEY.test(key)) continue;
    const shaped = WEBHOOK_KEY.test(key) ? SECRET_URL_SHAPE.test(value) : TOKEN_SHAPE.test(value);
    if (!shaped) continue;
    out = out.replace(new RegExp(escapeRegExp(value), "g"), MARK);
  }
  return out;
}
