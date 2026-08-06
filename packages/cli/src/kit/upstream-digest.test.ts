import { describe, expect, it } from "vitest";
import { canonicalUpstreamDigest } from "./upstream-digest.js";

const bytes = (value: string) => new TextEncoder().encode(value);

describe("canonicalUpstreamDigest", () => {
  it("is deterministic and independent of input order", () => {
    const a = { path: "SKILL.md", content: bytes("skill") };
    const b = { path: "references/rules.md", content: bytes("rules") };
    expect(canonicalUpstreamDigest([a, b])).toBe(canonicalUpstreamDigest([b, a]));
    expect(canonicalUpstreamDigest([a, b])).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("changes when raw bytes change", () => {
    const before = canonicalUpstreamDigest([{ path: "SKILL.md", content: bytes("a\n") }]);
    const after = canonicalUpstreamDigest([{ path: "SKILL.md", content: bytes("a\r\n") }]);
    expect(after).not.toBe(before);
  });

  it("changes when a file is renamed with identical bytes", () => {
    const before = canonicalUpstreamDigest([{ path: "a.md", content: bytes("same") }]);
    const after = canonicalUpstreamDigest([{ path: "b.md", content: bytes("same") }]);
    expect(after).not.toBe(before);
  });

  it("frames paths and content so ambiguous concatenations differ", () => {
    const first = canonicalUpstreamDigest([{ path: "ab", content: bytes("c") }]);
    const second = canonicalUpstreamDigest([{ path: "a", content: bytes("bc") }]);
    expect(first).not.toBe(second);
  });

  it("includes scripts and workflows like every other authored file", () => {
    const base = [
      { path: "scripts/run.ts", content: bytes("one") },
      { path: "workflows/release.yml", content: bytes("two") },
    ];
    const changedScript = [base[0], { ...base[1], content: bytes("changed") }];
    expect(canonicalUpstreamDigest(changedScript)).not.toBe(canonicalUpstreamDigest(base));
  });

  it("normalizes separators and rejects ambiguous or unsafe paths", () => {
    const slash = canonicalUpstreamDigest([{ path: "references/a.md", content: bytes("x") }]);
    const backslash = canonicalUpstreamDigest([{ path: "references\\a.md", content: bytes("x") }]);
    expect(backslash).toBe(slash);
    expect(() => canonicalUpstreamDigest([{ path: "/a.md", content: bytes("x") }])).toThrow(/absolute/);
    expect(() => canonicalUpstreamDigest([{ path: "../a.md", content: bytes("x") }])).toThrow(/parent/);
    expect(() => canonicalUpstreamDigest([
      { path: "a\\b.md", content: bytes("x") },
      { path: "a/b.md", content: bytes("y") },
    ])).toThrow(/duplicate/);
  });
});
