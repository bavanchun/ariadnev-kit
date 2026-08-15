#!/usr/bin/env node
/**
 * Notification entrypoint. Reads a hook payload on stdin and, when the user has
 * configured a destination, sends one line to it.
 *
 * Off unless `notifications.enabled` is true in the user's own config. It is not
 * bound to any event by the installer: it lives under `_lib/` and is wired up by
 * hand, because sending a session's activity to a third-party service is a
 * choice a user makes, not a default they discover.
 *
 * Usage: echo '{"hook_event_name":"Stop"}' | node notify.cjs
 */

'use strict';

const { resolvePrefsSection } = require('../av-config-client.cjs');
const { buildPayload } = require('./payload.cjs');
const { buildRequests } = require('./senders.cjs');
const { deliver } = require('./transport.cjs');

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve({});
      return;
    }
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      try {
        resolve(data.trim() ? JSON.parse(data) : {});
      } catch (e) {
        resolve({});
      }
    });
    process.stdin.on('error', () => resolve({}));
  });
}

async function main() {
  const input = await readStdin();
  const payload = buildPayload(input);
  if (!payload) return;

  const notifications = resolvePrefsSection('notifications', { cwd: input.cwd || process.cwd() });
  const requests = buildRequests(payload, notifications);
  if (requests.length === 0) return;

  await deliver(requests);
}

if (require.main === module) {
  // A notification is never worth failing a session over: any error, and any
  // non-zero exit, is swallowed here.
  main().then(
    () => process.exit(0),
    () => process.exit(0)
  );
}

module.exports = { main };
