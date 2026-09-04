#!/usr/bin/env node
/**
 * Development Rules Reminder - UserPromptSubmit Hook (Optimized)
 *
 * Injects context: session info, rules, modularization reminders, and Plan Context.
 * Static env info (Node, Python, OS) now comes from SessionStart env vars.
 *
 * Exit Codes:
 *   0 - Success (non-blocking, allows continuation)
 *
 * Core logic extracted to lib/context-builder.cjs for OpenCode plugin reuse.
 */

// Crash wrapper
// The shared library sits beside the hooks when installed and one level up in
// the kit checkout. Probing for it means one file works in both layouts — a
// hard-coded relative path silently resolves to nothing in the other one, and
// these hooks fail open, so "nothing" looks exactly like "fine".
const AV_LIB = [require('node:path').join(__dirname, '_lib'), require('node:path').join(__dirname, '..', '_lib')]
  .find((dir) => require('node:fs').existsSync(dir));

try {
  const fs = require('fs');
  const { createHookTimer, logHookCrash } = require(require('node:path').join(AV_LIB, 'hook-logger.cjs'));

  // Import shared context building logic
  const {
    buildReminderContext,
    buildInjectionScopeKey,
    reserveInjectionScope,
    markRecentlyInjected,
    clearPendingInjection
  } = require(require('node:path').join(AV_LIB, 'context-builder.cjs'));
  const { createSessionStateContext, isHookEnabled } = require(require('node:path').join(AV_LIB, 'av-config-utils.cjs'));
  const { emitPlainContext } = require(require('node:path').join(AV_LIB, 'hook-output.cjs'));

  // Early exit if hook disabled in config
  if (!isHookEnabled('dev-rules-reminder')) {
    process.exit(0);
  }

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const timer = createHookTimer('dev-rules-reminder', { event: 'UserPromptSubmit' });
  let sessionContext = null;
  let scopeKey = 'session';
  let reservedScope = false;

  try {
    const stdin = fs.readFileSync(0, 'utf-8').trim();
    if (!stdin) {
      timer.end({ status: 'skip', exit: 0, note: 'empty-input' });
      process.exit(0);
    }

    const payload = JSON.parse(stdin);
    const baseDir = payload.cwd || process.cwd();
    sessionContext = createSessionStateContext({
      sessionId: payload.session_id,
      cwd: process['env'].AV_PROJECT_ROOT || baseDir,
      requireBinding: true
    });

    // Use CWD as the base for subdirectory workflow support.
    // The baseDir is passed to buildReminderContext for absolute path resolution
    scopeKey = buildInjectionScopeKey({
      baseDir: sessionContext?.sessionLaunchRoot || baseDir
    });

    const reservation = reserveInjectionScope(sessionContext, scopeKey);
    reservedScope = reservation.reserved;
    if (!reservation.shouldInject) {
      timer.end({ status: 'skip', exit: 0, note: 'recently-injected' });
      process.exit(0);
    }

    // Use shared context builder with baseDir for absolute paths
    const { content } = buildReminderContext({ sessionContext, baseDir });

    emitPlainContext('UserPromptSubmit', content);
    markRecentlyInjected(sessionContext, scopeKey);
    timer.end({ status: 'ok', exit: 0, note: 'context-injected' });
    process.exit(0);
  } catch (error) {
    if (reservedScope) {
      clearPendingInjection(sessionContext, scopeKey);
    }
    console.error(`Dev rules hook error: ${error.message}`);
    logHookCrash('dev-rules-reminder', error, { event: 'UserPromptSubmit' });
    process.exit(0);
  }
  }

  main();
} catch (e) {
  try {
    const { logHookCrash } = require(require('node:path').join(AV_LIB, 'hook-logger.cjs'));
    logHookCrash('dev-rules-reminder', e, { event: 'UserPromptSubmit' });
  } catch (_) {}
  process.exit(0); // fail-open
}
