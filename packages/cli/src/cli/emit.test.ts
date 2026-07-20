import { describe, it, expect, vi, afterEach } from "vitest";
import { emit, emitError, setEmitTransform, resetEmitTransform } from "./emit.js";

afterEach(() => {
  resetEmitTransform();
  vi.restoreAllMocks();
});

describe("emit boundary", () => {
  it("prints the line unchanged by default (identity transform)", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    emit("hello");
    expect(log).toHaveBeenCalledWith("hello");
  });

  it("applies a registered transform (the Phase-3 sanitize seam)", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    setEmitTransform((s) => s.replaceAll("secret", "••••"));
    emit("a secret value");
    expect(log).toHaveBeenCalledWith("a •••• value");
  });

  it("routes emitError through the same transform on stderr", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    setEmitTransform((s) => s.toUpperCase());
    emitError("oops");
    expect(err).toHaveBeenCalledWith("OOPS");
  });

  it("resetEmitTransform restores the identity transform", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    setEmitTransform(() => "X");
    resetEmitTransform();
    emit("kept");
    expect(log).toHaveBeenCalledWith("kept");
  });
});
