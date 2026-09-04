'use strict';

// The installed layout is `<config>/hooks/av/`, and `<config>` is only called
// `.claude` for one provider. These build the three trees a hook can wake up in
// — marked and not named `.claude`, marked and named `.claude`, and unmarked —
// and check the answer against the tree, not against a hard-coded name.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { claudeConfigDir } = require('../provider-paths.cjs');

function tree(configDirName, { marked }) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'av-provider-paths-')));
  const config = path.join(root, configDirName);
  const hooks = path.join(config, 'hooks', 'av');
  fs.mkdirSync(path.join(hooks, '_lib'), { recursive: true });
  if (marked) {
    fs.writeFileSync(
      path.join(hooks, '.ariadnev-runtime.json'),
      JSON.stringify({ schemaVersion: 1, runtime: 'codex' })
    );
  }
  return { root, config, hooks };
}

test('a marked tree resolves to its own config dir, whatever it is named', () => {
  const { config, hooks } = tree('.codex', { marked: true });
  assert.strictEqual(claudeConfigDir(hooks, '/nowhere'), config);
});

test('a marked claude tree resolves exactly where it always did', () => {
  const { config, hooks } = tree('.claude', { marked: true });
  assert.strictEqual(claudeConfigDir(hooks, '/nowhere'), config);
});

test('an unmarked tree still walks up to the directory named .claude', () => {
  const { config, hooks } = tree('.claude', { marked: false });
  assert.strictEqual(claudeConfigDir(hooks, '/nowhere'), config);
});

test('an unmarked tree with no .claude ancestor falls back to the project dir', () => {
  const { hooks } = tree('.codex', { marked: false });
  assert.strictEqual(claudeConfigDir(hooks, '/work/proj'), path.join('/work/proj', '.claude'));
});
