'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// The client reads the user config from os.homedir(), so each case runs with a
// sandbox home. Requiring the module fresh per case keeps its per-directory
// cache from carrying an earlier case's answer.
function withHome(home, fn) {
  const original = os.homedir;
  os.homedir = () => home;
  try {
    delete require.cache[require.resolve('../av-config-client.cjs')];
    return fn(require('../av-config-client.cjs'));
  } finally {
    os.homedir = original;
    delete require.cache[require.resolve('../av-config-client.cjs')];
  }
}

function sandbox(userConfig, projectConfig) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'av-hookcfg-'));
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  for (const [dir, config] of [[home, userConfig], [project, projectConfig]]) {
    fs.mkdirSync(path.join(dir, '.ariadnev'), { recursive: true });
    if (config !== undefined) {
      fs.writeFileSync(path.join(dir, '.ariadnev', 'config.json'), typeof config === 'string' ? config : JSON.stringify(config));
    }
  }
  return { root, home, project };
}

test('defaults come back when neither file exists', () => {
  const { home, project } = sandbox(undefined, undefined);
  withHome(home, (client) => {
    const prefs = client.resolvePrefs({ cwd: project });
    assert.strictEqual(prefs.privacyBlock, true);
    assert.strictEqual(prefs.paths.plans, 'plans');
    assert.strictEqual(prefs.notifications.enabled, false);
  });
});

test('a project file cannot turn off privacy blocking', () => {
  // The reason this client exists at all: it reads config files directly, so it
  // has to hold the same layer rule the CLI holds.
  const { home, project } = sandbox({}, { privacyBlock: false, trust: { enabled: true } });
  withHome(home, (client) => {
    const prefs = client.resolvePrefs({ cwd: project });
    assert.strictEqual(prefs.privacyBlock, true);
    assert.strictEqual(prefs.trust.enabled, false);
  });
});

test('a project file cannot redirect a notification destination', () => {
  const { home, project } = sandbox(
    { notifications: { enabled: true, discordWebhook: 'https://discord.com/api/webhooks/1/mine' } },
    { notifications: { discordWebhook: 'https://discord.com/api/webhooks/9/theirs' } }
  );
  withHome(home, (client) => {
    const prefs = client.resolvePrefs({ cwd: project });
    assert.strictEqual(prefs.notifications.discordWebhook, 'https://discord.com/api/webhooks/1/mine');
  });
});

test('a project file does decide the workspace-shaped keys', () => {
  const { home, project } = sandbox({ paths: { plans: 'user-plans' } }, { paths: { plans: 'repo-plans' } });
  withHome(home, (client) => {
    assert.strictEqual(client.resolvePrefs({ cwd: project }).paths.plans, 'repo-plans');
  });
});

test('a destination outside the allowlist is dropped, not passed through', () => {
  const { home, project } = sandbox(
    { notifications: { enabled: true, slackWebhook: 'https://hooks.slack.com.evil.test/x', discordWebhook: 'http://discord.com/api/webhooks/1/t' } },
    undefined
  );
  withHome(home, (client) => {
    const notifications = client.resolvePrefsSection('notifications', { cwd: project });
    assert.strictEqual(notifications.slackWebhook, null, 'a lookalike host is not the host');
    assert.strictEqual(notifications.discordWebhook, null, 'http is not https');
  });
});

test('a wrong type falls back to the default without losing the rest of the file', () => {
  const { home, project } = sandbox({ docs: { maxLoc: 'many' }, paths: { docs: 'kept' } }, undefined);
  withHome(home, (client) => {
    const prefs = client.resolvePrefs({ cwd: project });
    assert.strictEqual(prefs.docs.maxLoc, 800);
    assert.strictEqual(prefs.paths.docs, 'kept');
  });
});

test('malformed JSON never throws inside a hook', () => {
  const { home, project } = sandbox('{ not json', undefined);
  withHome(home, (client) => {
    assert.strictEqual(client.resolvePrefs({ cwd: project }).privacyBlock, true);
  });
});

test('an unknown key is ignored rather than surfacing as config', () => {
  const { home, project } = sandbox({ watch: { pollIntervalMs: 5 } }, undefined);
  withHome(home, (client) => {
    assert.strictEqual(client.resolvePrefs({ cwd: project }).watch, undefined);
  });
});

test('the generated field table is the only place the layer rule is written', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'av-config-client.cjs'), 'utf8');
  // A hard-coded key list here would be the drift this design exists to avoid.
  assert.ok(!/privacyBlock|executionPolicy|discordWebhook/.test(source.replace(/^ \*.*$/gm, '')));
  const table = require('../config-fields.generated.cjs');
  assert.strictEqual(table.fields.privacyBlock.layer, 'user');
  assert.strictEqual(table.fields['paths.plans'].layer, 'project');
});
