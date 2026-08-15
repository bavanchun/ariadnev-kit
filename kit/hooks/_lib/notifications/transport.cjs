/**
 * The one place a hook makes a network request.
 *
 * The host allowlist is enforced here as well as in the config client. That is
 * deliberate duplication: the client decides what a *setting* may contain, and
 * this decides what may leave the machine. A future caller that builds a URL
 * some other way still cannot reach a host outside the list, and the check sits
 * at the egress point where it is impossible to bypass by accident.
 *
 * Failures are throttled per provider so a webhook that has been revoked does
 * not produce one request per event forever.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');

const TABLE = require('../config-fields.generated.cjs');
const { sanitize } = require('../sanitizer.cjs');

const THROTTLE_FILE = path.join(os.tmpdir(), 'ariadnev-notify-throttle.json');
const THROTTLE_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;

function hostAllowed(hostname) {
  return TABLE.notificationHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

function readThrottle() {
  try {
    return JSON.parse(fs.readFileSync(THROTTLE_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function writeThrottle(state) {
  try {
    fs.writeFileSync(THROTTLE_FILE, JSON.stringify(state), 'utf8');
  } catch (e) {
    // Losing the throttle record costs an extra request, not a session.
  }
}

function isThrottled(provider, now) {
  const at = readThrottle()[provider];
  return typeof at === 'number' && now - at < THROTTLE_MS;
}

function recordFailure(provider, now) {
  const state = readThrottle();
  state[provider] = now;
  writeThrottle(state);
}

function clearFailure(provider) {
  const state = readThrottle();
  if (state[provider] === undefined) return;
  delete state[provider];
  writeThrottle(state);
}

/**
 * POST one request. Resolves to a result; never rejects, because a notification
 * failing must not fail the session it is reporting on.
 *
 * @param {{provider: string, url: string, body: Object}} request
 * @returns {Promise<{provider: string, ok: boolean, reason?: string}>}
 */
function post(request) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(request.url);
    } catch (e) {
      resolve({ provider: request.provider, ok: false, reason: 'destination is not a valid URL' });
      return;
    }
    if (url.protocol !== 'https:' || !hostAllowed(url.hostname)) {
      // The reason names the host but never the path, which is where a webhook
      // keeps its token.
      resolve({ provider: request.provider, ok: false, reason: `destination host ${url.hostname} is not allowlisted` });
      return;
    }

    const data = Buffer.from(JSON.stringify(request.body), 'utf8');
    const req = https.request(
      {
        method: 'POST',
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        headers: { 'content-type': 'application/json', 'content-length': data.length },
        timeout: REQUEST_TIMEOUT_MS
      },
      (res) => {
        res.resume();
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        resolve({ provider: request.provider, ok, reason: ok ? undefined : `HTTP ${res.statusCode}` });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ provider: request.provider, ok: false, reason: 'timed out' });
    });
    req.on('error', (err) => {
      resolve({ provider: request.provider, ok: false, reason: sanitize(String(err && err.message)) });
    });
    req.end(data);
  });
}

/**
 * Send every request, skipping providers whose last attempt failed recently.
 *
 * @param {Array} requests
 * @param {object} [options]
 * @param {function} [options.send] Injected sender, for tests.
 * @param {number} [options.now]
 * @returns {Promise<Array>}
 */
async function deliver(requests, options = {}) {
  const send = options.send || post;
  const now = options.now || Date.now();
  const results = [];
  for (const request of requests) {
    if (isThrottled(request.provider, now)) {
      results.push({ provider: request.provider, ok: false, reason: 'throttled after a recent failure' });
      continue;
    }
    const result = await send(request);
    if (result.ok) clearFailure(request.provider);
    else recordFailure(request.provider, now);
    results.push(result);
  }
  return results;
}

module.exports = { THROTTLE_FILE, THROTTLE_MS, REQUEST_TIMEOUT_MS, hostAllowed, deliver, post };
