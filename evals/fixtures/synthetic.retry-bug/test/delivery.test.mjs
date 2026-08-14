import assert from "node:assert/strict";
import test from "node:test";
import { deliverWithRetry } from "../src/delivery.mjs";

test("does not duplicate an uncertain external effect", async () => {
  let effects = 0;
  await deliverWithRetry(async () => {
    effects += 1;
    if (effects === 1) throw new Error("acknowledgement lost");
  });
  assert.equal(effects, 1);
});
