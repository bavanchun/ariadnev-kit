/**
 * Where the provider keeps its configuration, resolved rather than assumed.
 *
 * The kit these hooks came from installed them at `.claude/hooks/<name>.cjs`, so
 * a hook could say `path.dirname(__dirname)` and land on `.claude`. ariadnev
 * installs into `.claude/hooks/av/`, one level deeper, so that expression lands
 * on `.claude/hooks` instead — and every path built from it silently points at a
 * file that is not there. Nothing reports it: the hooks fail open, so a guard
 * whose pattern file "does not exist" simply stops guarding.
 *
 * Walking up for the directory actually named `.claude` survives both layouts,
 * and any future one.
 */

'use strict';

const path = require('path');

/**
 * @param {string} moduleDirectory Usually `__dirname` of the calling hook.
 * @param {string} [cwd] Project directory, used when the hook is running from
 *   somewhere outside a provider tree (a checkout, a test).
 * @returns {string} Absolute path to the provider config dir.
 */
function claudeConfigDir(moduleDirectory, cwd = process.cwd()) {
  let dir = path.resolve(moduleDirectory);
  for (;;) {
    if (path.basename(dir) === '.claude') return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.join(cwd, '.claude');
}

module.exports = { claudeConfigDir };
