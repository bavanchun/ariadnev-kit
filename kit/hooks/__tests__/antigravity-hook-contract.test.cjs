'use strict';

// The provider contract for hooks running under antigravity.
//
// agy reads one thing: a JSON object on stdout, in a vocabulary of its own per
// event. It does not read the exit code, and none of its five events carries
// injected context. So the two shapes the corpus was written around both fail
// silently here — a deny sent as exit 2 with the reason on stderr is not a deny
// at all, and a `{"continue": true}` written straight to stdout answers a
// PostToolUse contract that asks for `{}`.
//
// Nothing in this file passes by inspecting the emitter. Each hook is run the
// way a runtime runs it: a fresh `node` process, the payload on stdin, the
// answer read from the exit code and stdout, against a sandboxed copy of the
// tree carrying the marker an install plants.

const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOKS_DIR = path.join(__dirname, '..');

/** The decisions agy's PreToolUse accepts. Anything else is not an answer. */
const TOOL_DECISIONS = new Set(['allow', 'deny', 'ask', 'force_ask']);

function sandbox(runtime) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'av-agycontract-'));
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  fs.mkdirSync(path.join(home, '.ariadnev'), { recursive: true });
  fs.mkdirSync(path.join(project, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(project, 'package.json'), '{"name":"sandbox"}\n');
  const hooks = path.join(root, 'hooks');
  // `.logs` is written by whatever hook ran last and is not part of the corpus.
  // Copying it races every other suite that runs a hook from this same checkout:
  // the directory can be created or removed between the walk and the read, and
  // `cpSync` fails the whole copy on an entry that vanished under it.
  fs.cpSync(HOOKS_DIR, hooks, {
    recursive: true,
    filter: (src) => path.basename(src) !== '.logs'
  });
  fs.writeFileSync(
    path.join(hooks, '.ariadnev-runtime.json'),
    `${JSON.stringify({ schemaVersion: 1, runtime })}\n`
  );
  return { root, home, project, hooks };
}

function runHook(box, name, payload) {
  const result = spawnSync(process.execPath, [path.join(box.hooks, name, 'hook.cjs')], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, HOME: box.home },
    cwd: payload.cwd || box.project,
    timeout: 15000
  });
  return { code: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

/** The one .env-shaped path both guards agree is off limits. */
function plantSecret(box) {
  const file = path.join(box.project, '.env');
  fs.writeFileSync(file, 'TOKEN=redacted\n');
  return file;
}

test('a blocked read is denied on stdout, in agy own spelling', () => {
  const box = sandbox('antigravity');
  const { code, stdout, stderr } = runHook(box, 'privacy-block', {
    hook_event_name: 'PreToolUse',
    cwd: box.project,
    tool_name: 'Read',
    tool_input: { file_path: plantSecret(box) }
  });

  const parsed = JSON.parse(stdout);
  assert.strictEqual(parsed.decision, 'deny', 'agy blocks by decision, and reads nothing else');
  assert.ok(TOOL_DECISIONS.has(parsed.decision));
  assert.ok(typeof parsed.reason === 'string' && parsed.reason.length > 0, 'a deny must say why');
  assert.ok(!('hookSpecificOutput' in parsed), 'the nested envelope is Claude Code shape, not agy');
  assert.strictEqual(code, 0, 'a non-zero exit marks the hook failed on a runtime that never reads it');
  assert.ok(stderr.trim().length > 0, 'the human-readable message is still written');
});

test('the same block stays an exit code on the runtimes that read one', () => {
  // The branch is per runtime. Two runtimes already treat exit 2 as the deny and
  // a decision object beside it as a malformed answer, and neither may move.
  for (const runtime of ['claude-code', 'codex']) {
    const box = sandbox(runtime);
    const { code, stdout } = runHook(box, 'privacy-block', {
      hook_event_name: 'PreToolUse',
      cwd: box.project,
      tool_name: 'Read',
      tool_input: { file_path: plantSecret(box) }
    });
    assert.strictEqual(code, 2, `${runtime}: the read must be denied`);
    assert.strictEqual(stdout, '', `${runtime}: the reason belongs on stderr`);
  }
});

test('a read inside a generated tree is denied the same way', () => {
  const box = sandbox('antigravity');
  const buried = path.join(box.project, 'node_modules', 'pkg', 'index.js');
  fs.mkdirSync(path.dirname(buried), { recursive: true });
  fs.writeFileSync(buried, 'module.exports = 1;\n');

  const { code, stdout } = runHook(box, 'scout-block', {
    hook_event_name: 'PreToolUse',
    cwd: box.project,
    tool_name: 'Read',
    tool_input: { file_path: buried }
  });

  assert.strictEqual(JSON.parse(stdout).decision, 'deny');
  assert.strictEqual(code, 0);
});

test('an allowed tool call says nothing rather than inventing a decision', () => {
  // `{"decision":"allow"}` would skip a permission prompt the user would
  // otherwise be shown, so a guard with nothing to block stays silent.
  const box = sandbox('antigravity');
  const { code, stdout } = runHook(box, 'scout-block', {
    hook_event_name: 'PreToolUse',
    cwd: box.project,
    tool_name: 'Bash',
    tool_input: { command: "find . -name package.json -not -path '*/node_modules/*'" }
  });
  assert.strictEqual(code, 0);
  assert.strictEqual(stdout.trim(), '');
});

test('every PostToolUse answer is the empty object agy documents', () => {
  // `{"continue": true}` is a Claude Code flow-control key. agy specifies `{}`
  // for this event, and these two hooks wrote their own stdout rather than
  // going through the emitter, so the branch above never reached them.
  const box = sandbox('antigravity');
  const cases = [
    ['session-state', { tool_name: 'TodoWrite', tool_input: {} }],
    ['usage-quota-cache-refresh', { tool_name: 'Read', tool_input: {} }]
  ];
  for (const [name, extra] of cases) {
    const { code, stdout } = runHook(box, name, {
      hook_event_name: 'PostToolUse',
      cwd: box.project,
      session_id: 'abc',
      ...extra
    });
    assert.strictEqual(code, 0, `${name} must not block`);
    if (stdout.trim() === '') continue; // saying nothing is always valid
    assert.deepStrictEqual(JSON.parse(stdout), {}, `${name} answered PostToolUse in the wrong vocabulary`);
  }
});

test('context-only hooks emit nothing, because no agy event carries context', () => {
  const box = sandbox('antigravity');
  const cases = [
    ['cook-after-plan-reminder', { hook_event_name: 'Stop' }],
    ['dev-rules-reminder', { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: path.join(box.project, 'a.ts') } }],
    ['descriptive-name', { hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: path.join(box.project, 'a.ts') } }]
  ];
  for (const [name, payload] of cases) {
    const { code, stdout } = runHook(box, name, { cwd: box.project, session_id: 'abc', ...payload });
    assert.strictEqual(code, 0, `${name} must not block`);
    if (stdout.trim() === '') continue;
    const parsed = JSON.parse(stdout);
    assert.ok(!('hookSpecificOutput' in parsed), `${name}: the Claude Code envelope reached agy`);
    assert.ok(!('additionalContext' in parsed), `${name}: context has no channel here`);
  }
});
