// Phase numbers and counts are both "a number in an argument", and sharing one
// parser between them made the first phase of every zero-indexed plan
// unaddressable: the board printed it and every mutation refused it.

import { describe, expect, it } from "vitest";
import { phaseNumber, positiveInt } from "./register-tier1-commands.js";

describe("phase number parsing", () => {
  it("accepts the first phase of a zero-indexed plan", () => {
    expect(phaseNumber("0", "phase")).toBe(0);
  });

  it("accepts later phases", () => {
    expect(phaseNumber("5", "phase")).toBe(5);
  });

  it("rejects a negative phase, a fraction, and a non-number", () => {
    for (const bad of ["-1", "1.5", "two", ""]) {
      expect(() => phaseNumber(bad, "phase")).toThrow(/phase/);
    }
  });
});

describe("count parsing", () => {
  // A limit of zero asks for nothing, which is a mistake rather than a request.
  it("still rejects zero where the number is a count", () => {
    expect(() => positiveInt("0", "--limit")).toThrow(/--limit/);
    expect(positiveInt("1", "--limit")).toBe(1);
  });
});
