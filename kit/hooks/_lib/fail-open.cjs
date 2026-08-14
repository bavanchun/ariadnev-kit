// Fail-open harness for av hooks: an internal error must never block the
// agent, so any throw is logged to JSONL and the process exits 0.
const fs = require("node:fs");
const { logJsonl } = require("./jsonl-log.cjs");

/** Run a hook body; on throw, log and exit 0 so the harness continues. */
function failOpen(hookName, fn) {
  try {
    fn();
  } catch (err) {
    logJsonl({ hook: hookName, level: "error", message: String((err && err.stack) || err) });
    process.exit(0);
  }
}

/** Read the harness stdin payload; null on malformed/missing input. */
function readStdinJson() {
  try {
    return JSON.parse(fs.readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

module.exports = { failOpen, readStdinJson };
