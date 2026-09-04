'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// The resolver reads config through av-config-client, which looks the user
// layer up under os.homedir() and caches its answer per directory. Each case
// therefore runs against a sandbox home with both modules required fresh.
function withHome(home, fn) {
  const original = os.homedir;
  os.homedir = () => home;
  const ids = [require.resolve('../av-config-client.cjs'), require.resolve('../writing-language.cjs')];
  try {
    for (const id of ids) delete require.cache[id];
    return fn(require('../writing-language.cjs'));
  } finally {
    os.homedir = original;
    for (const id of ids) delete require.cache[id];
  }
}

function sandbox(projectConfig) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'av-writing-lang-'));
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  for (const dir of [home, project]) fs.mkdirSync(path.join(dir, '.ariadnev'), { recursive: true });
  if (projectConfig !== undefined) {
    fs.writeFileSync(path.join(project, '.ariadnev', 'config.json'), JSON.stringify(projectConfig));
  }
  return { home, project };
}

test('the module loads and answers with the default when nothing asks for a language', () => {
  const { home, project } = sandbox(undefined);
  withHome(home, (lang) => {
    const result = lang.resolveWritingLanguage({ cwd: project, env: {} });
    assert.strictEqual(result.language, 'en');
    assert.strictEqual(result.source, 'default');
    assert.strictEqual(result.fallbackReason, null);
  });
});

test('a configured response language is what human-facing prose is written in', () => {
  const { home, project } = sandbox({ locale: { responseLanguage: 'vi' } });
  withHome(home, (lang) => {
    const result = lang.resolveWritingLanguage({ cwd: project, env: {} });
    assert.strictEqual(result.language, 'vi');
    assert.strictEqual(result.source, 'config:locale.responseLanguage');
  });
});

test('the environment outranks the config, and ARIADNEV_LANGUAGE outranks the older name', () => {
  const { home, project } = sandbox({ locale: { responseLanguage: 'vi' } });
  withHome(home, (lang) => {
    assert.strictEqual(
      lang.resolveWritingLanguage({ cwd: project, env: { CK_RESPONSE_LANGUAGE: 'fr' } }).language,
      'fr'
    );
    assert.strictEqual(
      lang.resolveWritingLanguage({ cwd: project, env: { ARIADNEV_LANGUAGE: 'de', CK_RESPONSE_LANGUAGE: 'fr' } }).language,
      'de'
    );
  });
});

test('an unusable tag is reported rather than written into a PR body', () => {
  const { home, project } = sandbox(undefined);
  withHome(home, (lang) => {
    const result = lang.resolveWritingLanguage({ cwd: project, env: { ARIADNEV_LANGUAGE: 'not a tag' } });
    assert.strictEqual(result.language, 'en');
    assert.strictEqual(result.fallbackReason, 'invalid-tag');
    assert.deepStrictEqual(result.rejected.map((r) => r.source), ['env:ARIADNEV_LANGUAGE']);
  });
});

test('a rejected candidate does not stop a later one from being used', () => {
  const { home, project } = sandbox({ locale: { responseLanguage: 'ja' } });
  withHome(home, (lang) => {
    const result = lang.resolveWritingLanguage({ cwd: project, env: { ARIADNEV_LANGUAGE: '  ' } });
    assert.strictEqual(result.language, 'ja');
    assert.strictEqual(result.source, 'config:locale.responseLanguage');
  });
});
