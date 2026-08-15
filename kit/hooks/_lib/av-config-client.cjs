/**
 * Reads ariadnev configuration from disk, inside the hook process.
 *
 * The kit this was ported from asked its CLI for preferences, because the config
 * was YAML and a hook surface with no dependencies cannot parse YAML. ariadnev's
 * config is JSON, so the spawn buys nothing and costs a cold binary start on
 * every hook of every turn — several per prompt. This module reads the two files
 * directly.
 *
 * Reading the files here means the layer rule has to hold here too: a project
 * file may set workspace keys, and may not set the keys that protect the user
 * (privacy blocking, trust, script execution policy, notification destinations).
 * The rule is not restated in this file — `config-fields.generated.cjs` is
 * generated from the same TypeScript definition the CLI resolves against, so the
 * two cannot drift into disagreeing about which key belongs to whom.
 *
 * Every failure returns defaults. A hook that cannot read config must still let
 * the session proceed.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const TABLE = require('./config-fields.generated.cjs');

const CONFIG_DIR = '.ariadnev';
const CONFIG_FILE = 'config.json';

/** Keyed by project dir: a hook is handed the session's dir, not the process's. */
const cache = new Map();

function userConfigPath() {
  return path.join(os.homedir(), CONFIG_DIR, CONFIG_FILE);
}

function projectConfigPath(cwd) {
  return path.join(cwd, CONFIG_DIR, CONFIG_FILE);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    // Absent, unreadable, or malformed all mean the same thing to a hook.
    return null;
  }
}

function getAtPath(source, dotted) {
  let node = source;
  for (const part of dotted.split('.')) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return undefined;
    node = node[part];
  }
  return node;
}

function setAtPath(target, dotted, value) {
  const parts = dotted.split('.');
  let node = target;
  for (const part of parts.slice(0, -1)) {
    if (!node[part] || typeof node[part] !== 'object' || Array.isArray(node[part])) node[part] = {};
    node = node[part];
  }
  node[parts[parts.length - 1]] = value;
}

function hostAllowed(hostname) {
  return TABLE.notificationHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

/**
 * Validate one value against its field spec. Mirrors the CLI's checkValue; the
 * shapes are simple enough that the shared generated table plus this function
 * is the whole rule.
 *
 * @returns {{ok: true, value: *}|{ok: false}}
 */
function check(spec, raw) {
  if (raw === null) return spec.default === null ? { ok: true, value: null } : { ok: false };
  switch (spec.type) {
    case 'boolean':
      return typeof raw === 'boolean' ? { ok: true, value: raw } : { ok: false };
    case 'integer':
      return typeof raw === 'number' && Number.isInteger(raw) ? { ok: true, value: raw } : { ok: false };
    case 'string[]':
      return Array.isArray(raw) && raw.every((i) => typeof i === 'string') ? { ok: true, value: raw.slice() } : { ok: false };
    case 'string':
      if (typeof raw !== 'string') return { ok: false };
      if (spec.enum && !spec.enum.includes(raw)) return { ok: false };
      return { ok: true, value: raw };
    case 'webhook': {
      if (typeof raw !== 'string') return { ok: false };
      let url;
      try {
        url = new URL(raw);
      } catch (e) {
        return { ok: false };
      }
      if (url.protocol !== 'https:') return { ok: false };
      if (!hostAllowed(url.hostname)) return { ok: false };
      return { ok: true, value: raw };
    }
    default:
      return { ok: false };
  }
}

/**
 * Resolve the configuration for one project directory.
 *
 * @param {object} [options]
 * @param {string} [options.cwd] Project dir whose config participates.
 * @returns {Object} The resolved tree. Always an object, never null.
 */
function resolvePrefs(options = {}) {
  const cwd = options.cwd || process.cwd();
  if (cache.has(cwd)) return cache.get(cwd);

  const user = readJson(userConfigPath());
  const project = readJson(projectConfigPath(cwd));
  const resolved = {};

  for (const [dotted, spec] of Object.entries(TABLE.fields)) {
    setAtPath(resolved, dotted, Array.isArray(spec.default) ? spec.default.slice() : spec.default);
    // A user-only key is read from the user file only. This is the whole point
    // of the split: the project file is not consulted for it at all.
    const layers = spec.layer === 'user' ? [user] : [project, user];
    for (const layer of layers) {
      if (!layer) continue;
      const raw = getAtPath(layer, dotted);
      if (raw === undefined) continue;
      const checked = check(spec, raw);
      if (!checked.ok) continue;
      setAtPath(resolved, dotted, checked.value);
      break;
    }
  }

  cache.set(cwd, resolved);
  return resolved;
}

/**
 * One section of the resolved config, or `{}` when it is absent or not a map.
 *
 * @param {string} name
 * @param {object} [options] Forwarded to resolvePrefs.
 * @returns {Object}
 */
function resolvePrefsSection(name, options) {
  const section = resolvePrefs(options)[name];
  return section && typeof section === 'object' && !Array.isArray(section) ? section : {};
}

/** Clear the memoised resolutions. Exposed for tests. */
function resetPrefsCache() {
  cache.clear();
}

module.exports = {
  SUPPORTED_SCHEMA_VERSION: TABLE.schemaVersion,
  userConfigPath,
  projectConfigPath,
  resolvePrefs,
  resolvePrefsSection,
  resetPrefsCache
};
