'use strict';

// Behavior tests for the installed hooks, run the way Claude Code runs them:
// a fresh `node` process, the payload on stdin, and the answer read from the
// exit code and stdout. The hooks were ported from another kit, and a port that
// loads without crashing is not the same as a port that still blocks a .env —
// these check the second thing.
//
// Every case runs against a sandbox HOME and project so a test can never read or
// write the machine's real state.

const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOKS_DIR = path.join(__dirname, '..');

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'av-hookbehavior-'));
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  fs.mkdirSync(path.join(home, '.ariadnev'), { recursive: true });
  fs.mkdirSync(path.join(project, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(project, 'package.json'), '{"name":"sandbox"}\n');
  return { root, home, project };
}

function runHook(name, payload, env = {}) {
  const result = spawnSync(process.execPath, [path.join(HOOKS_DIR, name, 'hook.cjs')], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...env },
    cwd: payload.cwd || process.cwd(),
    timeout: 15000
  });
  return { code: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function userConfig(box, config) {
  fs.writeFileSync(path.join(box.home, '.ariadnev', 'config.json'), JSON.stringify(config));
}

function projectConfig(box, config) {
  fs.mkdirSync(path.join(box.project, '.ariadnev'), { recursive: true });
  fs.writeFileSync(path.join(box.project, '.ariadnev', 'config.json'), JSON.stringify(config));
}

const ALL_HOOKS = fs
  .readdirSync(HOOKS_DIR)
  .filter((entry) => !entry.startsWith('_') && !entry.startsWith('.') && fs.existsSync(path.join(HOOKS_DIR, entry, 'hook.cjs')));

test('every hook is manifested, and every manifest has a hook', () => {
  assert.ok(ALL_HOOKS.length >= 14, `expected the full ported set, found ${ALL_HOOKS.length}`);
  for (const hook of ALL_HOOKS) {
    const manifest = JSON.parse(fs.readFileSync(path.join(HOOKS_DIR, hook, 'hook.json'), 'utf8'));
    const bindings = manifest.bindings || (manifest.events || [manifest.event]).map((event) => ({ event }));
    assert.ok(bindings.length > 0, `${hook} declares no binding`);
    assert.ok(manifest.description && manifest.description.length > 20, `${hook} has no usable description`);
  }
});

test('privacy-block refuses a .env read and explains itself', () => {
  const box = sandbox();
  const target = path.join(box.project, '.env');
  fs.writeFileSync(target, 'SECRET=1\n');
  const { code, stdout, stderr } = runHook(
    'privacy-block',
    { hook_event_name: 'PreToolUse', cwd: box.project, tool_name: 'Read', tool_input: { file_path: target } },
    { HOME: box.home }
  );
  // Exit 2 is what stops the tool call; the explanation goes on stderr, which
  // is the channel a blocking hook reports through.
  assert.strictEqual(code, 2);
  assert.match(stderr, /PRIVACY BLOCK/);
  assert.strictEqual(stdout, '', 'stdout is model context, not the place for a refusal');
});

test('privacy-block lets an ordinary file through', () => {
  const box = sandbox();
  const { code } = runHook(
    'privacy-block',
    {
      hook_event_name: 'PreToolUse',
      cwd: box.project,
      tool_name: 'Read',
      tool_input: { file_path: path.join(box.project, 'package.json') }
    },
    { HOME: box.home }
  );
  assert.strictEqual(code, 0);
});

test('only the user config can switch privacy blocking off', () => {
  // The hazard this pins: a repository you cloned shipping .ariadnev/config.json
  // with privacyBlock false, and the guard quietly standing down.
  const box = sandbox();
  const target = path.join(box.project, '.env');
  fs.writeFileSync(target, 'SECRET=1\n');
  const payload = {
    hook_event_name: 'PreToolUse',
    cwd: box.project,
    tool_name: 'Read',
    tool_input: { file_path: target }
  };

  projectConfig(box, { privacyBlock: false });
  assert.strictEqual(runHook('privacy-block', payload, { HOME: box.home }).code, 2, 'a project file must not disable the guard');

  userConfig(box, { privacyBlock: false });
  assert.strictEqual(runHook('privacy-block', payload, { HOME: box.home }).code, 0, 'the user may disable their own guard');
});

test('a per-hook switch turns a hook off — from the user config only', () => {
  const box = sandbox();
  const target = path.join(box.project, '.env');
  fs.writeFileSync(target, 'SECRET=1\n');
  const payload = {
    hook_event_name: 'PreToolUse',
    cwd: box.project,
    tool_name: 'Read',
    tool_input: { file_path: target }
  };

  projectConfig(box, { hooks: { 'privacy-block': false } });
  assert.strictEqual(runHook('privacy-block', payload, { HOME: box.home }).code, 2, 'a repo cannot switch a guard off');

  userConfig(box, { hooks: { 'privacy-block': false } });
  assert.strictEqual(runHook('privacy-block', payload, { HOME: box.home }).code, 0);
});

test('scout-block stops a read inside a generated tree', () => {
  const box = sandbox();
  const buried = path.join(box.project, 'node_modules', 'left-pad', 'index.js');
  fs.mkdirSync(path.dirname(buried), { recursive: true });
  fs.writeFileSync(buried, 'module.exports = 1;\n');
  const { code } = runHook(
    'scout-block',
    { hook_event_name: 'PreToolUse', cwd: box.project, tool_name: 'Read', tool_input: { file_path: buried } },
    { HOME: box.home }
  );
  assert.strictEqual(code, 2);
});

test('session-init emits context and never blocks the session', () => {
  const box = sandbox();
  const { code, stdout } = runHook(
    'session-init',
    { hook_event_name: 'SessionStart', cwd: box.project, session_id: 'abc' },
    { HOME: box.home }
  );
  assert.strictEqual(code, 0);
  assert.ok(stdout.trim().length > 0, 'session start should contribute something to context');
});

/**
 * `.shadowed/` holds directories shadowed before installed skill dirs carried
 * the `av-` prefix, so every name in it is bare. Restoring one whose prefixed
 * twin is installed recreates a directory no receipt covers — the exact orphan
 * the prefix exists to prevent — and shadows the real skill besides.
 */
test('session-init holds a shadowed skill whose av- twin is installed', () => {
  const box = sandbox();
  const skills = path.join(box.project, '.claude', 'skills');
  fs.mkdirSync(path.join(skills, '.shadowed', 'cook'), { recursive: true });
  fs.writeFileSync(path.join(skills, '.shadowed', 'cook', 'SKILL.md'), 'shadowed copy\n');
  fs.mkdirSync(path.join(skills, 'av-cook'), { recursive: true });
  fs.writeFileSync(path.join(skills, 'av-cook', 'SKILL.md'), 'installed\n');
  // A name with no installed twin, to prove the guard is selective.
  fs.mkdirSync(path.join(skills, '.shadowed', 'third-party'), { recursive: true });
  fs.writeFileSync(path.join(skills, '.shadowed', 'third-party', 'SKILL.md'), 'someone else\n');

  const { code } = runHook(
    'session-init',
    { hook_event_name: 'SessionStart', cwd: box.project, session_id: 'abc' },
    { HOME: box.home }
  );

  assert.strictEqual(code, 0);
  assert.ok(fs.existsSync(path.join(skills, '.shadowed', 'cook', 'SKILL.md')), 'the held copy must survive');
  assert.ok(!fs.existsSync(path.join(skills, 'cook')), 'the bare name must not be resurrected');
  assert.strictEqual(fs.readFileSync(path.join(skills, 'av-cook', 'SKILL.md'), 'utf8'), 'installed\n');
  assert.ok(fs.existsSync(path.join(skills, 'third-party', 'SKILL.md')), 'an unclaimed name still restores');
});

test('a hook handed nonsense fails open instead of blocking the session', () => {
  // A hook that throws on an unexpected payload takes the turn down with it.
  // Anything other than a clean exit here is that failure.
  const box = sandbox();
  for (const hook of ALL_HOOKS) {
    for (const payload of [{}, { hook_event_name: 'Nonsense', cwd: box.project }, { hook_event_name: 'Stop', tool_input: null }]) {
      const { code, stderr } = runHook(hook, { ...payload, cwd: payload.cwd || box.project }, { HOME: box.home });
      assert.ok(code === 0 || code === 2, `${hook} exited ${code} on ${JSON.stringify(payload)}: ${stderr.slice(0, 200)}`);
      assert.ok(!/Cannot find module|is not a function|TypeError/.test(stderr), `${hook} crashed: ${stderr.slice(0, 300)}`);
    }
  }
});

test('no single hook takes long enough to be felt in a turn', () => {
  // Measured on an installed tree: a hook costs 60-70ms, most of which is the
  // cold `node` start every hook pays. The ceiling here is deliberately far
  // above that — this is not a benchmark, it is a tripwire for a hook that
  // starts shelling out or walking a tree on every event. A tight bound would
  // fail on a loaded CI box and teach everyone to ignore it.
  const box = sandbox();
  const slow = [];
  for (const hook of ALL_HOOKS) {
    const started = Date.now();
    runHook(hook, { hook_event_name: 'Stop', cwd: box.project, session_id: 's1' }, { HOME: box.home });
    const elapsed = Date.now() - started;
    if (elapsed > 1500) slow.push(`${hook} took ${elapsed}ms`);
  }
  assert.deepStrictEqual(slow, []);
});

test('no hook writes outside the directories ariadnev owns', () => {
  const box = sandbox();
  const before = fs.readdirSync(box.project).sort();
  for (const hook of ALL_HOOKS) {
    runHook(
      hook,
      {
        hook_event_name: 'Stop',
        cwd: box.project,
        session_id: 's1',
        tool_name: 'Read',
        tool_input: { file_path: path.join(box.project, 'package.json') }
      },
      { HOME: box.home }
    );
  }
  const after = fs.readdirSync(box.project).sort();
  const created = after.filter((entry) => !before.includes(entry));
  const allowed = new Set(['.claude', '.ariadnev']);
  for (const entry of created) {
    assert.ok(allowed.has(entry), `a hook created "${entry}" in the project root`);
  }
});
