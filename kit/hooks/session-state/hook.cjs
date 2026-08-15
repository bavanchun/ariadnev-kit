#!/usr/bin/env node
// The shared library sits beside the hooks when installed and one level up in
// the kit checkout. Probing for it means one file works in both layouts — a
// hard-coded relative path silently resolves to nothing in the other one, and
// these hooks fail open, so "nothing" looks exactly like "fine".
const AV_LIB = [require('node:path').join(__dirname, '_lib'), require('node:path').join(__dirname, '..', '_lib')]
  .find((dir) => require('node:fs').existsSync(dir));

'use strict';

try {
  const fs = require('fs');
  const {
    createSessionStateContext,
    isHookEnabled
  } = require(require('node:path').join(AV_LIB, 'av-config-utils.cjs'));
  const {
    persistProjectCheckpoint,
    refreshStatuslineSnapshot
  } = require(require('node:path').join(AV_LIB, 'session-state-manager.cjs'));

  if (!isHookEnabled('session-state')) process.exit(0);

  const TRACKED_POST_TOOL_EVENTS = new Set(['Agent', 'Task', 'TaskCreate', 'TaskUpdate', 'TodoWrite']);

  async function main() {
    const stdin = fs.readFileSync(0, 'utf8').trim();
    const data = stdin ? JSON.parse(stdin) : {};
    const eventType = data.hook_event_name || null;
    const context = createSessionStateContext({
      sessionId: data.session_id,
      cwd: process['env'].AV_PROJECT_ROOT || data.cwd || process.cwd(),
      requireBinding: true
    });
    if (!context) process.exit(0);

    if (eventType === 'PostToolUse' && TRACKED_POST_TOOL_EVENTS.has(data.tool_name || '')) {
      await refreshStatuslineSnapshot(context, data);
    } else if (eventType === 'SubagentStop') {
      await refreshStatuslineSnapshot(context, data);
    } else if (eventType === 'Stop') {
      await persistProjectCheckpoint(context, data);
    }

    if (eventType === 'PostToolUse') {
      process.stdout.write(JSON.stringify({ continue: true }));
    }
    process.exit(0);
  }

  main().catch(() => process.exit(0));
} catch {
  process.exit(0);
}
