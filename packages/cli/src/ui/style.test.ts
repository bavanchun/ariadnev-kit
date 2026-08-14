import { describe, it, expect } from "vitest";
import { shouldColor, coral, teal, faint, symbols, bar, wordmark } from "./style.js";

describe("shouldColor — precedence (red-team hardened)", () => {
  const tty = { isTTY: true };
  const pipe = { isTTY: false };

  it("non-TTY is always plain, even with FORCE_COLOR set", () => {
    expect(shouldColor({ FORCE_COLOR: "1" }, pipe)).toBe(false);
    expect(shouldColor({}, pipe)).toBe(false);
    expect(shouldColor({}, undefined)).toBe(false);
  });

  it("CI is plain even on a TTY", () => {
    expect(shouldColor({ CI: "true" }, tty)).toBe(false);
    expect(shouldColor({ CI: "true", FORCE_COLOR: "1" }, tty)).toBe(false);
  });

  it("NO_COLOR is plain on a TTY", () => {
    expect(shouldColor({ NO_COLOR: "" }, tty)).toBe(false);
    expect(shouldColor({ NO_COLOR: "1" }, tty)).toBe(false);
  });

  it("interactive TTY (and TTY+FORCE_COLOR) is colored", () => {
    expect(shouldColor({}, tty)).toBe(true);
    expect(shouldColor({ FORCE_COLOR: "1" }, tty)).toBe(true);
  });
});

describe("color fns wrap only when color:true", () => {
  it("returns the identity string when color:false", () => {
    expect(coral("x", { color: false })).toBe("x");
    expect(teal("x", { color: false })).toBe("x");
    expect(faint("x", { color: false })).toBe("x");
  });

  it("wraps in ANSI when color:true", () => {
    const out = coral("x", { color: true });
    expect(out).not.toBe("x");
    expect(out).toContain("x");
    expect(out).toContain("\x1b[");
    expect(out.endsWith("\x1b[0m")).toBe(true);
  });
});

describe("symbols match the landing matrix glyphs", () => {
  it("exposes ok/fail/warn/self/skip", () => {
    expect(symbols.ok).toBe("✓");
    expect(symbols.fail).toBe("✗");
    expect(symbols.warn).toBe("⚠");
    expect(symbols.self).toBe("◆");
    expect(symbols.skip).toBe("·");
  });
});

describe("bar", () => {
  it("renders a plain 10-wide bar with clamped fill when color:false", () => {
    expect(bar(0, { color: false })).toBe("░░░░░░░░░░");
    expect(bar(100, { color: false })).toBe("▓▓▓▓▓▓▓▓▓▓");
    expect(bar(50, { color: false })).toBe("▓▓▓▓▓░░░░░");
  });
  it("clamps out-of-range input", () => {
    expect(bar(-20, { color: false })).toBe("░░░░░░░░░░");
    expect(bar(250, { color: false })).toBe("▓▓▓▓▓▓▓▓▓▓");
  });
});

describe("wordmark", () => {
  it("is a plain '>_ ariadnev' when color:false", () => {
    expect(wordmark({ color: false })).toBe(">_ ariadnev");
  });
  it("contains the mark and ANSI when color:true", () => {
    const w = wordmark({ color: true });
    expect(w).toContain(">_");
    expect(w).toContain("ariadnev");
    expect(w).toContain("\x1b[");
  });
});
