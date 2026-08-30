'use strict';

// Compound-command handling in the scout guard. The allowlist pattern for
// build commands has no end anchor, so everything hinges on the split: a
// separator the splitter does not know is a way to hide a read behind an
// allowlisted head.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { checkScoutBlock, splitCompoundCommand } = require('../scout-checker.cjs');
const { extractFromCommand } = require('../scout-block/path-extractor.cjs');

function scoutOptions() {
  // No .avignore anywhere in the sandbox: the default pattern set applies.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'av-scout-'));
  return { ckignorePath: path.join(root, '.avignore'), cwd: root };
}

test('a lone pipe or ampersand is a command boundary', () => {
  assert.deepStrictEqual(
    splitCompoundCommand('npm run build | cat node_modules/x.js'),
    ['npm run build', 'cat node_modules/x.js']
  );
  assert.deepStrictEqual(
    splitCompoundCommand('npm run build & cat dist/a.js'),
    ['npm run build', 'cat dist/a.js']
  );
  assert.deepStrictEqual(splitCompoundCommand('a && b || c ; d'), ['a', 'b', 'c', 'd']);
});

test('redirect ampersands are not separators', () => {
  assert.deepStrictEqual(splitCompoundCommand('npm test 2>&1'), ['npm test 2>&1']);
  assert.deepStrictEqual(splitCompoundCommand('npm test &>out.log'), ['npm test &>out.log']);
});

test('operators inside quotes or behind a backslash are literal', () => {
  assert.deepStrictEqual(splitCompoundCommand("grep 'a|b' file"), ["grep 'a|b' file"]);
  assert.deepStrictEqual(splitCompoundCommand('echo "x && y"'), ['echo "x && y"']);
  assert.deepStrictEqual(splitCompoundCommand('echo a\\|b'), ['echo a\\|b']);
  assert.deepStrictEqual(splitCompoundCommand('echo "a \\" | b"'), ['echo "a \\" | b"']);
});

test('an unterminated quote fails closed to the quote-blind split', () => {
  assert.deepStrictEqual(splitCompoundCommand('echo "a | b'), ['echo "a', 'b']);
});

test('newlines are not separators here', () => {
  assert.deepStrictEqual(splitCompoundCommand('cat <<EOF\na | b\nEOF'), ['cat <<EOF\na', 'b\nEOF']);
  assert.deepStrictEqual(splitCompoundCommand('echo one\necho two'), ['echo one\necho two']);
});

test('a generated-tree read piped after a build command is still blocked', () => {
  const result = checkScoutBlock({
    toolName: 'Bash',
    toolInput: { command: 'npm run build | cat node_modules/left-pad/index.js' },
    options: scoutOptions()
  });
  assert.strictEqual(result.blocked, true);
  assert.match(result.path || '', /node_modules/);
});

test('a chain made only of build commands is allowed as a whole', () => {
  const result = checkScoutBlock({
    toolName: 'Bash',
    toolInput: { command: 'npm run build && npm test | cat' },
    options: scoutOptions()
  });
  assert.strictEqual(result.blocked, false);
});

test('an unquoted sed substitution is not a path', () => {
  const generated = /dist|build|node_modules|vendor/;
  // The target file after the expression is still a path — only the
  // substitution itself is skipped.
  assert.deepStrictEqual(extractFromCommand('sed s/dist/build/ file.txt'), ['file.txt']);
  assert.ok(!extractFromCommand('sed -i s|node_modules|vendor| notes.md').some((p) => generated.test(p)));
  assert.ok(!extractFromCommand('awk s,build,out, README').some((p) => generated.test(p)));
});

test('the sed skip is scoped to filter commands and to the substitution shape', () => {
  // A trailing unquoted argument to sed is usually the target file.
  assert.ok(extractFromCommand('sed -n p dist/out.js').some((p) => p.includes('dist')));
  // The same token after a filesystem command is a path.
  assert.ok(extractFromCommand('cat s/dist/build/').some((p) => p.includes('dist')));
});
