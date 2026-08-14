import assert from "node:assert/strict";
import test from "node:test";
import { increment } from "../src/counter.mjs";

test("increments", () => assert.equal(increment(1), 2));
