import assert from "node:assert/strict";
import test from "node:test";
import { parseArgs } from "../src/parse-args.mjs";

test("parses verbose", () => assert.deepEqual(parseArgs(["--verbose"]), { verbose: true }));
test("rejects unknown options", () => assert.throws(() => parseArgs(["--wat"]), /unknown option/));
