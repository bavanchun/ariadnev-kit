import assert from "node:assert/strict";
import test from "node:test";
import { recover } from "../src/recovery.mjs";

test("does not duplicate an effect while replaying after a crash", () => {
  const effects = recover([
    { type: "effect-applied", key: "publish:42" },
    { type: "process-crashed" },
    { type: "effect-applied", key: "publish:42" },
  ]);
  assert.deepEqual(effects, ["publish:42"]);
});
