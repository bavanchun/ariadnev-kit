import { describe, it, expect } from "vitest";
import { extractJudgeJson, overall, flagged } from "./parse-judge.js";

describe("extractJudgeJson — tolerant of noisy LLM replies", () => {
  it("pulls the JSON object out of surrounding prose", () => {
    const raw = 'Sure! Here is my assessment:\n```json\n{"clarity": 8, "specificity": 7, "completeness": 9, "notes": "good"}\n```\nHope that helps.';
    const r = extractJudgeJson(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.scores).toEqual({ clarity: 8, specificity: 7, completeness: 9, notes: "good" });
    }
  });

  it("returns ok:false on garbage or missing fields", () => {
    expect(extractJudgeJson("no json here").ok).toBe(false);
    expect(extractJudgeJson('{"clarity": 8}').ok).toBe(false); // missing fields
    expect(extractJudgeJson('{"clarity": 99, "specificity": 5, "completeness": 5}').ok).toBe(false); // out of range
  });
});

describe("overall + flagged", () => {
  it("averages the three axes to one decimal", () => {
    expect(overall({ clarity: 8, specificity: 7, completeness: 9 })).toBe(8);
    expect(overall({ clarity: 5, specificity: 6, completeness: 4 })).toBe(5);
  });

  it("flags an overall below 6", () => {
    expect(flagged(5.9)).toBe(true);
    expect(flagged(6)).toBe(false);
    expect(flagged(9)).toBe(false);
  });
});
