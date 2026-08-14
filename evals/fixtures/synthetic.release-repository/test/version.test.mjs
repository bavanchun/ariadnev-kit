import assert from "node:assert/strict";
import test from "node:test";
import { version } from "../src/version.mjs";

test("pins the release version", () => assert.match(version, /^\d+\.\d+\.\d+$/));
