'use strict';

// Which runtimes the session-state family will work for at all.
//
// The marker is the only thing that tells an installed hook which runtime
// launched it, and every guard in this module rejects a record whose runtime is
// not on the list. That rejection is silent by design — the hooks fail open —
// so a provider missing from the list installs cleanly, runs, and writes
// nothing, which looks exactly like a provider with nothing to write.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  SUPPORTED_RUNTIMES,
  createCandidateSessionStateContext,
  isSessionStateContext,
  readRuntimeMarker
} = require('../runtime-state-identity.cjs');

const INSTALLED_RUNTIMES = ['claude-code', 'codex', 'antigravity'];

function markerFile(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'av-runtime-marker-'));
  const file = path.join(dir, '.ariadnev-runtime.json');
  fs.writeFileSync(file, contents);
  return file;
}

test('every runtime the installer writes a marker for is one this module accepts', () => {
  // The installer writes the provider id into the marker, so the two lists are
  // one list: a provider whose hooks install but whose id is missing here is a
  // hook tree that runs and records nothing.
  for (const runtime of INSTALLED_RUNTIMES) {
    assert.ok(SUPPORTED_RUNTIMES.has(runtime), runtime);
    assert.strictEqual(readRuntimeMarker(markerFile(JSON.stringify({ schemaVersion: 1, runtime }))), runtime);
  }
});

test('a marker naming something else, or a schema this build does not know, is refused', () => {
  assert.strictEqual(readRuntimeMarker(markerFile(JSON.stringify({ schemaVersion: 1, runtime: 'gemini' }))), null);
  assert.strictEqual(readRuntimeMarker(markerFile(JSON.stringify({ schemaVersion: 2, runtime: 'codex' }))), null);
  assert.strictEqual(readRuntimeMarker(markerFile('not json')), null);
  assert.strictEqual(readRuntimeMarker(path.join(os.tmpdir(), 'av-runtime-marker-absent', 'x.json')), null);
});

test('a session-state context is buildable for each of those runtimes', () => {
  for (const runtime of INSTALLED_RUNTIMES) {
    const context = createCandidateSessionStateContext({
      sessionId: 'session-1',
      cwd: process.cwd(),
      runtime,
      userKey: 'test-user'
    });
    assert.ok(context, runtime);
    assert.strictEqual(context.runtime, runtime);
    assert.ok(isSessionStateContext(context), runtime);
  }
});
