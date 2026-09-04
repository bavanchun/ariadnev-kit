'use strict';

// The two runtimes that read hook stdout do not accept the same envelope, and
// Codex's schemas are `additionalProperties: false` — a key in the wrong place
// fails the whole decision rather than being ignored. So the shapes are pinned
// here by event, and the three placements that are wrong on both runtimes are
// asserted to throw rather than to be emitted and rejected downstream.

const test = require('node:test');
const assert = require('node:assert');

const {
  contextPayload,
  decisionPayload,
  emitContext,
  emitDecision,
  emitPlainContext,
  plainContextPayload
} = require('../hook-output.cjs');

const CLAUDE = 'claude-code';
const CODEX = 'codex';

test('context injection is the same wrapped shape on both runtimes', () => {
  for (const event of ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'SubagentStart']) {
    for (const runtime of [CLAUDE, CODEX]) {
      assert.deepStrictEqual(
        JSON.parse(contextPayload(event, 'hello', runtime)),
        { hookSpecificOutput: { hookEventName: event, additionalContext: 'hello' } },
        `${event} on ${runtime}`
      );
    }
  }
});

test('additionalContext is never a top-level key', () => {
  for (const runtime of [CLAUDE, CODEX]) {
    const parsed = JSON.parse(contextPayload('PostToolUse', 'warn', runtime));
    assert.strictEqual(parsed.additionalContext, undefined);
  }
});

test('loose-text context stays text for claude-code and is wrapped for codex', () => {
  // Both shapes are valid on Claude Code, so which one a hook emits is a fact
  // about that hook, not about the event — hence the separate entry point.
  for (const event of ['SessionStart', 'UserPromptSubmit']) {
    assert.strictEqual(plainContextPayload(event, 'line one\nline two', CLAUDE), 'line one\nline two\n');
    assert.deepStrictEqual(JSON.parse(plainContextPayload(event, 'line one\nline two', CODEX)), {
      hookSpecificOutput: { hookEventName: event, additionalContext: 'line one\nline two' }
    });
  }
});

test('a hook already emitting the envelope keeps it on both runtimes', () => {
  assert.deepStrictEqual(JSON.parse(contextPayload('UserPromptSubmit', 'x', CLAUDE)), {
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: 'x' }
  });
});

test('an unknown runtime is treated as claude-code, the runtime the corpus was written for', () => {
  assert.strictEqual(plainContextPayload('SessionStart', 'text', null), 'text\n');
  assert.strictEqual(plainContextPayload('SessionStart', 'text', 'something-else'), 'text\n');
});

test('empty context emits nothing at all, on either runtime', () => {
  for (const runtime of [CLAUDE, CODEX]) {
    assert.strictEqual(plainContextPayload('SessionStart', '', runtime), '');
    assert.strictEqual(contextPayload('PostToolUse', '   ', runtime), '');
  }
});

test('a decision carries only its own top-level keys', () => {
  assert.deepStrictEqual(JSON.parse(decisionPayload('Stop', { continue: true, systemMessage: 'note' }, CODEX)), {
    continue: true,
    systemMessage: 'note'
  });
});

test('permissionDecision at the top level is refused, not emitted', () => {
  // The exact shape issue #134 reproduces: Codex reads it as an unknown key and
  // rejects the decision, so a deny silently becomes a hook failure.
  assert.throws(() => decisionPayload('PreToolUse', { permissionDecision: 'deny', reason: 'no' }, CODEX), /permissionDecision/);
  assert.throws(() => decisionPayload('PreToolUse', { permissionDecision: 'deny' }, CLAUDE), /permissionDecision/);
});

test('additionalContext smuggled into a decision is refused', () => {
  assert.throws(() => decisionPayload('PostToolUse', { continue: true, additionalContext: 'x' }, CODEX), /additionalContext/);
});

test('PermissionRequest refuses the fields the schema fails closed on', () => {
  for (const key of ['interrupt', 'updatedInput', 'updatedPermissions']) {
    assert.throws(
      () => decisionPayload('PermissionRequest', { [key]: true }, CODEX),
      new RegExp(key),
      `${key} must not reach a PermissionRequest decision`
    );
  }
  // The same keys are legal elsewhere — updatedInput belongs inside PreToolUse's
  // hookSpecificOutput, and the guard must not spread to events it does not own.
  assert.doesNotThrow(() => decisionPayload('PreToolUse', { continue: true }, CODEX));
});

test('a permission decision goes inside hookSpecificOutput where the schema puts it', () => {
  assert.deepStrictEqual(JSON.parse(decisionPayload('PreToolUse', {}, CODEX, { permissionDecision: 'deny', permissionDecisionReason: 'secret path' })), {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'secret path'
    }
  });
});

test('emit writes exactly what the payload builder returned', () => {
  const written = [];
  const out = emitContext('PostToolUse', 'warn', { runtime: CODEX, write: (s) => written.push(s) });
  assert.strictEqual(written.join(''), out);
  assert.strictEqual(out, contextPayload('PostToolUse', 'warn', CODEX));

  written.length = 0;
  emitDecision('Stop', { continue: true }, { runtime: CLAUDE, write: (s) => written.push(s) });
  assert.strictEqual(written.join(''), decisionPayload('Stop', { continue: true }, CLAUDE));
});

test('emitting nothing writes nothing', () => {
  const written = [];
  emitContext('PostToolUse', '', { runtime: CODEX, write: (s) => written.push(s) });
  emitPlainContext('SessionStart', '', { runtime: CODEX, write: (s) => written.push(s) });
  assert.deepStrictEqual(written, []);
});

test('the plain emitter writes exactly what its payload builder returned', () => {
  const written = [];
  const out = emitPlainContext('SessionStart', 'ctx', { runtime: CODEX, write: (s) => written.push(s) });
  assert.strictEqual(written.join(''), out);
  assert.strictEqual(out, plainContextPayload('SessionStart', 'ctx', CODEX));
});
