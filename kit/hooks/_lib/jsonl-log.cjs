// Append-only JSONL error log for av hooks. Logging must never break a hook,
// so every failure here is swallowed.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function defaultLogFile() {
  return path.join(os.homedir(), ".claude", "logs", "av-hooks.jsonl");
}

/** Append one entry as a JSON line (timestamped). Never throws. */
function logJsonl(entry, file = defaultLogFile()) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`);
  } catch {
    // fail-open: a broken log target must not surface to the harness
  }
}

module.exports = { logJsonl, defaultLogFile };
