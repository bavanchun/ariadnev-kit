import { describe, expect, it } from "vitest";
import { parseStrictJson } from "./strict-json.js";

describe("parseStrictJson", () => {
  it("rejects duplicate keys at every depth after decoding escapes", () => {
    for (const value of [
      '{"id":1,"id":2}',
      '{"cases":{"default":{"id":1,"id":2}}}',
      '{"routing":{"av:ask":"required","av:\\u0061sk":"forbidden"}}',
      '{"artifacts":{"answer":{},"\\u0061nswer":{}}}',
    ]) {
      expect(() => parseStrictJson(value, "fixture.json")).toThrow(/duplicate/i);
    }
  });

  it("keeps escaped strings and nested arrays valid", () => {
    expect(parseStrictJson('{"text":"brace } quote \\\"","items":[{},[true,null]]}', "fixture.json")).toEqual({
      text: 'brace } quote "',
      items: [{}, [true, null]],
    });
  });
});
