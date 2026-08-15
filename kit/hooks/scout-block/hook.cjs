#!/usr/bin/env node
/**
 * scout-block.cjs - Cross-platform hook for blocking directory access
 *
 * Blocks access to directories listed in the shipped .claude/.avignore baseline
 * plus an optional project-local .claude/.avignore override at the git root.
 * Uses gitignore-spec compliant pattern matching via 'ignore' package
 *
 * Blocking Rules:
 * - File paths: Blocks any file_path/path/pattern containing blocked directories
 * - Bash commands: Blocks directory access (cd, ls, cat, etc.) but ALLOWS build commands
 *   - Blocked: cd node_modules, ls packages/web/node_modules, cat dist/file.js
 *   - Allowed: npm build, go build, cargo build, make, mvn, gradle, docker build, kubectl, terraform
 *
 * Configuration:
 * - Edit .claude/.avignore to customize shipped baseline patterns
 * - Add <project-root>/.claude/.avignore to override locally without changing the baseline
 * - Supports negation patterns (!) to allow specific paths
 *
 * Exit Codes:
 * - 0: Command allowed
 * - 2: Command blocked
 *
 * Core logic extracted to lib/scout-checker.cjs for OpenCode plugin reuse.
 */

// Crash wrapper — catches require() failures and logs them
// The shared library sits beside the hooks when installed and one level up in
// the kit checkout. Probing for it means one file works in both layouts — a
// hard-coded relative path silently resolves to nothing in the other one, and
// these hooks fail open, so "nothing" looks exactly like "fine".
const AV_LIB = [require('node:path').join(__dirname, '_lib'), require('node:path').join(__dirname, '..', '_lib')]
  .find((dir) => require('node:fs').existsSync(dir));

try {
  const fs = require('fs');
  const path = require('path');

  // Import shared scout checking logic
  const {
    checkScoutBlock,
    isBuildCommand,
    isVenvExecutable,
    isAllowedCommand
  } = require(require('node:path').join(AV_LIB, 'scout-checker.cjs'));
  const { isHookEnabled } = require(require('node:path').join(AV_LIB, 'av-config-utils.cjs'));

  // Early exit if hook disabled in config
  if (!isHookEnabled('scout-block')) {
    process.exit(0);
  }

  // Import formatters (kept local as they're Claude-specific output)
  const { formatBlockedError } = require(require('node:path').join(AV_LIB, 'scout-block/error-formatter.cjs'));
  const { formatBroadPatternError } = require(require('node:path').join(AV_LIB, 'scout-block/broad-pattern-detector.cjs'));

  const { createHookTimer, logHookCrash } = require(require('node:path').join(AV_LIB, 'hook-logger.cjs'));
  const { claudeConfigDir } = require(require('node:path').join(AV_LIB, 'provider-paths.cjs'));

  try {
    const timer = createHookTimer('scout-block', { event: 'PreToolUse' });
    // Read stdin synchronously
    const hookInput = fs.readFileSync(0, 'utf-8');

    // Validate input not empty
    if (!hookInput || hookInput.trim().length === 0) {
      console.error('ERROR: Empty input');
      timer.end({ status: 'error', exit: 2, note: 'empty-input' });
      process.exit(2);
    }

    // Parse JSON
    let data;
    try {
      data = JSON.parse(hookInput);
    } catch (parseError) {
      // Fail-open for unparseable input
      console.error('WARN: JSON parse failed, allowing operation');
      timer.end({ status: 'warn', exit: 0, note: 'json-parse-failed', error: parseError.message });
      process.exit(0);
    }

    // Validate structure
    if (!data.tool_input || typeof data.tool_input !== 'object') {
      // Fail-open for invalid structure
      console.error('WARN: Invalid JSON structure, allowing operation');
      timer.end({ status: 'warn', exit: 0, note: 'invalid-structure' });
      process.exit(0);
    }

    const toolInput = data.tool_input;
    const toolName = data.tool_name || 'unknown';
    // Resolved, not assumed: ariadnev installs hooks one level deeper than the
    // layout this line was written for, and a wrong .claude root turns the
    // pattern file into a missing file — which fails open, silently.
    const claudeDir = claudeConfigDir(__dirname, typeof data.cwd === 'string' && data.cwd.trim() ? data.cwd : process.cwd());
    const payloadCwd = typeof data.cwd === 'string' && data.cwd.trim()
      ? data.cwd
      : process.cwd();

    // Use shared scout checker
    const result = checkScoutBlock({
      toolName,
      toolInput,
      options: {
        claudeDir,
        cwd: payloadCwd,
        projectConfigDirName: '.claude',
        ckignorePath: path.join(claudeDir, '.avignore'),
        checkBroadPatterns: true
      }
    });

    // Handle allowed commands
    if (result.isAllowedCommand) {
      timer.end({ tool: toolName, status: 'ok', exit: 0, note: 'allowed-command' });
      process.exit(0);
    }

    // Handle broad pattern blocks
    if (result.blocked && result.isBroadPattern) {
      const errorMsg = formatBroadPatternError({
        blocked: true,
        reason: result.reason,
        suggestions: result.suggestions
      }, claudeDir);
      console.error(errorMsg);
      timer.end({
        tool: toolName,
        status: 'block',
        exit: 2,
        target: result.pattern || toolInput.path || toolInput.file_path || '',
        note: result.reason || 'broad-pattern'
      });
      process.exit(2);
    }

    // Handle pattern blocks
    if (result.blocked) {
      const errorMsg = formatBlockedError({
        path: result.path,
        pattern: result.pattern,
        tool: toolName,
        claudeDir: claudeDir,
        configPath: result.configPath
      });
      console.error(errorMsg);
      timer.end({
        tool: toolName,
        status: 'block',
        exit: 2,
        target: result.path || '',
        note: result.pattern || 'blocked-path'
      });
      process.exit(2);
    }

    // All paths allowed
    timer.end({ tool: toolName, status: 'ok', exit: 0 });
    process.exit(0);

  } catch (error) {
    // Fail-open for unexpected errors
    console.error('WARN: Hook error, allowing operation -', error.message);
    logHookCrash('scout-block', error, { event: 'PreToolUse' });
    process.exit(0);
  }
} catch (e) {
  try {
    const { logHookCrash } = require(require('node:path').join(AV_LIB, 'hook-logger.cjs'));
    logHookCrash('scout-block', e, { event: 'PreToolUse' });
  } catch (_) {}
  process.exit(0); // fail-open
}
