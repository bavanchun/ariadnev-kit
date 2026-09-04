#!/usr/bin/env node
/**
 * UserPromptSubmit hook: injects a static reminder when a prompt indicates
 * credential or secret handling. It never echoes prompt text or matched values.
 */

// The shared library sits beside the hooks when installed and one level up in
// the kit checkout. Probing for it means one file works in both layouts — a
// hard-coded relative path silently resolves to nothing in the other one, and
// these hooks fail open, so "nothing" looks exactly like "fine".
const AV_LIB = [require('node:path').join(__dirname, '_lib'), require('node:path').join(__dirname, '..', '_lib')]
  .find((dir) => require('node:fs').existsSync(dir));

try {
  const fs = require('fs');
  const { isHookEnabled } = require(require('node:path').join(AV_LIB, 'av-config-utils.cjs'));
  const { createHookTimer, logHookCrash } = require(require('node:path').join(AV_LIB, 'hook-logger.cjs'));
  const { containsSecretKeyword } = require(require('node:path').join(AV_LIB, 'secret-keywords.cjs'));
  const { emitContext } = require(require('node:path').join(AV_LIB, 'hook-output.cjs'));

  const HOOK_NAME = 'secret-output-guardrail';
  const REMINDER = [
    'Security reminder: do not print raw credentials, API keys, tokens, JWTs, private keys, or secret values into the conversation.',
    'Use [redacted], variable names, counts, or high-level status. Approval to read a sensitive file or command output does not grant permission to print raw values.',
    'If a value is needed for a machine action, pass it through a non-echoing path and report only success or failure.',
  ].join(' ');

  function readPayload() {
    const raw = fs.readFileSync(0, 'utf8').trim();
    if (!raw) return {};
    return JSON.parse(raw);
  }

  function promptFromPayload(payload) {
    return String(payload?.prompt || payload?.user_prompt || '');
  }

  function outputForPrompt(prompt) {
    return containsSecretKeyword(prompt) ? REMINDER : null;
  }

  function main() {
    const timer = createHookTimer(HOOK_NAME, { event: 'UserPromptSubmit' });

    if (!isHookEnabled(HOOK_NAME)) {
      timer.end({ status: 'skip', exit: 0, note: 'disabled' });
      process.exit(0);
    }

    const payload = readPayload();
    const result = outputForPrompt(promptFromPayload(payload));
    if (!result) {
      timer.end({ status: 'skip', exit: 0, note: 'skipped' });
      process.exit(0);
    }

    emitContext('UserPromptSubmit', result);
    timer.end({ status: 'ok', exit: 0, note: 'triggered' });
    process.exit(0);
  }

  if (require.main === module) {
    try {
      main();
    } catch (error) {
      logHookCrash(HOOK_NAME, error, { event: 'UserPromptSubmit' });
      process.exit(0);
    }
  }

  module.exports = {
    REMINDER,
    outputForPrompt,
    promptFromPayload,
  };
} catch (error) {
  try {
    const { logHookCrash } = require(require('node:path').join(AV_LIB, 'hook-logger.cjs'));
    logHookCrash('secret-output-guardrail', error, { event: 'UserPromptSubmit' });
  } catch (_) {}
  process.exit(0);
}
