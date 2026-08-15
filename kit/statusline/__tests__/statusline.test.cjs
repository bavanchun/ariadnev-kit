'use strict';

// The statusline is a separate process the provider spawns each time it redraws
// the bar. These run it the same way: a payload on stdin, the bar read off
// stdout, in a sandbox HOME so nothing touches the machine's real state.

const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ENTRY = path.join(__dirname, '..', 'av-statusline.cjs');

function sandbox(config) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'av-statusline-'));
  fs.mkdirSync(path.join(root, 'home', '.ariadnev'), { recursive: true });
  fs.mkdirSync(path.join(root, 'project'), { recursive: true });
  if (config) {
    fs.writeFileSync(path.join(root, 'home', '.ariadnev', 'config.json'), JSON.stringify(config));
  }
  return root;
}

function render(root, payload) {
  const result = spawnSync(process.execPath, [ENTRY], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, HOME: path.join(root, 'home'), NO_COLOR: '1' },
    cwd: path.join(root, 'project'),
    timeout: 15000
  });
  return { code: result.status, out: (result.stdout || '').trimEnd(), err: result.stderr || '' };
}

const PAYLOAD = (root) => ({
  session_id: 'sess-1',
  cwd: path.join(root, 'project'),
  model: { display_name: 'Opus 5' },
  workspace: { current_dir: path.join(root, 'project') }
});

test('renders in each of the four modes, and none really means none', () => {
  const seen = {};
  for (const mode of ['full', 'compact', 'minimal', 'none']) {
    const root = sandbox({ statusline: { mode } });
    const { code, out } = render(root, PAYLOAD(root));
    assert.strictEqual(code, 0, `${mode} exited ${code}`);
    seen[mode] = out;
    fs.rmSync(root, { recursive: true, force: true });
  }
  assert.strictEqual(seen.none, '', 'none must draw nothing at all');
  for (const mode of ['full', 'compact', 'minimal']) {
    assert.ok(seen[mode].includes('Opus 5'), `${mode} should name the model`);
  }
  assert.notStrictEqual(seen.compact, seen.full, 'compact and full must differ');
  assert.notStrictEqual(seen.minimal, seen.full, 'minimal and full must differ');
});

test('an unset config renders the full bar rather than nothing', () => {
  const root = sandbox(null);
  const { code, out } = render(root, PAYLOAD(root));
  assert.strictEqual(code, 0);
  assert.ok(out.includes('Opus 5'));
  fs.rmSync(root, { recursive: true, force: true });
});

test('a mode the schema does not allow falls back instead of blanking the bar', () => {
  // The config layer drops an out-of-enum value, so what arrives here is the
  // default. Either way the bar has to draw something.
  const root = sandbox({ statusline: { mode: 'neon' } });
  const { code, out } = render(root, PAYLOAD(root));
  assert.strictEqual(code, 0);
  assert.ok(out.includes('Opus 5'));
  fs.rmSync(root, { recursive: true, force: true });
});

test('garbage on stdin never takes the session down', () => {
  // The provider redraws this constantly; a throw here must not become an error
  // the user sees on every keystroke.
  const root = sandbox(null);
  for (const payload of ['not json', '', '{}', '{"model":null}']) {
    const { code } = render(root, payload);
    assert.strictEqual(code, 0, `exited ${code} on ${JSON.stringify(payload)}`);
  }
  fs.rmSync(root, { recursive: true, force: true });
});

test('makes no network request of its own', () => {
  // Everything it shows comes from caches the hooks write. A statusline that
  // fetched would add latency to every redraw.
  const source = fs.readFileSync(ENTRY, 'utf8');
  for (const forbidden of ['require(\'https\')', 'require("https")', 'require(\'http\')', 'fetch(']) {
    assert.ok(!source.includes(forbidden), `entrypoint references ${forbidden}`);
  }
});

test('reads the nested config keys, not the flat upstream ones', () => {
  // Reading `config.statusline` as a string would mean "unset" forever against
  // this schema: the bar would ignore every setting and nothing would say so.
  const source = fs.readFileSync(ENTRY, 'utf8');
  assert.match(source, /config\.statusline\?\.mode/);
  assert.match(source, /config\.statusline\?\.quota/);
});
