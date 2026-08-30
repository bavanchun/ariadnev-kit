'use strict';

// The Bash path of the privacy guard. `extractPaths` is pure, so these run
// in-process: each case is a command the model might run, and the answer is
// the list of dotenv-shaped paths the guard should see in it — no more (a
// false block on `process.env.X` stalls the turn) and no fewer (a quoted or
// substituted `.env` read that slips past is the whole point of the guard).

const test = require('node:test');
const assert = require('node:assert');

const { extractPaths } = require('../privacy-checker.cjs');
const { splitCommandSegments, lexShellWords } = require('../shell-command-segments.cjs');

function commandPaths(command) {
  return extractPaths({ command }).map((p) => p.value);
}

test('source text that mentions process.env is code, not a file', () => {
  assert.deepStrictEqual(commandPaths('node -e "console.log(process.env.API_KEY)"'), []);
  assert.deepStrictEqual(commandPaths("node --eval='process.env.SECRET && 1'"), []);
  assert.deepStrictEqual(commandPaths('bun -e "Bun.env.TOKEN"'), []);
  assert.deepStrictEqual(commandPaths('deno eval "Deno.env.get(\'X\')"'), []);
  assert.deepStrictEqual(commandPaths('node -p "import.meta.env.MODE"'), []);
  assert.deepStrictEqual(commandPaths('grep -rn "process.env.DB_URL" src'), []);
});

test('an evaluator that opens a dotenv file is still seen', () => {
  assert.deepStrictEqual(
    commandPaths('node -e \'require("fs").readFileSync(".env.production")\''),
    ['.env.production']
  );
  assert.deepStrictEqual(commandPaths('deno eval -L debug "Deno.readTextFile(\'.env\')"'), ['.env']);
});

test('plain, quoted, and assigned dotenv paths are all found', () => {
  assert.deepStrictEqual(commandPaths('cat .env'), ['.env']);
  assert.deepStrictEqual(commandPaths('cat ".env.local"'), ['.env.local']);
  assert.deepStrictEqual(commandPaths("cat './config/.env'"), ['./config/.env']);
  assert.deepStrictEqual(commandPaths('FILE=.env.staging cat "$FILE"'), ['.env.staging']);
  assert.deepStrictEqual(commandPaths('cat APPROVED:.env'), ['APPROVED:.env']);
});

test('shell punctuation no longer sticks to the filename', () => {
  assert.deepStrictEqual(commandPaths('cat .env; echo done'), ['.env']);
  assert.deepStrictEqual(commandPaths('(cat .env)'), ['.env']);
  assert.deepStrictEqual(commandPaths('cat .env>out.txt'), ['.env']);
  assert.deepStrictEqual(commandPaths('cat .env|wc -l'), ['.env']);
});

test('command substitutions and env -S are executable contexts too', () => {
  assert.deepStrictEqual(commandPaths('echo "$(cat .env)"'), ['.env']);
  // Seen once from the outer segment and once from the recursed substitution;
  // the checker stops at the first hit, so the repeat is harmless.
  assert.ok(commandPaths('echo $(cat "$(pwd)/.env.local")').includes('$(pwd)/.env.local'));
  assert.deepStrictEqual(commandPaths('env -S "cat .env.local"'), ['.env.local']);
  assert.deepStrictEqual(commandPaths('env --split-string="cat .env"'), ['.env']);
});

test('an unquoted newline separates commands; a quoted one does not', () => {
  assert.deepStrictEqual(commandPaths('npm run build\ncat .env'), ['.env']);
  assert.deepStrictEqual(commandPaths('echo "line one\n.env in text"'), []);
});

test('prose containing .env is not a path', () => {
  assert.deepStrictEqual(commandPaths('echo "no .env here"'), []);
  assert.deepStrictEqual(commandPaths('echo the .environment is fine'), []);
});

test('safe template files are still reported so the approval flow can allow them', () => {
  assert.deepStrictEqual(commandPaths('cp .env.example .env'), ['.env.example', '.env']);
});

test('direct-path fields are untouched by the command lexer', () => {
  assert.deepStrictEqual(
    extractPaths({ file_path: '/p/.env', command: 'ls' }),
    [{ value: '/p/.env', field: 'file_path' }]
  );
});

test('lexShellWords keeps quoted spans as one word and drops the quotes', () => {
  assert.deepStrictEqual(
    lexShellWords('cat "a b" \'c d\' e\\ f').map((w) => w.value),
    ['cat', 'a b', 'c d', 'e f']
  );
});

test('splitCommandSegments recurses into nested substitutions', () => {
  const segments = splitCommandSegments('a && echo $(b $(d))');
  assert.ok(segments.includes('a'));
  assert.ok(segments.includes('b $(d)'));
  assert.ok(segments.includes('d'));
});
