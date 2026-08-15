/**
 * Credential redaction inside a hook process.
 *
 * The CLI attaches its sanitizer at its single output boundary, but a hook is a
 * separate `node` process that never loads it — so anything a hook writes to its
 * log went out raw, including the destination a notification failed to reach.
 *
 * This is the same rule set as `packages/cli/src/security/credential-sanitizer.ts`.
 * Two implementations exist because they run in different runtimes; they are
 * held together by one shared corpus (`redaction-corpus.json`) that both test
 * suites run, so a case that one redacts and the other does not is a failure
 * rather than a discovery made later in a log file.
 */

'use strict';

const MARK = '••••';

const TOKEN_PATTERNS = [
  /ghp_[A-Za-z0-9]{16,}/g,
  /github_pat_[A-Za-z0-9_]{16,}/g,
  /gh[ousr]_[A-Za-z0-9]{16,}/g,
  /sk-[A-Za-z0-9_-]{12,}/g
];

// Destinations carry their credential in the URL path, where neither the
// key-name rule nor the userinfo rule can see it. The id is kept so two
// destinations stay distinguishable in a log; the secret segment is not.
const PREFIX_KEEPING_PATTERNS = [
  /(https:\/\/(?:[A-Za-z0-9-]+\.)*discord(?:app)?\.com\/api\/webhooks\/\d+\/)[A-Za-z0-9_-]{8,}/g,
  /(https:\/\/hooks\.slack\.com\/services\/)[A-Za-z0-9/_-]{8,}/g,
  /(https:\/\/api\.telegram\.org\/bot\d+:)[A-Za-z0-9_-]{8,}/g,
  /(\b\d{6,}:)[A-Za-z0-9_-]{20,}/g
];

const URL_USERINFO = /(https?:\/\/)[^/@\s]+@/g;

const SECRET_KEY = /(_TOKEN|_KEY|_SECRET|_PASSWORD|_PASS|_PWD|_CREDENTIALS?|_URL|_WEBHOOK)$|^GH_TOKEN$|^GITHUB_TOKEN$/;
const WEBHOOK_KEY = /(_URL|_WEBHOOK)$/;
const TOKEN_SHAPE = /^[A-Za-z0-9._\-/+=]{8,}$/;
// Only a URL with something in its path counts, so a plain documentation link
// held in a `*_URL` variable stays readable.
const SECRET_URL_SHAPE = /^https?:\/\/[^/\s]+\/\S{8,}$/;

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Redact credentials from text.
 *
 * @param {string} text
 * @param {Object} [env] Environment to scan for secret-shaped values.
 * @returns {string}
 */
function sanitize(text, env) {
  if (typeof text !== 'string') return text;
  const environment = env || process.env;
  let out = text.replace(URL_USERINFO, `$1${MARK}@`);
  for (const re of TOKEN_PATTERNS) out = out.replace(re, MARK);
  for (const re of PREFIX_KEEPING_PATTERNS) out = out.replace(re, `$1${MARK}`);

  for (const key of Object.keys(environment)) {
    const value = environment[key];
    if (!value || value.length < 8) continue;
    if (!SECRET_KEY.test(key)) continue;
    const shaped = WEBHOOK_KEY.test(key) ? SECRET_URL_SHAPE.test(value) : TOKEN_SHAPE.test(value);
    if (!shaped) continue;
    out = out.replace(new RegExp(escapeRegExp(value), 'g'), MARK);
  }
  return out;
}

/**
 * Redact every string inside a structure, in place of the caller having to know
 * which field might hold a destination. Used by the hook logger, whose entries
 * are objects assembled by many different hooks.
 *
 * @param {*} value
 * @param {Object} [env]
 * @returns {*}
 */
function sanitizeDeep(value, env) {
  if (typeof value === 'string') return sanitize(value, env);
  if (Array.isArray(value)) return value.map((item) => sanitizeDeep(item, env));
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) out[key] = sanitizeDeep(value[key], env);
    return out;
  }
  return value;
}

module.exports = { MARK, sanitize, sanitizeDeep };
