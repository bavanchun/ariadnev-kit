/**
 * Where the provider keeps its configuration, resolved rather than assumed.
 *
 * The kit these hooks came from installed them at `.claude/hooks/<name>.cjs`, so
 * a hook could say `path.dirname(__dirname)` and land on `.claude`. ariadnev
 * installs into `<config>/hooks/av/`, one level deeper, so that expression lands
 * on `hooks` instead — and every path built from it silently points at a file
 * that is not there. Nothing reports it: the hooks fail open, so a guard whose
 * pattern file "does not exist" simply stops guarding.
 *
 * The installer writes a runtime marker beside `_lib`, at the root of the tree
 * it owns, so that root is knowable rather than guessed: find the marker, strip
 * the `hooks/av` it was installed under, and the answer holds for a provider
 * whose config dir is not named `.claude` at all.
 *
 * A tree with no marker predates it, or is the kit checkout itself. There the
 * old walk for a directory literally named `.claude` is still the best available
 * answer, so it stays as the fallback rather than being replaced.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const RUNTIME_MARKER_FILE = '.ariadnev-runtime.json';

/** How deep `hooksDir` sits below the provider config dir: `hooks/av`. */
const HOOKS_DEPTH_BELOW_CONFIG = 2;

function isFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/**
 * The directory holding the installer's runtime marker, walking up from `start`.
 *
 * @param {string} start Absolute directory to begin at.
 * @returns {string|null} The owned hooks root, or null in an unmarked tree.
 */
function markedHooksRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (isFile(path.join(dir, RUNTIME_MARKER_FILE))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * @param {string} moduleDirectory Usually `__dirname` of the calling hook.
 * @param {string} [cwd] Project directory, used when the hook is running from
 *   somewhere outside a provider tree (a checkout, a test).
 * @returns {string} Absolute path to the provider config dir.
 */
function claudeConfigDir(moduleDirectory, cwd = process.cwd()) {
  const hooksRoot = markedHooksRoot(moduleDirectory);
  if (hooksRoot !== null) {
    let dir = hooksRoot;
    for (let i = 0; i < HOOKS_DEPTH_BELOW_CONFIG; i += 1) dir = path.dirname(dir);
    return dir;
  }
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
