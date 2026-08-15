#!/usr/bin/env node

// Crash wrapper
// The shared library sits beside the hooks when installed and one level up in
// the kit checkout. Probing for it means one file works in both layouts — a
// hard-coded relative path silently resolves to nothing in the other one, and
// these hooks fail open, so "nothing" looks exactly like "fine".
const AV_LIB = [require('node:path').join(__dirname, '_lib'), require('node:path').join(__dirname, '..', '_lib')]
  .find((dir) => require('node:fs').existsSync(dir));

try {
  const { isHookEnabled } = require(require('node:path').join(AV_LIB, 'av-config-utils.cjs'));
  const { createHookTimer, logHookCrash } = require(require('node:path').join(AV_LIB, 'hook-logger.cjs'));

  // Early exit if hook disabled in config
  if (!isHookEnabled('descriptive-name')) {
    process.exit(0);
  }

  try {
  const timer = createHookTimer('descriptive-name', { event: 'PreToolUse', tool: 'Write' });
  let injectedPrompt = `## File naming guidance:
- Skip this guidance if you are creating markdown or plain text files
- Prefer kebab-case for JS/TS/Python/shell (.js, .ts, .py, .sh) with descriptive names
- Respect language conventions: C#/Java/Kotlin/Swift use PascalCase (.cs, .java, .kt, .swift), Go/Rust use snake_case (.go, .rs)
- Other languages: follow their ecosystem's standard naming convention
- Goal: self-documenting names for LLM tools (Grep, Glob, Search)`

  // Context-only hook: emit additionalContext without a permission decision.
  // Codex rejects `permissionDecision: "allow"` unless the hook also returns
  // updatedInput, and this hook never rewrites the tool call.
  console.log(JSON.stringify({
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "additionalContext": injectedPrompt
    }
  }));

    timer.end({ status: 'ok', exit: 0 });
    // All paths allowed
    process.exit(0);

  } catch (error) {
    // Fail-open for unexpected errors
    console.error('WARN: Hook error, allowing operation -', error.message);
    logHookCrash('descriptive-name', error, { event: 'PreToolUse', tool: 'Write' });
    process.exit(0);
  }
} catch (e) {
  try {
    const { logHookCrash } = require(require('node:path').join(AV_LIB, 'hook-logger.cjs'));
    logHookCrash('descriptive-name', e, { event: 'PreToolUse', tool: 'Write' });
  } catch (_) {}
  process.exit(0); // fail-open
}
