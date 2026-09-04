'use strict';

// The two runtimes that read hook stdout do not accept the same envelope, and
// Codex's schemas are `additionalProperties: false` — a key in the wrong place
// fails the whole decision rather than being ignored. So the shapes are pinned
// here by event, and the three placements that are wrong on both runtimes are
// asserted to throw rather than to be emitted and rejected downstream.

const test = require('node:test');
const assert = require('node:assert');

const {
  blockPayload,
  contextPayload,
  decisionPayload,
  emitBlock,
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

// Antigravity is the third runtime, and it is not a stricter reading of the
// first two. Each of its five events answers in a vocabulary of its own:
// `PreToolUse` takes a top-level `decision` of allow/deny/ask/force_ask,
// `PostToolUse` expects `{}`, and `Stop` is blocked by answering `continue` —
// the word Claude Code uses for the opposite. None of the five carries injected
// context, so a hook with only context to offer says nothing rather than
// emitting an envelope the runtime has no field for.

const ANTIGRAVITY = 'antigravity';

test('antigravity has no context channel on the tool and stop events', () => {
  for (const event of ['PreToolUse', 'Stop']) {
    assert.strictEqual(contextPayload(event, 'hello', ANTIGRAVITY), '', event);
    assert.strictEqual(plainContextPayload(event, 'hello', ANTIGRAVITY), '', event);
  }
});

test('a PostToolUse answer to antigravity is the empty object its contract asks for', () => {
  assert.deepStrictEqual(JSON.parse(contextPayload('PostToolUse', 'warn', ANTIGRAVITY)), {});
  assert.deepStrictEqual(JSON.parse(decisionPayload('PostToolUse', { continue: true }, ANTIGRAVITY)), {});
});

test('a permission decision becomes antigravity top-level decision and reason', () => {
  assert.deepStrictEqual(
    JSON.parse(decisionPayload('PreToolUse', {}, ANTIGRAVITY, {
      permissionDecision: 'deny',
      permissionDecisionReason: 'secret path'
    })),
    { decision: 'deny', reason: 'secret path' }
  );
  for (const decision of ['allow', 'ask']) {
    assert.deepStrictEqual(
      JSON.parse(decisionPayload('PreToolUse', {}, ANTIGRAVITY, { permissionDecision: decision })),
      { decision }
    );
  }
});

test('a PreToolUse hook with no decision does not invent one', () => {
  // `{"decision":"allow"}` would skip the permission prompt the user would
  // otherwise be shown, so having nothing to say is said by saying nothing.
  assert.strictEqual(decisionPayload('PreToolUse', { continue: true }, ANTIGRAVITY), '');
  assert.strictEqual(decisionPayload('PreToolUse', {}, ANTIGRAVITY, { updatedInput: { a: 1 } }), '');
});

test('blocking a stop is `continue` on antigravity and `block` on claude-code', () => {
  const blocked = { decision: 'block', reason: 'tests still running' };
  assert.deepStrictEqual(JSON.parse(decisionPayload('Stop', blocked, ANTIGRAVITY)), {
    decision: 'continue',
    reason: 'tests still running'
  });
  assert.deepStrictEqual(JSON.parse(decisionPayload('Stop', blocked, CLAUDE)), blocked);
});

test('a stop that is not being blocked says nothing to antigravity', () => {
  // Any decision other than `continue` lets the agent stop, and a passing
  // `systemMessage` has nowhere to go: agy carries `reason` only when it is
  // continuing, so naming a decision here would be inventing one.
  assert.strictEqual(decisionPayload('Stop', { continue: true, systemMessage: 'note' }, ANTIGRAVITY), '');
});

test('an event antigravity does not dispatch produces nothing under it', () => {
  for (const event of ['SessionStart', 'UserPromptSubmit', 'SubagentStart', 'PreCompact']) {
    assert.strictEqual(contextPayload(event, 'hello', ANTIGRAVITY), '', event);
    assert.strictEqual(plainContextPayload(event, 'hello', ANTIGRAVITY), '', event);
    assert.strictEqual(decisionPayload(event, { continue: true }, ANTIGRAVITY), '', event);
  }
});

test('the misplacement guards apply on antigravity too', () => {
  assert.throws(() => decisionPayload('PreToolUse', { permissionDecision: 'deny' }, ANTIGRAVITY), /permissionDecision/);
  assert.throws(() => decisionPayload('PostToolUse', { additionalContext: 'x' }, ANTIGRAVITY), /additionalContext/);
});

test('the other two runtimes keep the shapes they had', () => {
  // The branch is per runtime, not per event: adding a third vocabulary must
  // not move a byte of what the first two already receive.
  assert.deepStrictEqual(JSON.parse(contextPayload('PostToolUse', 'warn', CODEX)), {
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: 'warn' }
  });
  assert.deepStrictEqual(JSON.parse(decisionPayload('Stop', { continue: true }, CLAUDE)), { continue: true });
});


// A tool-blocking hook does not reach the emitter at all on the runtime it was
// written for: Claude Code and Codex both read a deny as exit 2 with the reason
// on stderr, and emitting JSON beside it is what turned a deny into `Hook
// failed` in the first place. Antigravity has no such channel — stdout is the
// only thing it reads — so the same block has to become a decision object
// there, and the exit code has to stop being the message.

test('a block is exit 2 and silent stdout on the runtimes that read exit codes', () => {
  for (const runtime of [CLAUDE, CODEX]) {
    assert.deepStrictEqual(blockPayload('PreToolUse', 'reading .env', runtime), { stdout: '', exitCode: 2 }, runtime);
  }
});

test('a block antigravity can see is a deny on stdout, and not an exit code', () => {
  // agy never looks at the exit code, so leaving it at 2 would mark the hook
  // failed while the deny it carries is the whole point of running it.
  const { stdout, exitCode } = blockPayload('PreToolUse', 'reading .env', ANTIGRAVITY);
  assert.deepStrictEqual(JSON.parse(stdout), { decision: 'deny', reason: 'reading .env' });
  assert.strictEqual(exitCode, 0);
});

test('a block with no reason still denies', () => {
  assert.deepStrictEqual(JSON.parse(blockPayload('PreToolUse', '', ANTIGRAVITY).stdout), { decision: 'deny' });
});

test('emitBlock writes the payload and hands back the code to exit with', () => {
  const written = [];
  const code = emitBlock('PreToolUse', 'reading .env', {
    runtime: ANTIGRAVITY,
    write: (s) => written.push(s)
  });
  assert.strictEqual(code, 0);
  assert.deepStrictEqual(JSON.parse(written.join('')), { decision: 'deny', reason: 'reading .env' });

  const quiet = [];
  assert.strictEqual(emitBlock('PreToolUse', 'reading .env', { runtime: CODEX, write: (s) => quiet.push(s) }), 2);
  assert.deepStrictEqual(quiet, [], 'stdout stays empty where the exit code carries the deny');
});

// The failure mode a silent return would create: on antigravity, an event with
// no deny in its vocabulary produces no output, and no output there means the
// call proceeds. The same call is still a hard exit 2 on the other two, so the
// hook would block on two runtimes and wave the tool through on the third,
// without either side saying so. Only PreToolUse has a deny; anything else
// asking for one is a mistake in the hook, and it should be loud.
test('blocking an event antigravity has no deny for is an error, not a silent allow', () => {
  assert.throws(
    () => blockPayload('Stop', 'nope', 'antigravity'),
    /PreToolUse/,
  );
});

test('the same event still blocks by exit code on the runtimes that read one', () => {
  assert.deepEqual(blockPayload('Stop', 'nope', 'claude-code'), { stdout: '', exitCode: 2 });
  assert.deepEqual(blockPayload('Stop', 'nope', 'codex'), { stdout: '', exitCode: 2 });
});
