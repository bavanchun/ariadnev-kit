'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { sanitize, sanitizeDeep } = require('../sanitizer.cjs');

// The same file the CLI's own sanitizer test reads. Two runtimes, one corpus:
// a case that only one of them redacts fails here.
const CORPUS = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'packages', 'cli', 'src', 'security', 'redaction-corpus.json'), 'utf8')
);

test('shared corpus: every case redacts the same way the CLI does', () => {
  assert.ok(CORPUS.cases.length >= 8, 'corpus should be substantive');
  for (const testCase of CORPUS.cases) {
    const out = sanitize(testCase.text, testCase.env || {});
    for (const secret of testCase.absent) {
      assert.ok(!out.includes(secret), `${testCase.name}: leaked "${secret}" in: ${out}`);
    }
    for (const kept of testCase.present) {
      assert.ok(out.includes(kept), `${testCase.name}: lost "${kept}" from: ${out}`);
    }
  }
});

test('sanitizeDeep reaches strings nested in a log entry', () => {
  const entry = {
    event: 'Stop',
    detail: { target: 'https://hooks.slack.com/services/T0/B0/SUPERSECRETVALUE00' },
    attempts: [{ error: 'POST https://discord.com/api/webhooks/7/anotherSecretValue failed' }],
    count: 3
  };
  const clean = sanitizeDeep(entry, {});
  const text = JSON.stringify(clean);
  assert.ok(!text.includes('SUPERSECRETVALUE00'));
  assert.ok(!text.includes('anotherSecretValue'));
  assert.strictEqual(clean.count, 3, 'non-strings pass through unchanged');
  assert.ok(text.includes('hooks.slack.com/services/'), 'the destination stays identifiable');
});

test('a non-string input is returned untouched rather than thrown on', () => {
  assert.strictEqual(sanitize(undefined, {}), undefined);
  assert.strictEqual(sanitize(42, {}), 42);
});
