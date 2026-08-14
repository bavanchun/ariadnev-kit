import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOwner } from "../src/owner.mjs";

test("normalizes an owner", () => assert.equal(normalizeOwner(" VChun "), "vchun"));
test("rejects an empty owner", () => assert.throws(() => normalizeOwner("  "), /owner is required/));
